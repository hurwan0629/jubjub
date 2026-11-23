"""로봇 시뮬레이터: 실제 로봇(JetRover) 없이 서버의 /ws/robots 연결을 시험해요.

Confluence "로봇 - 서버" 문서의 연결 단계만 흉내 내요.
  1. 헤더에 로봇 id와 토큰을 넣어 접속
  2. hello를 보내고 서버 ack를 기다림
  3. 3초마다 status 보내기 (위치·배터리는 가짜 값)
  4. 서버 명령(patrol_start 등)이 오면 "아직 지원 안 함"으로 거절 ack
  5. 끊기면 1초 → 2초 → 4초 … 최대 30초 간격으로 재접속
     - 인증 실패(403)거나 "교체됨"(4001)·"토큰 재발급"(4003)·인증 만료(4401)로 닫히면 재접속하지 않고 멈춤

ROS는 쓰지 않아요. 로봇(Ubuntu 22.04, Python 3.10)에서도 돌도록 3.10 문법만 써요. hurwan 브랜치 robot/test_server/client_script/client6 의 WebSocket 구조를 참고했고,
실제 로봇에서는 이 파일의 가짜 상태 부분만 ROS 토픽(위치·배터리) 값으로 바꾸면 돼요.

실행 (websockets 라이브러리 필요. 서버 가상환경에 이미 있어요):
    python robot/simulator/robot_sim.py --robot-id 1 --token <발급받은 토큰>
    python robot/simulator/robot_sim.py --server ws://192.168.0.10:8000/ws/robots --robot-id 1 --token ...
토큰은 환경 변수 ROBOT_ID, ROBOT_TOKEN 으로 넣어도 돼요.
"""

import argparse
import asyncio
import json
import math
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed, InvalidStatus

KST = timezone(timedelta(hours=9))

# 서버(server/app/services/robot_connections.py, routers/robot_protocol.py)가 쓰는 종료 코드
CLOSE_REPLACED = 4001  # 같은 로봇이 새로 접속해서 이 연결을 닫음 → 재접속하지 않음
CLOSE_TOKEN_ROTATED = 4003  # 총관리자가 토큰을 재발급함 → 예전 토큰으로는 다시 못 붙음
CLOSE_UNAUTHORIZED = 4401  # 접속 중 인증이 실패함 → 재접속하지 않음
# 4000(응답 없음 등으로 서버가 정리), 1001(서버 종료) 등은 재접속해요
STATUS_INTERVAL = 3.0
HELLO_ACK_TIMEOUT = 10.0
MAX_BACKOFF = 30.0


class StopRobot(Exception):
    """재접속해도 소용없는 상황 (인증 실패, 교체됨)."""


# ---------- 가짜 로봇 상태 ----------


class FakeRobot:
    """제자리 근처를 천천히 도는 로봇. 실제 로봇에서는 ROS 값으로 바꿀 부분이에요."""

    def __init__(self, battery: float) -> None:
        self.state = "idle"
        self.patrol_id: int | None = None
        self.x, self.y, self.yaw = 0.0, 0.0, 0.0
        self.battery = battery

    def step(self) -> None:
        self.yaw = (self.yaw + 0.2 + math.pi) % (2 * math.pi) - math.pi
        self.x += 0.1 * math.cos(self.yaw) + random.uniform(-0.01, 0.01)
        self.y += 0.1 * math.sin(self.yaw) + random.uniform(-0.01, 0.01)
        self.battery = max(10.0, self.battery - 0.002)

    def status_data(self) -> dict:
        return {
            "state": self.state,
            "patrol_id": self.patrol_id,
            "position": {
                "x": round(self.x, 3),
                "y": round(self.y, 3),
                "yaw": round(self.yaw, 3),
            },
            "battery_voltage": round(self.battery, 2),
        }


# ---------- 메시지 ----------


def make_message(type_: str, data: dict, request_id: str | None = None) -> str:
    message = {
        "type": type_,
        "message_id": str(uuid.uuid4()),
        "occurred_at": datetime.now(KST).isoformat(timespec="seconds"),
        "data": data,
    }
    if request_id is not None:
        message["request_id"] = request_id
    return json.dumps(message, ensure_ascii=False)


async def send_hello(ws: ClientConnection, robot: FakeRobot) -> None:
    """hello를 보내고 그 message_id에 대한 ack가 올 때까지 기다려요."""
    hello = make_message("hello", {**robot.status_data(), "pending_count": 0})
    hello_id = json.loads(hello)["message_id"]
    await ws.send(hello)
    print(f"→ hello ({robot.state})")

    async for raw in ws:
        message = json.loads(raw)
        if message.get("type") == "ack" and message.get("request_id") == hello_id:
            print(f"← ack {message['data']}")
            return
        print(f"(hello ack 전에 온 메시지는 건너뜀: {message.get('type')})")
    raise ConnectionError("hello ack를 받기 전에 연결이 끊겼어요")


async def send_status_forever(ws: ClientConnection, robot: FakeRobot) -> None:
    while True:
        await asyncio.sleep(STATUS_INTERVAL)
        robot.step()
        await ws.send(make_message("status", robot.status_data()))
        d = robot.status_data()
        print(f"→ status {d['state']} x={d['position']['x']} y={d['position']['y']} battery={d['battery_voltage']}V")


async def receive_commands(ws: ClientConnection) -> None:
    async for raw in ws:
        message = json.loads(raw)
        print(f"← {message.get('type')} {message.get('data')}")
        if message.get("type") in ("patrol_start", "patrol_stop"):
            # 시뮬레이터는 아직 순찰을 못 해요. 명령에는 항상 ack로 답해야 해서 거절로 답해요.
            reply = make_message(
                "ack",
                {"result": "rejected", "reason": "not_supported"},
                request_id=message.get("message_id"),
            )
            await ws.send(reply)
            print("→ ack rejected (not_supported)")


async def run_once(url: str, robot_id: int, token: str, robot: FakeRobot, on_ready) -> None:
    """한 번 접속해서 끊길 때까지 돌아요. 끊기면 예외로 이유를 알려줘요."""
    headers = {"X-Robot-Id": str(robot_id), "Authorization": f"Bearer {token}"}
    try:
        async with connect(url, additional_headers=headers, open_timeout=10) as ws:
            print(f"연결됨: {url}")
            await asyncio.wait_for(send_hello(ws, robot), HELLO_ACK_TIMEOUT)
            on_ready()

            # status 보내기와 명령 받기를 동시에 해요. 하나가 끝나면(연결 끊김) 다른 것도 멈춰요.
            tasks = [
                asyncio.create_task(send_status_forever(ws, robot)),
                asyncio.create_task(receive_commands(ws)),
            ]
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            for task in done:
                task.result()  # 끊긴 이유(ConnectionClosed)가 있으면 여기서 다시 던져요
            code = ws.close_code
    except InvalidStatus as exc:
        if exc.response.status_code in (401, 403):
            raise StopRobot(f"인증 실패 (HTTP {exc.response.status_code}). 로봇 id와 토큰을 확인해 주세요") from exc
        raise ConnectionError(f"서버가 접속을 거절했어요 (HTTP {exc.response.status_code})") from exc
    except ConnectionClosed as exc:
        code = exc.rcvd.code if exc.rcvd else None

    if code == CLOSE_REPLACED:
        raise StopRobot("같은 로봇이 다른 곳에서 접속해서 이 연결은 교체됐어요")
    if code in (CLOSE_TOKEN_ROTATED, CLOSE_UNAUTHORIZED):
        raise StopRobot(f"토큰이 바뀌었거나 인증이 실패했어요 (code={code}). 새 토큰으로 다시 켜 주세요")
    raise ConnectionError(f"연결이 끊겼어요 (code={code})")


async def main() -> int:
    parser = argparse.ArgumentParser(description="JUBJUB 로봇 시뮬레이터 (연결 단계)")
    parser.add_argument(
        "--server",
        default=os.environ.get("ROBOT_SERVER_URL", "ws://127.0.0.1:8000/ws/robots"),
    )
    parser.add_argument("--robot-id", type=int, default=int(os.environ.get("ROBOT_ID", "0")) or None)
    parser.add_argument("--token", default=os.environ.get("ROBOT_TOKEN"))
    parser.add_argument("--battery", type=float, default=11.6, help="시작 배터리 전압 (V)")
    args = parser.parse_args()
    if not args.robot_id or not args.token:
        parser.error("--robot-id 와 --token 이 필요해요 (server/scripts/robot_token.py 로 발급)")

    robot = FakeRobot(args.battery)
    backoff = 1.0

    def reset_backoff() -> None:
        # hello ack까지 받았으면 정상 연결이었으니 다음 재접속은 다시 1초부터
        nonlocal backoff
        backoff = 1.0

    while True:
        try:
            await run_once(args.server, args.robot_id, args.token, robot, reset_backoff)
        except StopRobot as exc:
            print(f"멈춤: {exc}")
            return 1
        # ConnectionError는 OSError의 한 종류예요.
        # asyncio.TimeoutError는 Python 3.10(로봇)에서 기본 TimeoutError와 달라서 그대로 둬요.
        except (OSError, asyncio.TimeoutError) as exc:  # noqa: UP041
            print(f"연결 실패: {exc or type(exc).__name__}")
        print(f"{backoff:.0f}초 뒤 재접속해요")
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, MAX_BACKOFF)


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except KeyboardInterrupt:
        print("\n시뮬레이터를 껐어요")
