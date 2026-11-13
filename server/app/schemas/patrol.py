"""순찰 설정 요청과 앱 호환 응답을 정의해요."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints, model_validator

from app.schemas.parks import LatLng, ParkArea, ParkBounds, ParkSchema

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class ParkSelection(ParkSchema):
    catalog_id: str = Field(pattern=r"^[1-9][0-9]{0,18}$")


class ManagedPark(ParkSchema):
    id: str
    catalog_id: str
    name: str
    address: str
    center: LatLng
    bounds: ParkBounds
    area: ParkArea
    status: Literal["pending", "approved", "rejected"]
    approved_by: str | None
    approved_at: datetime | None
    reject_reason: str | None
    route_setup_done: bool


class PointInput(ParkSchema):
    # 앱에서 생성한 임시 ID는 식별 권한으로 사용하지 않아요. 서버가 버전별 ID를 발급해요.
    id: str | None = Field(default=None, max_length=100)
    name: Name
    position: LatLng


class PointResponse(PointInput):
    id: str


class RouteInput(ParkSchema):
    points: list[PointInput] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def unique_points(self):
        positions = [(point.position.latitude, point.position.longitude) for point in self.points]
        if len(positions) != len(set(positions)):
            raise ValueError("같은 위치의 순찰 지점은 한 번만 지정해 주세요")
        return self


class ScheduleInput(ParkSchema):
    id: str | None = Field(default=None, max_length=100)
    time: str = Field(pattern=r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
    label: Name
    on: bool
    repeat: Literal["daily", "weekdays", "weekends"] = "daily"


class ScheduleResponse(ScheduleInput):
    id: str


class ConfigInput(RouteInput):
    station: LatLng
    schedule: list[ScheduleInput] = Field(min_length=1, max_length=100)


class RouteResponse(ParkSchema):
    id: str | None
    start: LatLng | None
    points: list[PointResponse]
    end: LatLng | None
    applies_from: Literal["nextPatrol"] = "nextPatrol"


class ConfigResponse(ParkSchema):
    park_name: str
    bounds: ParkBounds
    area: ParkArea
    station: LatLng | None
    points: list[PointResponse]
    schedule: list[ScheduleResponse]


class SetupResponse(ParkSchema):
    route_setup_done: bool
