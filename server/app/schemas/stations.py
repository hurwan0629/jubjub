"""분리수거장 관리 계약이에요 (C-02). 앱 api/types.ts의 Station과 같아요."""

from typing import Annotated

from pydantic import Field, StringConstraints

from app.schemas.parks import LatLng, ParkSchema

StationName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]


class StationRobot(ParkSchema):
    id: str
    name: str


class Station(ParkSchema):
    id: str
    name: str
    position: LatLng
    primary: bool = Field(description="경로가 기준으로 삼는 기본 분리수거장")
    robots: list[StationRobot] = Field(description="이 분리수거장을 비우러 가는 로봇")


class StationInput(ParkSchema):
    name: StationName
    position: LatLng


class StationPatch(ParkSchema):
    name: StationName | None = None
    position: LatLng | None = None


class RobotStationInput(ParkSchema):
    station_id: str = Field(pattern=r"^[1-9][0-9]{0,18}$")
