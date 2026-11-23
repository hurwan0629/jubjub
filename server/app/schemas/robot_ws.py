"""로봇 ↔ 서버 WebSocket 메시지 모양 (Confluence "로봇 - 서버" 3·4장).

모든 메시지는 {type, message_id, request_id?, occurred_at, data} 형식이에요.
지금은 연결 단계(hello, status, ack)만 다뤄요. 순찰·탐지·오류 메시지는 다음 단계에서 추가해요.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

KST = timezone(timedelta(hours=9))

# 로봇이 보내는 상태 값. offline은 서버만 설정해요.
RobotStateValue = Literal["idle", "working", "returning", "error"]


class RobotMessage(BaseModel):
    """공통 껍데기. data는 type마다 다른 모델로 한 번 더 검사해요."""

    model_config = ConfigDict(extra="ignore")

    type: str
    message_id: str = Field(min_length=1, max_length=100)
    request_id: str | None = None
    occurred_at: datetime
    data: dict[str, Any] = Field(default_factory=dict)


class Position(BaseModel):
    """로봇 지도(SLAM) 좌표. x·y는 미터, yaw는 라디안."""

    x: float
    y: float
    yaw: float


class StatusData(BaseModel):
    """status(3초마다)와 hello의 공통 항목."""

    model_config = ConfigDict(extra="ignore")

    state: RobotStateValue
    patrol_id: int | None = None
    position: Position
    battery_voltage: float | None = None


class HelloData(StatusData):
    pending_count: int = Field(default=0, ge=0)


def server_message(type_: str, data: dict[str, Any], request_id: str | None = None) -> dict[str, Any]:
    """서버가 보내는 메시지를 만들어요. message_id는 UUID, occurred_at은 한국 시간이에요."""
    message: dict[str, Any] = {
        "type": type_,
        "message_id": str(uuid4()),
        "occurred_at": datetime.now(KST).isoformat(timespec="seconds"),
        "data": data,
    }
    if request_id is not None:
        message["request_id"] = request_id
    return message


def ack(request_id: str, result: str = "ok") -> dict[str, Any]:
    return server_message("ack", {"result": result}, request_id=request_id)
