"""기간 보고(A-10)와 지도 현황(A-02 · A-03) 계약이에요. 앱 api/types.ts의 PeriodReport · MapOverview와 같아요."""

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.parks import LatLng, ParkArea, ParkBounds, ParkSchema

Slot = Literal["pet", "can", "paper", "general"]


class MaterialCount(ParkSchema):
    slot: Slot
    count: int


class PointShare(ParkSchema):
    name: str
    percent: int


class Unresolved(ParkSchema):
    kind: Literal["unpickable", "robotError", "missedPoint"]
    title: str
    body: str


class PeriodReport(ParkSchema):
    from_: str = Field(alias="from")  # 'from'은 파이썬 예약어라 별칭으로 내보내요
    to: str
    pickups: int
    change_percent: int | None
    pick_success_rate: int | None
    patrols: int
    station_visits: int
    by_material: list[MaterialCount]
    by_point: list[PointShare]
    unresolved: list[Unresolved]


class MarkerDetail(ParkSchema):
    place: str
    material: str
    confidence: int
    last_seen: str
    photo_url: str | None
    notification_id: str | None


class MapMarker(ParkSchema):
    id: str
    type: Literal["robot", "station", "unpickable"]
    label: str
    position: LatLng
    detail: MarkerDetail | None = None


class Heat(ParkSchema):
    position: LatLng
    weight: float


class MapOverview(ParkSchema):
    park_name: str
    bounds: ParkBounds
    area: ParkArea
    markers: list[MapMarker]
    route: list[LatLng]
    heat: list[Heat]
    updated_at: datetime
