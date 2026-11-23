"""단일 서버 프로세스에서 로봇 연결과 명령 응답을 관리해요."""

import asyncio
import time
from contextlib import suppress
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import WebSocket

from app.core.errors import AppError


@dataclass
class Connection:
    socket: WebSocket
    ready: bool = False
    last_seen: float = field(default_factory=time.monotonic)
    pending: dict = field(default_factory=dict)
    command_lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class RobotConnections:
    def __init__(self):
        self.connections = {}

    async def attach(self, robot_id, socket):
        previous = self.connections.get(robot_id)
        current = Connection(socket)
        self.connections[robot_id] = current
        if previous:
            await self._close(previous, 4001)
        return current

    async def _close(self, connection, code):
        for future in connection.pending.values():
            if not future.done():
                future.set_exception(AppError(409, "로봇 연결이 끊겼어요", code="robot_disconnected"))
        with suppress(RuntimeError, OSError):
            await connection.socket.close(code=code)

    async def disconnect(self, robot_id, code=4003):
        connection = self.connections.get(robot_id)
        if connection:
            await self._close(connection, code)

    def current(self, robot_id, connection):
        return self.connections.get(robot_id) is connection

    def connected(self, robot_id):
        connection = self.connections.get(robot_id)
        return connection is not None and connection.ready

    def resolve(self, connection, message):
        future = connection.pending.get(str(message.request_id))
        if future and not future.done():
            future.set_result(message.payload())
            return True
        return False

    async def command(self, robot_id, kind, data, timeout):
        connection = self.connections.get(robot_id)
        if not connection or not connection.ready:
            raise AppError(409, "로봇이 연결되어 있지 않아요", code="robot_disconnected")
        async with connection.command_lock:
            request_id = str(uuid4())
            future = asyncio.get_running_loop().create_future()
            connection.pending[request_id] = future
            try:
                await connection.socket.send_json(
                    {"type": kind, "message_id": request_id, "occurred_at": datetime.now(UTC).isoformat(), "data": data}
                )
                return await asyncio.wait_for(future, timeout)
            except TimeoutError:
                raise AppError(504, "로봇의 명령 응답을 받지 못했어요", code="robot_command_timeout") from None
            except (RuntimeError, OSError):
                raise AppError(409, "로봇 연결이 끊겼어요", code="robot_disconnected") from None
            finally:
                connection.pending.pop(request_id, None)
