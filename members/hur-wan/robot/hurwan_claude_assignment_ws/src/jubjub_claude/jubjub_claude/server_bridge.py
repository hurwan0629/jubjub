"""Robot -> FastAPI WebSocket bridge implementing Confluence "로봇 - 서버" v14 and
server/ROBOT_PROTOCOL_API.md (dev): header auth, hello -> ack -> resend stored results,
status every 3 s (no ack), command acks, exponential reconnect (1..30 s), close codes
4401 (auth) / 4001 (replaced) stop reconnecting. Results are kept in a JSON outbox file
until the server acks them, so they survive disconnects and restarts.

rclpy spins in a background thread; the WebSocket runs on asyncio in the main thread."""
import asyncio
import base64
import json
import os
import threading
import time
import uuid

import rclpy
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy
from std_msgs.msg import Bool, UInt16

from jubjub_claude.common import now_iso, ros_time_to_iso
from jubjub_claude_interfaces.msg import RobotEvent, RobotStatus
from jubjub_claude_interfaces.srv import PatrolCommand

NO_RECONNECT = {4401: 'auth failed', 4001: 'replaced by a newer connection'}


def make_message(type_, data, request_id=None, occurred_at=None):
    m = {'type': type_, 'message_id': str(uuid.uuid4()), 'occurred_at': occurred_at or now_iso(), 'data': data}
    if request_id is not None:
        m['request_id'] = request_id
    return m


def event_to_message(ev: RobotEvent):
    pid = None if ev.patrol_id < 0 else int(ev.patrol_id)
    t = ev.type
    if t == 'point_arrived':
        data = {'patrol_id': pid, 'seq': int(ev.seq), 'result': ev.result}
        if ev.result == 'skipped':
            data['reason'] = ev.reason or 'blocked'
    elif t == 'patrol_end':
        data = {'patrol_id': pid, 'result': ev.result}
    elif t == 'detection':
        data = {'detection_id': ev.detection_id, 'patrol_id': pid, 'material': ev.material,
                'confidence': round(float(ev.confidence), 3), 'position': {'x': round(ev.x, 3), 'y': round(ev.y, 3)},
                'image': base64.b64encode(bytes(ev.image.data)).decode('ascii')}
    elif t == 'pick_result':
        data = {'detection_id': ev.detection_id, 'patrol_id': pid, 'result': ev.result}
        if ev.result == 'failed':
            data['reason'] = ev.reason or 'grasp_failed'
    elif t == 'error':
        data = {'code': ev.code, 'patrol_id': pid, 'action': ev.action,
                'position': {'x': round(ev.x, 3), 'y': round(ev.y, 3)}, 'detail': ev.detail}
    else:
        return None
    return make_message(t, data, occurred_at=ros_time_to_iso(ev.stamp))


class Outbox:
    """Ordered, file-backed queue of result messages waiting for a server ack."""

    def __init__(self, path):
        self.path = os.path.expanduser(path)
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        self.lock = threading.Lock()
        self.items = []
        if os.path.exists(self.path):
            try:
                with open(self.path, encoding='utf-8') as f:
                    self.items = json.load(f)
            except (OSError, ValueError):
                self.items = []

    def _save(self):
        tmp = self.path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(self.items, f)
        os.replace(tmp, self.path)

    def push(self, msg):
        with self.lock:
            self.items.append(msg)
            self._save()

    def snapshot(self):
        with self.lock:
            return list(self.items)

    def remove(self, message_id):
        with self.lock:
            self.items = [m for m in self.items if m['message_id'] != message_id]
            self._save()

    def __len__(self):
        with self.lock:
            return len(self.items)


class BridgeNode(Node):
    def __init__(self):
        super().__init__('claude_server_bridge')
        self.declare_parameter('server_url', 'ws://127.0.0.1:8765/ws/robots')
        self.declare_parameter('robot_id', 1)
        self.declare_parameter('token', '')     # or env JUBJUB_ROBOT_TOKEN; never logged
        self.declare_parameter('outbox_path', '~/.jubjub_claude/outbox.json')
        self.declare_parameter('status_period_s', 3.0)
        self.declare_parameter('ack_timeout_s', 10.0)
        self.status = None
        self.battery_v = None
        self.outbox = Outbox(self.get_parameter('outbox_path').value)
        self.wakeup = None   # asyncio.Event, set from ROS thread
        self.loop = None
        reliable = QoSProfile(depth=100, reliability=ReliabilityPolicy.RELIABLE)
        self.create_subscription(RobotEvent, '/jubjub/robot_event', self.on_event, reliable)
        self.create_subscription(RobotStatus, '/jubjub/robot_status', self.on_status, 10)
        self.create_subscription(UInt16, '/ros_robot_controller/battery', self.on_battery, 10)
        self.link_pub = self.create_publisher(Bool, '/jubjub/server_connected', 10)
        self.cmd = self.create_client(PatrolCommand, 'patrol_command')

    def on_status(self, msg):
        self.status = msg

    def on_battery(self, msg):
        self.battery_v = round(msg.data / 1000.0, 2)

    def on_event(self, ev):
        m = event_to_message(ev)
        if m is None:
            return
        self.outbox.push(m)
        self.get_logger().info(f'queued {m["type"]} ({len(self.outbox)} waiting for ack)')
        if self.loop is not None and self.wakeup is not None:
            self.loop.call_soon_threadsafe(self.wakeup.set)

    def state_data(self):
        s = self.status
        state = s.state if s else 'idle'
        pid = int(s.patrol_id) if s and s.patrol_id >= 0 and state in ('working', 'returning') else None
        pos = {'x': round(s.pose.x, 3), 'y': round(s.pose.y, 3), 'yaw': round(s.pose.theta, 3)} if s else \
            {'x': 0.0, 'y': 0.0, 'yaw': 0.0}
        return {'state': state, 'patrol_id': pid, 'position': pos, 'battery_voltage': self.battery_v}

    def set_link(self, up):
        self.link_pub.publish(Bool(data=up))


class Session:
    def __init__(self, node: BridgeNode, ws):
        self.node, self.ws = node, ws
        self.pending = {}   # message_id -> Future(ack data)
        self.log = node.get_logger()

    async def send(self, msg):
        await self.ws.send(json.dumps(msg, ensure_ascii=False))

    async def request(self, msg):
        fut = asyncio.get_running_loop().create_future()
        self.pending[msg['message_id']] = fut
        await self.send(msg)
        try:
            return await asyncio.wait_for(fut, float(self.node.get_parameter('ack_timeout_s').value))
        finally:
            self.pending.pop(msg['message_id'], None)

    async def receiver(self):
        async for raw in self.ws:
            try:
                msg = json.loads(raw)
            except ValueError:
                self.log.warn('non-JSON message from server')
                continue
            t = msg.get('type')
            if t == 'ack':
                fut = self.pending.get(msg.get('request_id'))
                if fut and not fut.done():
                    fut.set_result(msg.get('data', {}))
            elif t in ('patrol_start', 'patrol_stop'):
                asyncio.create_task(self.handle_command(msg))
            elif 'code' in msg and 'status' in msg:
                self.log.error(f'server error: {msg.get("code")} {msg.get("message")}')
            else:
                self.log.warn(f'unknown message type {t}')

    async def handle_command(self, msg):
        d = msg.get('data', {})
        req = PatrolCommand.Request()
        req.command = msg['type']
        req.patrol_id = int(d.get('patrol_id', -1))
        if req.command == 'patrol_start':
            home = d.get('home', {})
            req.home.x, req.home.y = float(home.get('x', 0.0)), float(home.get('y', 0.0))
            pts = sorted(d.get('points', []), key=lambda p: p.get('seq', 0))
            for p in pts:
                req.points.append(type(req.home)(x=float(p['x']), y=float(p['y'])))
        accepted, reason = False, 'manager_unavailable'
        if self.node.cmd.wait_for_service(timeout_sec=1.0):
            fut = self.node.cmd.call_async(req)
            t0 = time.monotonic()
            while not fut.done() and time.monotonic() - t0 < 5.0:
                await asyncio.sleep(0.02)
            if fut.done():
                accepted, reason = fut.result().accepted, fut.result().reason
        data = {'result': 'accepted' if accepted else 'rejected'}
        if not accepted:
            data['reason'] = reason
        await self.send(make_message('ack', data, request_id=msg.get('message_id')))
        self.log.info(f'{msg["type"]} patrol_id={req.patrol_id} -> {data}')

    async def status_loop(self):
        period = float(self.node.get_parameter('status_period_s').value)
        while True:
            await asyncio.sleep(period)
            await self.send(make_message('status', self.node.state_data()))

    async def flush_loop(self):
        while True:
            for m in self.node.outbox.snapshot():
                try:
                    ack = await self.request(m)
                except asyncio.TimeoutError:
                    self.log.warn(f'no ack for {m["type"]} {m["message_id"][:8]}; will resend')
                    break
                if ack.get('result') == 'ok':
                    self.node.outbox.remove(m['message_id'])
                    self.log.info(f'acked {m["type"]} ({len(self.node.outbox)} left)')
                else:
                    self.log.warn(f'unexpected ack {ack} for {m["type"]}; keeping it')
                    break
            self.node.wakeup.clear()
            try:
                await asyncio.wait_for(self.node.wakeup.wait(), 5.0)
            except asyncio.TimeoutError:
                pass

    async def run(self):
        recv = asyncio.create_task(self.receiver())
        hello = dict(self.node.state_data(), pending_count=len(self.node.outbox))
        ack = await self.request(make_message('hello', hello))
        self.log.info(f'hello acked {ack}; resending {hello["pending_count"]} stored results')
        self.node.set_link(True)
        tasks = [recv, asyncio.create_task(self.status_loop()), asyncio.create_task(self.flush_loop())]
        try:
            # receiver ends (or raises) when the socket closes -> leave and reconnect
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for t in done:
                t.result()
        finally:
            for t in tasks:
                t.cancel()


async def ws_main(node: BridgeNode):
    from websockets.asyncio.client import connect
    from websockets.exceptions import ConnectionClosed, InvalidStatus
    node.loop = asyncio.get_running_loop()
    node.wakeup = asyncio.Event()
    url = node.get_parameter('server_url').value
    token = node.get_parameter('token').value or os.environ.get('JUBJUB_ROBOT_TOKEN', '')
    headers = {'X-Robot-Id': str(node.get_parameter('robot_id').value), 'Authorization': f'Bearer {token}'}
    log = node.get_logger()
    # hello must carry the real state/position, so wait for the manager's first status.
    for _ in range(100):
        if node.status is not None:
            break
        await asyncio.sleep(0.1)
    if node.status is None:
        log.warn('no /jubjub/robot_status after 10s; hello will report idle at (0,0)')
    backoff = 1.0
    while rclpy.ok():
        try:
            log.info(f'connecting {url} (robot_id={headers["X-Robot-Id"]}, token={"set" if token else "EMPTY"})')
            async with connect(url, additional_headers=headers, open_timeout=10,
                               ping_interval=20, ping_timeout=20, max_size=16 * 1024 * 1024) as ws:
                backoff = 1.0
                await Session(node, ws).run()
        except ConnectionClosed as e:
            code = e.rcvd.code if e.rcvd else None
            if code in NO_RECONNECT:
                log.error(f'closed with {code} ({NO_RECONNECT[code]}); not reconnecting')
                node.set_link(False)
                return
            log.warn(f'connection closed (code={code})')
        except InvalidStatus as e:
            status = e.response.status_code
            log.error(f'handshake rejected HTTP {status}')
            if status in (401, 403):
                node.set_link(False)
                return
        except (OSError, asyncio.TimeoutError) as e:
            log.warn(f'connect failed: {e}')
        node.set_link(False)
        log.info(f'reconnect in {backoff:.0f}s ({len(node.outbox)} results stored)')
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, 30.0)


def main():
    rclpy.init()
    node = BridgeNode()
    ex = MultiThreadedExecutor(num_threads=2)
    ex.add_node(node)
    th = threading.Thread(target=ex.spin, daemon=True)
    th.start()
    try:
        asyncio.run(ws_main(node))
    except KeyboardInterrupt:
        pass
    finally:
        ex.shutdown()
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
    main()
