"""로봇 WebSocket 입력은 문서의 snake_case 계약을 검증해요."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

Identifier = Annotated[int, Field(gt=0, le=9223372036854775807, strict=True)]
Finite = Annotated[float, Field(allow_inf_nan=False)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Position(Input):
    x: Finite
    y: Finite


class Pose(Position):
    yaw: Finite


class Status(Input):
    state: Literal["idle", "working", "returning", "error", "emptying"]
    patrol_id: Identifier | None = None
    position: Pose
    battery_voltage: Annotated[float, Field(gt=0, le=100, allow_inf_nan=False)]

    @model_validator(mode="after")
    def patrol_state(self):
        if self.state in ("working", "returning") and self.patrol_id is None:
            raise ValueError("작업 중이면 순찰 번호가 필요해요")
        if self.state == "idle" and self.patrol_id is not None:
            raise ValueError("대기 중에는 순찰 번호가 없어요")
        return self


class Hello(Status):
    pending_count: Annotated[int, Field(ge=0, strict=True)]


class PointArrived(Input):
    patrol_id: Identifier
    seq: Annotated[int, Field(ge=0, le=32767, strict=True)]
    result: Literal["arrived", "skipped"]
    reason: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def valid_reason(self):
        if (self.result == "skipped" and not (self.reason or "").strip()) or (
            self.result == "arrived" and self.reason is not None
        ):
            raise ValueError("건너뛴 지점에만 사유를 넣어 주세요")
        return self


class PatrolEnd(Input):
    patrol_id: Identifier
    result: Literal["completed", "stopped", "aborted"]


class DetectionInput(Input):
    detection_id: UUID
    patrol_id: Identifier
    material: Literal["plastic", "can", "glass", "general"]
    confidence: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
    position: Position
    image: str = Field(repr=False, min_length=1)


class PickResult(Input):
    detection_id: UUID
    patrol_id: Identifier
    result: Literal["collected", "failed"]
    reason: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def valid_reason(self):
        if self.reason is not None and self.result != "failed":
            raise ValueError("실패한 수거에만 사유를 넣어 주세요")
        return self


class ErrorInput(Input):
    code: Literal["path_blocked", "pick_failed_repeatedly", "low_battery", "return_failed", "device_failure"]
    patrol_id: Identifier | None = None
    action: Literal["returning", "stopped"]
    position: Position
    detail: str | None = Field(default=None, max_length=2000)


class AckInput(Input):
    result: Literal["accepted", "rejected"]
    reason: str | None = Field(default=None, max_length=1000)


DATA_TYPES = {
    "hello": Hello,
    "status": Status,
    "point_arrived": PointArrived,
    "patrol_end": PatrolEnd,
    "detection": DetectionInput,
    "pick_result": PickResult,
    "error": ErrorInput,
    "ack": AckInput,
}


class RobotMessage(Input):
    type: Literal["hello", "status", "point_arrived", "patrol_end", "detection", "pick_result", "error", "ack"]
    message_id: UUID
    request_id: UUID | None = None
    occurred_at: AwareDatetime
    data: dict

    @model_validator(mode="after")
    def valid_payload(self):
        DATA_TYPES[self.type].model_validate(self.data)
        if (self.type == "ack") != (self.request_id is not None):
            raise ValueError("ack에만 응답 대상 번호를 넣어 주세요")
        return self

    def payload(self):
        return DATA_TYPES[self.type].model_validate(self.data)
