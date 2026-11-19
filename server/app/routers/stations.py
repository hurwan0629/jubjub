"""공원 분리수거장 목록과 로봇별 기본 장소 선택 API예요."""

from typing import Annotated

from fastapi import APIRouter, Path, Response

from app.routers.patrol import DB, Admin, CatalogID
from app.schemas.patrol import StationInput, StationResponse, StationSelectionInput
from app.services import stations

router = APIRouter(tags=["stations"])
Identifier = Annotated[int, Path(ge=1, le=9223372036854775807)]


@router.get("/stations", response_model=list[StationResponse], summary="내 공원의 분리수거장 목록")
def list_stations(db: DB, user: Admin):
    return stations.list_stations(db, user)


@router.post("/stations", response_model=StationResponse, status_code=201, summary="분리수거장 등록")
def create_station(body: StationInput, db: DB, user: Admin):
    return stations.create_station(db, user, body)


@router.patch("/stations/{station_id}", response_model=StationResponse, summary="분리수거장 이름·위치 수정")
def update_station(station_id: Identifier, body: StationInput, db: DB, user: Admin):
    return stations.update_station(db, user, station_id, body)


@router.delete("/stations/{station_id}", status_code=204, summary="사용하지 않는 분리수거장 삭제")
def delete_station(station_id: Identifier, db: DB, user: Admin, catalog_id: CatalogID = None):
    stations.delete_station(db, user, station_id, catalog_id)
    return Response(status_code=204)


@router.put("/robots/{robot_id}/default-station", response_model=StationResponse, summary="로봇별 기본 분리수거장 선택")
def select_default_station(robot_id: Identifier, body: StationSelectionInput, db: DB, user: Admin):
    return stations.select_default_station(db, user, robot_id, body)
