"""Build replies to patrol commands using the server's WebSocket format."""

from datetime import datetime, timezone
from uuid import UUID, uuid4


def make_ack(command_id: str, accepted: bool, reason: str | None = None) -> dict:
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
