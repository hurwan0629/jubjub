"""Receive server commands and build WebSocket replies."""

import asyncio
import json
from datetime import datetime, timezone
from uuid import UUID, uuid4

HELLO_ACK_TIMEOUT_SECONDS = 10
EVENT_ACK_TIMEOUT_SECONDS = 10


class ServerAdapter:
    """Own one WebSocket connection and translate robot events into server messages."""

    def __init__(self, server_url: str, robot_id: int, token: str):
        """Keep connection settings and the queue read by JubjubManager."""
        self.server_url = server_url
        self.robot_id = robot_id
        self.token = token
        self.websocket = None
        self.server_commands: asyncio.Queue[dict] = asyncio.Queue()
        self.pending_events: dict[str, asyncio.Future] = {}
        self.ready = False

    async def run(self, hello_data: dict) -> None:
        """Connect, finish hello, then receive commands and event acknowledgements."""
        from websockets.asyncio.client import connect

        headers = {
            "X-Robot-Id": str(self.robot_id),
            "Authorization": f"Bearer {self.token}",
        }
        async with connect(self.server_url, additional_headers=headers) as websocket:
            self.websocket = websocket
            try:
                await self.send_hello(hello_data)
                self.ready = True
                await self.receive_loop()
            finally:
                self.ready = False
                self.websocket = None
                for future in self.pending_events.values():
                    if not future.done():
                        future.set_exception(ConnectionError("WebSocket disconnected"))
                self.pending_events.clear()

    async def send_hello(self, data: dict) -> None:
        """Send current robot state and wait for the matching server ACK."""
        if self.websocket is None:
            raise RuntimeError("WebSocket is not connected")

        hello_id = str(uuid4())
        await self.websocket.send(
            json.dumps(
                {
                    "type": "hello",
                    "message_id": hello_id,
                    "occurred_at": datetime.now(timezone.utc).isoformat(),
                    "data": data,
                }
            )
        )
        early_commands = []
        while True:
            response = json.loads(
                await asyncio.wait_for(self.websocket.recv(), HELLO_ACK_TIMEOUT_SECONDS)
            )
            if not isinstance(response, dict):
                raise TypeError("Server message must be a JSON object")
            if response.get("type") == "ack" and response.get("request_id") == hello_id:
                if response.get("data") != {"result": "ok"}:
                    raise ValueError("Server rejected hello")
                for command in early_commands:
                    await self._queue_command(command)
                return
            if response.get("type") in ("patrol_start", "patrol_stop"):
                early_commands.append(response)
            else:
                raise ValueError(
                    f"Unexpected response to hello: {response.get('code', response.get('type'))}"
                )

    async def _queue_command(self, message: dict) -> None:
        """Validate the command envelope before handing it to the manager."""
        command_id = message.get("message_id")
        if not isinstance(command_id, str) or not isinstance(message.get("data"), dict):
            raise TypeError("Invalid server command")
        UUID(command_id)
        await self.server_commands.put(message)

    async def receive_loop(self) -> None:
        """Read every post-hello WebSocket message from this single reader."""
        if self.websocket is None:
            raise RuntimeError("WebSocket is not connected")

        async for raw in self.websocket:
            message = json.loads(raw)
            if not isinstance(message, dict):
                raise TypeError("Server message must be a JSON object")
            # 서버에서 오는 2가지 요청
            if message.get("type") in ("patrol_start", "patrol_stop"):
                await self._queue_command(message)

            elif message.get("type") == "ack":
                future = self.pending_events.get(message.get("request_id"))
                if future is not None and not future.done():
                    future.set_result(message.get("data"))
            # ack도 아니고 등록되지 않은 메시지면 오류내기
            else:
                raise ValueError(
                    f"Unexpected server message: {message.get('code', message.get('type'))}"
                )

    async def send_command_ack(
        self, command_id: str, accepted: bool, reason: str | None = None
    ) -> None:
        """Tell the server whether the manager accepted a start or stop command."""
        if self.websocket is None:
            raise RuntimeError("WebSocket is not connected")
        await self.websocket.send(json.dumps(make_ack(command_id, accepted, reason)))

    async def send_status(self, data: dict) -> None:
        """Send periodic telemetry; the server does not ACK status messages."""
        if self.websocket is None:
            raise RuntimeError("WebSocket is not connected")
        await self.websocket.send(
            json.dumps(
                {
                    "type": "status",
                    "message_id": str(uuid4()),
                    "occurred_at": datetime.now(timezone.utc).isoformat(),
                    "data": data,
                }
            )
        )

    async def send_event(self, kind: str, data: dict) -> None:
        """Send a robot event and wait for the server to store and ACK it."""
        if not self.ready or self.websocket is None:
            raise ConnectionError("WebSocket hello is not complete")
        if kind not in (
            "point_arrived",
            "patrol_end",
            "detection",
            "pick_result",
            "error",
        ):
            raise ValueError(f"Unsupported robot event: {kind}")
        message_id = str(uuid4())
        message = {
            "type": kind,
            "message_id": message_id,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "data": data,
        }
        future = asyncio.get_running_loop().create_future()
        self.pending_events[message_id] = future
        try:
            for attempt in range(2):
                if not future.done():
                    # Retry with the same ID so the server's receipt check deduplicates it.
                    await self.websocket.send(json.dumps(message))
                try:
                    response = await asyncio.wait_for(
                        asyncio.shield(future), EVENT_ACK_TIMEOUT_SECONDS
                    )
                    break
                except asyncio.TimeoutError:  # noqa: UP041 - Ubuntu uses Python 3.10.
                    if attempt == 1:
                        raise
            if response != {"result": "ok"}:
                raise ValueError(f"Server rejected {kind}: {response}")
        finally:
            self.pending_events.pop(message_id, None)


def make_ack(command_id: str, accepted: bool, reason: str | None = None) -> dict:
    """Build an ACK whose request_id names the server command message_id."""
    UUID(command_id)
    data = {"result": "accepted" if accepted else "rejected"}
    if reason is not None:
        data["reason"] = reason
    return {
        "type": "ack",
        "message_id": str(uuid4()),
        "request_id": command_id,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }
