"""하위관리자 배정 요청과 총관리자 처리 계약이에요."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, StringConstraints

from app.schemas.approval import ApprovalInput, Identifier
from app.schemas.parks import ParkSchema


class RobotAssignmentRequestInput(ParkSchema):
    model_config = ConfigDict(extra="forbid")
    robot_count: int = Field(strict=True, ge=1, le=100)
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class RobotAssignmentApprovalInput(ApprovalInput):
    model_config = ConfigDict(extra="forbid")
    robot_ids: list[Identifier] = Field(min_length=1, max_length=100)


class RobotAssignmentRequestResponse(ParkSchema):
    id: str
    user_id: str
    park_id: str
    catalog_id: str
    park_name: str
    applicant_name: str
    applicant_login_id: str
    robot_count: int
    reason: str
    status: Literal["pending", "approved", "rejected", "cancelled"]
    reject_reason: str | None
    reviewed_by: str | None
    reviewed_at: datetime | None
    created_at: datetime
    assigned_robot_ids: list[str]
