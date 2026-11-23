"""접속한 로봇의 WebSocket 연결을 서버 메모리에 로봇 id별로 보관해요.

- DB가 아닌 메모리라서 서버를 다시 켜면 비워지고, 로봇이 재접속하면서 다시 채워져요.
- 같은 로봇이 다시 접속하면 이전 연결을 "교체됨"(4000)으로 닫고 새 연결을 써요.
- 서버 프로세스 하나(uvicorn 워커 1개)에서만 맞게 동작해요. 워커를 늘리면 연결 정보를 나눠 가져서 명령이 안 갈 수 있어요.
"""

import contextlib
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

# 로봇이 받는 종료 코드. 4000번대는 앱이 자유롭게 쓰는 범위예요.
CLOSE_REPLACED = 4000  # 같은 로봇이 새로 접속함 → 로봇은 재접속하지 않아요
CLOSE_STALE = 4001  # 일정 시간 소식이 없어 서버가 끊음 → 로봇은 재접속해요


@dataclass(eq=False)
class RobotConnection:
    robot_id: int
    websocket: WebSocket
    last_seen: float = field(default_factory=time.monotonic)

    def touch(self) -> None:
        self.last_seen = time.monotonic()

    async def send(self, message: dict[str, Any]) -> None:
        await self.websocket.send_json(message)

    async def close(self, code: int, reason: str = "") -> None:
        # 이미 닫힌 연결이면 에러가 나는데, 닫는 게 목적이라 무시해요
        with contextlib.suppress(RuntimeError, OSError):
            await self.websocket.close(code=code, reason=reason)


class RobotConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[int, RobotConnection] = {}

    async def register(self, robot_id: int, websocket: WebSocket) -> RobotConnection:
        connection = RobotConnection(robot_id, websocket)
        previous = self._connections.get(robot_id)
        self._connections[robot_id] = connection
        if previous is not None:
            logger.info("로봇 %s 재접속: 이전 연결을 닫아요", robot_id)
            await previous.close(CLOSE_REPLACED, "replaced")
        return connection

    def unregister(self, connection: RobotConnection) -> bool:
        """지금 쓰는 연결일 때만 지우고 True를 돌려줘요. 이미 새 연결로 교체됐다면 False."""
        if self._connections.get(connection.robot_id) is connection:
            del self._connections[connection.robot_id]
            return True
        return False

    def get(self, robot_id: int) -> RobotConnection | None:
        return self._connections.get(robot_id)

    def connected_ids(self) -> set[int]:
        return set(self._connections)

    def stale(self, older_than: float) -> list[RobotConnection]:
        """last_seen이 older_than(time.monotonic 기준)보다 오래된 연결들."""
        return [c for c in self._connections.values() if c.last_seen < older_than]

    async def send(self, robot_id: int, message: dict[str, Any]) -> bool:
        """로봇에 메시지를 보내요. 연결이 없거나 보내다 실패하면 False (명령 API에서 사용 예정)."""
        connection = self._connections.get(robot_id)
        if connection is None:
            return False
        try:
            await connection.send(message)
        except (RuntimeError, OSError, WebSocketDisconnect):
            return False
        return True


# 서버 전체에서 하나만 써요
manager = RobotConnectionManager()
