"""총관리자 승인·로봇 관리 계약을 정의해요."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints, field_validator

from app.schemas.parks import ParkSchema
from app.schemas.patrol import ManagedPark, Name

Identifier = Annotated[str, StringConstraints(pattern=r"^[1-9][0-9]{0,18}$")]


class ApprovalInput(ParkSchema):
    robot_ids: list[Identifier] = Field(default_factory=list, max_length=100)

    @field_validator("robot_ids")
    @classmethod
    def unique_ids(cls, values):
        if len(values) != len(set(values)) or any(int(v) > 9223372036854775807 for v in values):
            raise ValueError("중복되지 않은 로봇 번호를 지정해 주세요")
        return values


class RejectionInput(ParkSchema):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class RobotInput(ParkSchema):
    name: Name
    serial_no: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class RobotNameInput(ParkSchema):
    name: Name


class RobotResponse(ParkSchema):
    id: str
    name: str
    serial_no: str
    park_id: str | None
    status: Literal["idle", "working", "returning", "emptying", "offline", "error"]
    assigned_at: datetime | None
    created_at: datetime
    slam_x: float | None = None
    slam_y: float | None = None
    lat: float | None = None
    lng: float | None = None
    battery_voltage: float | None = None
    last_seen_at: datetime | None = None
    slam_yaw: float | None = None
    updated_at: datetime | None = None
    token_issued_at: datetime | None = None
    park_name: str | None = None
    manager_id: str | None = None
    manager_name: str | None = None
    manager_login_id: str | None = None


class RobotRegistrationResponse(RobotResponse):
    auth_token: str = Field(repr=False)


class ParkRequestResponse(ManagedPark):
    user_id: str
    applicant_name: str
    applicant_login_id: str
    applicant_email: str
    applicant_phone: str
    registration_status: Literal["pending", "approved", "rejected"]
    created_at: datetime
