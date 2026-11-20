"""관리자 앱의 로봇 목록·순찰 제어·배정 요청 계약이에요 (앱 api/types.ts의 ManagedRobot · RobotRequest와 같아요)."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from app.schemas.parks import ParkSchema

# 앱 RobotState 중 서버가 알 수 있는 값이에요.
#   patrolling 순찰 중 · paused 멈춤 · returning 순찰 끝내고 돌아가는 중 · idle 분리수거장에서 다음 순찰 대기
#   charging 충전 중 · error 오류 · disconnected 연결 끊김
ManagedRobotState = Literal["patrolling", "paused", "returning", "idle", "charging", "error", "disconnected"]


class ManagedRobot(ParkSchema):
    id: str
    name: str
    state: ManagedRobotState
    battery: int | None
    near_point: str | None
    next_point: str | None
    remaining_points: int | None
    paused_at: datetime | None
    next_patrol_at: str | None = Field(description="다음 순찰 시각 HH:mm (한국 시각). 켜진 시간표가 없으면 null")
    route_point_count: int
    patrols_per_day: int
    today_pickups: int


class RobotRename(ParkSchema):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10)]


class PatrolPause(ParkSchema):
    # stay: 그 자리에서 멈추기 · return: 이번 순찰 끝내고 분리수거장으로 돌아가기
    mode: Literal["stay", "return"]


class RobotRequestInput(ParkSchema):
    count: int = Field(ge=1, le=5)
    memo: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None


class RobotRequestResponse(ParkSchema):
    id: str
    count: int
    memo: str | None
    status: Literal["pending", "approved", "rejected", "canceled"]
    created_at: datetime


class AdminRobotRequestResponse(RobotRequestResponse):
    park_id: str
    park_name: str
    requested_by: str
