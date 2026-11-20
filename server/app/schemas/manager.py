"""관리자 앱 알림 · 공원 변경 요청 · 운영 설정 · 알림 설정 계약이에요 (앱 api/types.ts와 같아요)."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from app.schemas.parks import ParkSchema

NotificationType = Literal["robotError", "unpickable", "lowBattery", "dailyReport", "parkChange"]
NotificationStatus = Literal["new", "acked", "resolved"]


class NotificationItem(ParkSchema):
    id: str
    type: NotificationType
    status: NotificationStatus
    title: str
    place: str
    time: str = Field(description="표시용 시각 ('11:02', '어제 22:00', '방금')")
    note: str | None = None
    pinned: bool = False


class Detection(ParkSchema):
    label: str
    confidence: int


class RecheckState(ParkSchema):
    status: Literal["requested", "stillThere", "cleared"]
    queue_position: int | None = None
    eta: str | None = None
    checked_at: str | None = None
    photo_url: str | None = None


class RobotIssue(ParkSchema):
    kind: str
    since: str
    last_place: str
    battery: int | None = None
    charger_distance_m: int | None = None


class ParkChangeResult(ParkSchema):
    result: Literal["approved", "rejected"]
    requested_on: str
    current_park: str
    requested_park: str
    reason_kind: str | None = None
    reason: str | None = None
    robot_names: str


class NotificationDetail(NotificationItem):
    happened_at: str
    photo_url: str | None = None
    detection: Detection | None = None
    recheck: RecheckState | None = None
    robot_issue: RobotIssue | None = None
    park_change: ParkChangeResult | None = None


class ParkChangeInput(ParkSchema):
    catalog_id: str = Field(pattern=r"^[1-9][0-9]{0,18}$")
    memo: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None


class ParkChangeResponse(ParkSchema):
    id: str
    from_park: str
    to_park: str
    to_catalog_id: str
    memo: str | None
    status: Literal["pending", "approved", "rejected", "canceled"]
    created_at: datetime


class AdminParkChangeResponse(ParkChangeResponse):
    park_id: str
    applicant_name: str


class ParkChangeRejection(ParkSchema):
    reason_kind: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class OperationSettings(ParkSchema):
    charge_at: int = Field(ge=0, le=100)
    empty_at: int = Field(ge=0, le=100)
    agent_paused: bool


class NotificationSettings(ParkSchema):
    unpickable: bool
    daily_report: bool


class NotificationSettingsPatch(ParkSchema):
    unpickable: bool | None = None
    daily_report: bool | None = None
