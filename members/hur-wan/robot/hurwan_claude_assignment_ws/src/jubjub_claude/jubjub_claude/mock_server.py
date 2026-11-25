"""Test-only stand-in for the FastAPI /ws/robots endpoint (Confluence "로봇 - 서버" v14).
Checks the auth headers, acks hello/results (dedup by message_id), sends patrol_start
(points relative to the robot's hello position) and optionally patrol_stop / a forced
disconnect to exercise reconnect + outbox resend. Logs every message to a JSONL file."""
import argparse
import asyncio
import json
import time
import uuid
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))


def msg(type_, data, request_id=None):
    m = {'type': type_, 'message_id': str(uuid.uuid4()),
         'occurred_at': datetime.now(tz=KST).isoformat(timespec='milliseconds'), 'data': data}
    if request_id:
        m['request_id'] = request_id
    return m


def short(m):
    d = dict(m.get('data', {}))
    if 'image' in d:
        d['image'] = f'<{len(d["image"])} b64 chars>'
    return f'{m.get("type")} {json.dumps(d, ensure_ascii=False)}'


async def main_async(args):
    from websockets.asyncio.server import serve
    from websockets.exceptions import ConnectionClosed
    seen = set()
    log = open(args.log, 'a', encoding='utf-8')
    state = {'connections': 0, 'patrol_sent': False, 'dropped': False}
    offsets = json.loads(args.points)

    def record(direction, m):
        log.write(json.dumps({'t': time.time(), 'dir': direction, **m}, ensure_ascii=False) + '\n')
        log.flush()
        print(f'[{datetime.now():%H:%M:%S}] {direction} {short(m)}', flush=True)

    async def handler(ws):
        req = ws.request
        if req.path != '/ws/robots':
            await ws.close(4404, 'not found')
            return
        rid, auth = req.headers.get('X-Robot-Id'), req.headers.get('Authorization', '')
        if rid != str(args.robot_id) or auth != f'Bearer {args.token}':
            print(f'auth failed robot_id={rid}', flush=True)
            await ws.close(4401, 'auth failed')
            return
        state['connections'] += 1
        conn_no = state['connections']
        print(f'robot {rid} connected (connection #{conn_no})', flush=True)
        hello_pos = None

        async def scenario():
            await asyncio.sleep(args.start_delay)
            if not state['patrol_sent'] and hello_pos is not None:
                hx, hy = hello_pos['x'], hello_pos['y']
                pts = [{'seq': i, 'x': round(hx + dx, 3), 'y': round(hy + dy, 3)} for i, (dx, dy) in enumerate(offsets)]
                m = msg('patrol_start', {'patrol_id': args.patrol_id, 'home': {'x': hx, 'y': hy}, 'points': pts})
                state['patrol_sent'] = True
                record('->', m)
                await ws.send(json.dumps(m))
            if args.drop_after > 0 and not state['dropped']:
                await asyncio.sleep(args.drop_after)
                state['dropped'] = True
                print('*** forcing a disconnect (1011) to test reconnect/outbox ***', flush=True)
                await ws.close(1011, 'test drop')
                return
            if args.stop_after > 0:
                await asyncio.sleep(args.stop_after)
                m = msg('patrol_stop', {'patrol_id': args.patrol_id})
                record('->', m)
                await ws.send(json.dumps(m))

        task = None
        try:
            async for raw in ws:
                m = json.loads(raw)
                record('<-', m)
                t = m.get('type')
                if t == 'hello':
                    hello_pos = m['data'].get('position')
                    a = msg('ack', {'result': 'ok'}, m['message_id'])
                    await ws.send(json.dumps(a))
                    if task is None:
                        task = asyncio.create_task(scenario())
                elif t in ('point_arrived', 'patrol_end', 'detection', 'pick_result', 'error'):
                    dup = m['message_id'] in seen
                    seen.add(m['message_id'])
                    if dup:
                        print(f'   (duplicate {m["message_id"][:8]} -> ack only)', flush=True)
                    await ws.send(json.dumps(msg('ack', {'result': 'ok'}, m['message_id'])))
        except ConnectionClosed:
            pass
        finally:
            if task:
                task.cancel()
            print(f'connection #{conn_no} closed', flush=True)

    async with serve(handler, args.host, args.port, max_size=16 * 1024 * 1024):
        print(f'mock server on ws://{args.host}:{args.port}/ws/robots', flush=True)
        await asyncio.Future()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--robot-id', type=int, default=1)
    ap.add_argument('--token', default='test-token')
    ap.add_argument('--patrol-id', type=int, default=7)
    ap.add_argument('--points', default='[[1.0, 0.0], [1.0, 0.8], [0.0, 0.8]]',
                    help='JSON list of [dx, dy] offsets from the robot hello position')
    ap.add_argument('--start-delay', type=float, default=3.0)
    ap.add_argument('--stop-after', type=float, default=0.0)
    ap.add_argument('--drop-after', type=float, default=0.0)
    ap.add_argument('--log', default='/tmp/claude_mock_server.jsonl')
    args, _ = ap.parse_known_args()
    try:
        asyncio.run(main_async(args))
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
