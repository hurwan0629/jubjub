"""분리수거장 관리 API예요 (C-02 분리수거장 관리)."""

from typing import Annotated

from fastapi import APIRouter, Path

from app.routers.patrol import DB, Admin
from app.schemas.stations import RobotStationInput, Station, StationInput, StationPatch
from app.services import stations

router = APIRouter(tags=["stations"])
ItemID = Annotated[int, Path(ge=1, le=9223372036854775807)]


@router.get("/stations", response_model=list[Station], summary="분리수거장 목록과 쓰는 로봇")
def list_stations(db: DB, user: Admin):
    return stations.list_stations(db, user)


@router.post("/stations", response_model=Station, status_code=201, summary="분리수거장 추가")
def add_station(body: StationInput, db: DB, user: Admin):
    return stations.add_station(db, user, body)


@router.patch("/stations/{station_id}", response_model=Station, summary="분리수거장 이름 · 위치 바꾸기")
def edit_station(station_id: ItemID, body: StationPatch, db: DB, user: Admin):
    return stations.edit_station(db, user, station_id, body)


@router.delete(
    "/stations/{station_id}", response_model=list[Station], summary="분리수거장 삭제 (쓰는 로봇이 없을 때만)"
)
def delete_station(station_id: ItemID, db: DB, user: Admin):
    return stations.delete_station(db, user, station_id)


@router.put("/robots/{robot_id}/station", response_model=list[Station], summary="로봇이 비우러 갈 분리수거장 정하기")
def set_robot_station(robot_id: ItemID, body: RobotStationInput, db: DB, user: Admin):
    return stations.set_robot_station(db, user, robot_id, body)
