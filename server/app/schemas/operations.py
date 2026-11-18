"""앱 신청과 총관리자 운영 화면의 API 계약이에요."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints, field_validator

from app.schemas.approval import Identifier
from app.schemas.parks import ParkSchema


class ParkChangeInput(ParkSchema):
    catalog_id: Identifier
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]

    @field_validator("catalog_id")
    @classmethod
    def catalog_range(cls, value):
        if int(value) > 9223372036854775807:
            raise ValueError("올바른 공원 번호를 지정해 주세요")
        return value


class ParkChangeResponse(ParkSchema):
    id: str
    park_id: str
    user_id: str
    applicant_name: str
    applicant_login_id: str
    current_catalog_id: str
    current_park_name: str
    requested_catalog_id: str
    requested_park_name: str
    requested_park_address: str
    reason: str
    status: Literal["pending", "approved", "rejected", "cancelled"]
    reject_reason: str | None
    created_at: datetime
    reviewed_at: datetime | None
    conflicting_manager_name: str | None


class AssignmentInput(ParkSchema):
    park_id: Identifier | None

    @field_validator("park_id")
    @classmethod
    def park_range(cls, value):
        if value is not None and int(value) > 9223372036854775807:
            raise ValueError("올바른 공원 번호를 지정해 주세요")
        return value


class AdminParkResponse(ParkSchema):
    id: str
    catalog_id: str
    name: str
    address: str
    manager_id: str
    manager_name: str
    manager_login_id: str
    status: Literal["pending", "approved", "rejected"]
    robot_count: int


class MaterialCount(ParkSchema):
    material: str
    count: int = Field(ge=0)


class HourCount(ParkSchema):
    hour: str
    count: int = Field(ge=0)


class ReportEvent(ParkSchema):
    time: str
    title: str
    detail: str


class AdminReportResponse(ParkSchema):
    id: str
    park_id: str
    date: date
    summary: str
    pickups: int | None = Field(default=None, ge=0)
    station_visits: int | None = Field(default=None, ge=0)
    patrols_done: int | None = Field(default=None, ge=0)
    patrols_planned: int | None = Field(default=None, ge=0)
    materials: list[MaterialCount] = Field(default_factory=list)
    hourly: list[HourCount] = Field(default_factory=list)
    insights: list[str] = Field(default_factory=list)
    events: list[ReportEvent] = Field(default_factory=list)
    created_at: datetime
