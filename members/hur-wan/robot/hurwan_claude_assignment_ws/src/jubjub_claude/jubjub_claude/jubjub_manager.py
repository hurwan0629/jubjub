"""Mission manager (state machine) for one JUBJUB patrol, following the Confluence
"로봇 - 서버" rules (v14): start at the recycling station (home), visit points in order,
retry a blocked point once then skip it, 2 consecutive skips -> path_blocked (return),
pick each chosen trash once (retry once), 3 consecutive pick failures -> pick_failed_repeatedly
(return), patrol_stop -> finish the current pick then return.

The manager never talks to the server format and never commands motors: it only uses the
navigate_to action (nav_adapter) and the pick_and_store action (arm_ik)."""
import math
import uuid

import rclpy
from action_msgs.msg import GoalStatus
from geometry_msgs.msg import Point, PointStamped, Pose2D, PoseStamped
from rclpy.action import ActionClient
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, qos_profile_sensor_data
from sensor_msgs.msg import CameraInfo, CompressedImage, LaserScan
from std_msgs.msg import Bool, UInt16
from std_srvs.srv import Trigger

from jubjub_claude.common import quaternion_to_yaw, yaw_to_quaternion
from jubjub_claude_interfaces.action import NavigateTo, PickAndStore
from jubjub_claude_interfaces.msg import RobotEvent, RobotStatus, TrashTrackArray
from jubjub_claude_interfaces.srv import PatrolCommand


class JubjubManager(Node):
    def __init__(self):
        super().__init__('claude_jubjub_manager')
        p = self.declare_parameter
        p('global_frame', 'odom')
        p('retry_wait_s', 2.0)
        p('max_consecutive_skips', 2)          # Confluence 4-2
        p('max_consecutive_pick_failures', 3)  # Confluence 4-5
        p('pick_enabled', True)
        p('pick_classes', ['general', 'plastic', 'can', 'glass'])
        p('max_target_distance_m', 2.5)
        p('approach_standoff_m', 0.20)          # arm reach on the floor is ~0.12-0.24 m from joint1
        p('min_pick_confidence', 0.5)
        p('sandbox_virtual_base', True)         # express pick target relative to the VIRTUAL robot
        p('device_timeout_s', 5.0)
        p('watch_devices', ['camera', 'lidar'])  # device_failure if one is silent while working
        p('low_battery_v', 0.0)                 # 0 = disabled (threshold undecided in Confluence 7)

        self.state, self.phase = 'idle', 'idle'
        self.patrol_id, self.home, self.points = -1, None, []
        self.idx = 0
        self.retried = False
        self.skips = 0
        self.pick_failures = 0
        self.stop_requested = False
        self.end_result = None
        self.last_error = ''
        self.nav_gh = None
        self.nav_pending = False
        self.after_cancel = None
        self.target = None          # dict(track, detection_id, attempts)
        self.handled_tracks = set()
        self.tracks = []
        self.vpose = None
        self.jpeg = None
        self.last_seen = {'camera': None, 'lidar': None}
        self.battery_v = None
        self.retry_timer = None

        self.nav = ActionClient(self, NavigateTo, 'navigate_to')
        self.pick = ActionClient(self, PickAndStore, 'pick_and_store')
        reliable = QoSProfile(depth=100, reliability=ReliabilityPolicy.RELIABLE)
        self.event_pub = self.create_publisher(RobotEvent, '/jubjub/robot_event', reliable)
        self.status_pub = self.create_publisher(RobotStatus, '/jubjub/robot_status', 10)
        self.create_service(PatrolCommand, 'patrol_command', self.on_command)
        self.create_service(Trigger, 'reset_error', self.on_reset)
        self.create_subscription(TrashTrackArray, '/jubjub/tracks', self.on_tracks, 10)
        self.create_subscription(PoseStamped, '/jubjub/virtual_pose', self.on_vpose, 10)
        self.create_subscription(CompressedImage, '/depth_cam/rgb/image_raw/compressed', self.on_jpeg,
                                 qos_profile_sensor_data)
        self.create_subscription(CameraInfo, '/depth_cam/rgb/camera_info', lambda _m: self.seen('camera'), 10)
        self.create_subscription(LaserScan, '/scan', lambda _m: self.seen('lidar'), qos_profile_sensor_data)
        self.create_subscription(UInt16, '/ros_robot_controller/battery', self.on_battery, 10)
        self.create_subscription(Bool, '/jubjub/server_connected', self.on_link, 10)
        self.create_timer(0.5, self.tick)
        self.get_logger().info('manager ready (idle)')

    # ------------------------------------------------------------------ inputs
    def seen(self, key):
        self.last_seen[key] = self.get_clock().now()

    def on_tracks(self, msg):
        self.tracks = msg.tracks

    def on_vpose(self, msg):
        self.vpose = Pose2D(x=msg.pose.position.x, y=msg.pose.position.y,
                            theta=quaternion_to_yaw(msg.pose.orientation))

    def on_jpeg(self, msg):
        if msg.format.lower().find('jpeg') >= 0 or msg.format.lower().find('jpg') >= 0:
            self.jpeg = msg

    def on_battery(self, msg):
        self.battery_v = msg.data / 1000.0

    def on_link(self, msg):
        self.get_logger().info(f'server link {"up" if msg.data else "DOWN"} (patrol continues; results queued)')

    # ------------------------------------------------------------------ events/status
    def emit(self, type_, **kw):
        ev = RobotEvent()
        ev.type = type_
        ev.stamp = self.get_clock().now().to_msg()
        ev.patrol_id = self.patrol_id
        for k, v in kw.items():
            setattr(ev, k, v)
        self.event_pub.publish(ev)
        brief = {k: v for k, v in kw.items() if k != 'image'}
        self.get_logger().info(f'EVENT {type_} {brief}')

    def set_phase(self, state, phase):
        if (state, phase) != (self.state, self.phase):
            self.get_logger().info(f'[{self.state}/{self.phase}] -> [{state}/{phase}]')
        self.state, self.phase = state, phase

    def publish_status(self):
        if self.vpose is None:
            # Do not report a fake (0,0) pose: the bridge waits for the first status before hello.
            self.get_logger().warn('waiting for /jubjub/virtual_pose before publishing status',
                                   throttle_duration_sec=5.0)
            return
        s = RobotStatus()
        s.header.stamp = self.get_clock().now().to_msg()
        s.header.frame_id = self.get_parameter('global_frame').value
        s.state, s.phase, s.patrol_id = self.state, self.phase, self.patrol_id
        s.current_seq = self.idx if self.state in ('working', 'returning') and self.idx < len(self.points) else -1
        s.total_points = len(self.points)
        if self.vpose is not None:
            s.pose = self.vpose
        s.last_error = self.last_error
        self.status_pub.publish(s)

    # ------------------------------------------------------------------ commands
    def on_command(self, req, res):
        if req.command == 'patrol_start':
            if self.state != 'idle':
                res.accepted, res.reason = False, 'error_state' if self.state == 'error' else 'already_working'
                return res
            self.patrol_id = req.patrol_id
            self.home = (req.home.x, req.home.y)
            self.points = [(pt.x, pt.y) for pt in req.points]
            self.idx, self.retried, self.skips, self.pick_failures = 0, False, 0, 0
            self.stop_requested, self.end_result, self.target = False, None, None
            self.handled_tracks.clear()
            res.accepted = True
            self.get_logger().info(f'patrol {self.patrol_id} accepted: home={self.home} points={self.points}')
            self.set_phase('working', 'to_point')
            self.next_leg()
            return res
        if req.command == 'patrol_stop':
            if self.state not in ('working', 'returning') or req.patrol_id != self.patrol_id:
                res.accepted, res.reason = False, 'not_working'
                return res
            res.accepted = True
            if self.state == 'returning':
                return res
            self.stop_requested = True
            if self.phase == 'picking':
                self.get_logger().info('stop requested: finishing current pick first')
            else:
                self.go_home('stopped')
            return res
        res.accepted, res.reason = False, 'invalid'
        return res

    def on_reset(self, _req, res):
        if self.state != 'error':
            res.success, res.message = False, f'state is {self.state}'
            return res
        self.set_phase('idle', 'idle')
        self.patrol_id, self.points, self.last_error = -1, [], ''
        res.success, res.message = True, 'error cleared -> idle'
        return res

    # ------------------------------------------------------------------ navigation helpers
    def send_nav(self, x, y, yaw, done_cb, what):
        g = NavigateTo.Goal()
        g.goal.header.frame_id = self.get_parameter('global_frame').value
        g.goal.header.stamp = self.get_clock().now().to_msg()
        g.goal.pose.position.x, g.goal.pose.position.y = float(x), float(y)
        g.goal.pose.orientation = yaw_to_quaternion(yaw)
        if not self.nav.server_is_ready():
            self.get_logger().error('navigate_to server not ready')
            done_cb(False, 'nav_unavailable')
            return
        self.get_logger().info(f'nav -> {what} ({x:.2f},{y:.2f})')
        self.nav_pending = True
        fut = self.nav.send_goal_async(g)

        def on_accept(f):
            gh = f.result()
            if not gh.accepted:
                self.nav_pending = False
                done_cb(False, 'rejected')
                return
            self.nav_gh = gh
            gh.get_result_async().add_done_callback(on_result)
            if self.after_cancel is not None:   # cancel was requested before the goal was accepted
                gh.cancel_goal_async()

        def on_result(f):
            self.nav_gh, self.nav_pending = None, False
            r = f.result()
            if r.status == GoalStatus.STATUS_CANCELED:
                done_cb(None, 'canceled')
            else:
                done_cb(r.status == GoalStatus.STATUS_SUCCEEDED and r.result.success, r.result.reason)
            then, self.after_cancel = self.after_cancel, None
            if then is not None:
                then()
        fut.add_done_callback(on_accept)

    def heading_to(self, x, y):
        if self.vpose is None:
            return 0.0
        return math.atan2(y - self.vpose.y, x - self.vpose.x)

    def cancel_nav(self, then=None):
        """Cancel the active goal; run `then` only after the adapter has really finished it
        (the adapter rejects a new goal while the old one is still active)."""
        if self.nav_gh is None and not self.nav_pending:
            if then is not None:
                then()
            return
        self.after_cancel = then
        if self.nav_gh is not None:
            self.nav_gh.cancel_goal_async()

    # ------------------------------------------------------------------ patrol legs
    def next_leg(self):
        if self.idx >= len(self.points):
            self.go_home('completed')
            return
        x, y = self.points[self.idx]
        self.set_phase('working', 'to_point')
        self.send_nav(x, y, self.heading_to(x, y), self.on_point_result, f'point seq={self.idx}')

    def on_point_result(self, ok, reason):
        if self.phase != 'to_point':
            return
        if ok is None:   # canceled on purpose (detection / stop); the canceller continues the flow
            return
        if ok:
            self.emit('point_arrived', seq=self.idx, result='arrived')
            self.skips, self.retried = 0, False
            self.idx += 1
            self.next_leg()
            return
        if not self.retried:
            self.retried = True
            self.set_phase('working', 'retry_wait')
            wait = float(self.get_parameter('retry_wait_s').value)
            self.get_logger().warn(f'point seq={self.idx} failed ({reason}); retry in {wait:.0f}s')
            self.retry_timer = self.create_timer(wait, self.on_retry)
            return
        self.emit('point_arrived', seq=self.idx, result='skipped', reason='blocked')
        self.skips += 1
        self.retried = False
        self.idx += 1
        if self.skips >= int(self.get_parameter('max_consecutive_skips').value):
            self.raise_error('path_blocked', returning=True, detail=f'{self.skips} consecutive points skipped')
            return
        self.next_leg()

    def on_retry(self):
        self.retry_timer.cancel()
        self.destroy_timer(self.retry_timer)
        if self.state == 'working' and self.phase == 'retry_wait':
            x, y = self.points[self.idx]
            self.set_phase('working', 'to_point')
            self.send_nav(x, y, self.heading_to(x, y), self.on_point_result, f'point seq={self.idx} (retry)')

    def go_home(self, end_result, retried=False):
        self.end_result = end_result
        state = 'working' if end_result == 'completed' else 'returning'
        self.set_phase(state, 'to_home')
        hx, hy = self.home
        self.cancel_nav(then=lambda: self.send_nav(
            hx, hy, self.heading_to(hx, hy), lambda ok, r: self.on_home_result(ok, r, retried), 'home'))

    def on_home_result(self, ok, reason, retried):
        if self.phase != 'to_home':
            return
        if ok:
            self.emit('patrol_end', result=self.end_result)
            self.set_phase('idle', 'idle')
            self.patrol_id, self.points = -1, []
            return
        if ok is None:
            return
        if not retried:
            self.get_logger().warn(f'return home failed ({reason}); retrying once')
            self.go_home(self.end_result, retried=True)
            return
        self.raise_error('return_failed', returning=False, detail=reason)

    def raise_error(self, code, returning, detail=''):
        x, y = (self.vpose.x, self.vpose.y) if self.vpose else (0.0, 0.0)
        self.last_error = code
        self.emit('error', code=code, action='returning' if returning else 'stopped', x=x, y=y, detail=detail)
        if returning:
            self.go_home('aborted')
        else:
            self.set_phase('error', 'stopped')
            self.cancel_nav()

    # ------------------------------------------------------------------ trash handling
    def choose_target(self):
        if not self.get_parameter('pick_enabled').value or self.vpose is None:
            return None
        classes = set(self.get_parameter('pick_classes').value)
        maxd = float(self.get_parameter('max_target_distance_m').value)
        minc = float(self.get_parameter('min_pick_confidence').value)
        best, best_d = None, maxd
        for t in self.tracks:
            if not t.stable or t.track_id in self.handled_tracks or t.class_name not in classes or t.confidence < minc:
                continue
            d = math.dist((t.position.x, t.position.y), (self.vpose.x, self.vpose.y))
            if d < best_d:
                best, best_d = t, d
        return best

    def start_target(self, track):
        self.handled_tracks.add(track.track_id)
        det_id = str(uuid.uuid4())
        self.target = {'track': track, 'detection_id': det_id, 'attempts': 0}
        img = self.jpeg if self.jpeg is not None else CompressedImage()
        self.emit('detection', detection_id=det_id, material=track.class_name, confidence=float(track.confidence),
                  x=self.vpose.x, y=self.vpose.y, image=img)
        tx, ty = track.position.x, track.position.y
        yaw = math.atan2(ty - self.vpose.y, tx - self.vpose.x)
        s = float(self.get_parameter('approach_standoff_m').value)
        ax, ay = tx - s * math.cos(yaw), ty - s * math.sin(yaw)
        self.target['approach'] = Pose2D(x=ax, y=ay, theta=yaw)
        self.set_phase('working', 'approaching')
        self.cancel_nav(then=lambda: self.send_nav(
            ax, ay, yaw, self.on_approach_result, f'approach track {track.track_id}'))

    def on_approach_result(self, ok, reason):
        if self.phase != 'approaching':
            return
        if ok:
            self.do_pick()
        elif ok is not None:
            self.finish_pick(False, 'unreachable')

    def do_pick(self):
        t = self.target['track']
        self.target['attempts'] += 1
        g = PickAndStore.Goal()
        g.material = t.class_name
        if self.get_parameter('sandbox_virtual_base').value:
            # Target relative to the virtual robot standing at the approach pose. Use the commanded
            # approach pose, not /jubjub/virtual_pose (5 Hz, may still hold the pre-turn heading).
            ap = self.target['approach']
            dx, dy = t.position.x - ap.x, t.position.y - ap.y
            c, s = math.cos(-ap.theta), math.sin(-ap.theta)
            g.target = PointStamped()
            g.target.header.frame_id = 'base_footprint'
            g.target.point = Point(x=c * dx - s * dy, y=s * dx + c * dy, z=max(0.0, t.position.z))
        else:
            g.target = PointStamped()
            g.target.header.frame_id = self.get_parameter('global_frame').value
            g.target.point = t.position
        self.set_phase('working', 'picking')
        if not self.pick.server_is_ready():
            self.finish_pick(False, 'arm_unavailable')
            return

        def on_accept(f):
            gh = f.result()
            if not gh.accepted:
                self.finish_pick(False, 'arm_rejected')
                return
            gh.get_result_async().add_done_callback(on_result)

        def on_result(f):
            r = f.result().result
            if r.success:
                self.finish_pick(True, '')
            elif r.reason == 'grasp_failed' and self.target['attempts'] < 2:
                self.get_logger().warn('grasp failed, retrying once')
                self.do_pick()
            else:
                self.finish_pick(False, r.reason or 'grasp_failed')
        self.pick.send_goal_async(g).add_done_callback(on_accept)

    def finish_pick(self, ok, reason):
        det = self.target['detection_id']
        self.target = None
        if ok:
            self.emit('pick_result', detection_id=det, result='collected')
            self.pick_failures = 0
        else:
            self.emit('pick_result', detection_id=det, result='failed', reason=reason)
            self.pick_failures += 1
            if self.pick_failures >= int(self.get_parameter('max_consecutive_pick_failures').value):
                self.raise_error('pick_failed_repeatedly', returning=True,
                                 detail=f'{self.pick_failures} different targets failed')
                return
        if self.stop_requested:
            self.go_home('stopped')
        else:
            self.retried = False
            self.next_leg()   # resume the same point

    # ------------------------------------------------------------------ periodic
    def tick(self):
        self.publish_status()
        if self.state != 'working':
            return
        now = self.get_clock().now()
        timeout = float(self.get_parameter('device_timeout_s').value)
        watched = set(self.get_parameter('watch_devices').value)
        for dev, t in self.last_seen.items():
            if dev not in watched:
                continue
            if t is None or (now - t).nanoseconds * 1e-9 > timeout:
                self.raise_error('device_failure', returning=False, detail=f'{dev} silent > {timeout:.0f}s')
                return
        low = float(self.get_parameter('low_battery_v').value)
        if low > 0 and self.battery_v is not None and self.battery_v < low:
            self.raise_error('low_battery', returning=True, detail=f'battery_voltage={self.battery_v:.2f}')
            return
        if self.phase == 'to_point' and not self.stop_requested:
            t = self.choose_target()
            if t is not None:
                self.start_target(t)


def main():
    rclpy.init()
    node = JubjubManager()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
    main()
