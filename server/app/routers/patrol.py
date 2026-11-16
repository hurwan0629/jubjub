"""인증된 관리자의 공원·순찰 설정 API예요."""

from typing import Annotated

from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models import User
from app.schemas.parks import LatLng
from app.schemas.patrol import (
    ConfigInput,
    ConfigResponse,
    ManagedPark,
    ParkSelection,
    RouteInput,
    RouteResponse,
    ScheduleInput,
    ScheduleResponse,
    SetupResponse,
)
from app.services import patrol
from app.services.auth import get_current_user

router = APIRouter(tags=["patrol"])
DB = Annotated[Session, Depends(get_db)]
Admin = Annotated[User, Depends(get_current_user)]


@router.get("/park", response_model=ManagedPark, summary="내 공원 정보와 승인 상태 조회")
def get_park(db: DB, user: Admin):
    return patrol.get_park(db, user)


@router.put("/park", response_model=ManagedPark, summary="관리할 공원 선택 및 승인 신청")
def select_park(body: ParkSelection, db: DB, user: Admin):
    return patrol.select_park(db, user, body)


@router.get("/station", response_model=LatLng | None, summary="분리수거장 위치 조회")
def get_station(db: DB, user: Admin):
    return patrol.get_station(db, user)


@router.put("/station", response_model=LatLng, summary="분리수거장 위치 저장")
def save_station(body: LatLng, db: DB, user: Admin):
    return patrol.save_station(db, user, body)


@router.get("/routes", response_model=RouteResponse, summary="순찰 지점·순서와 출발·복귀 위치 조회")
def get_routes(db: DB, user: Admin):
    return patrol.get_routes(db, user)


@router.put("/routes", response_model=RouteResponse, summary="순찰 지점·순서 저장 (다음 순찰부터 적용)")
def save_routes(body: RouteInput, db: DB, user: Admin):
    return patrol.save_routes(db, user, body)


@router.get("/schedules", response_model=list[ScheduleResponse], summary="순찰 시간표 조회")
def get_schedules(db: DB, user: Admin):
    return patrol.get_schedules(db, user)


@router.put("/schedules", response_model=list[ScheduleResponse], summary="순찰 시간표 저장")
def save_schedules(body: Annotated[list[ScheduleInput], Body(max_length=100)], db: DB, user: Admin):
    return patrol.save_schedules(db, user, body)


@router.get("/route", response_model=ConfigResponse, summary="공원·분리수거장·경로·시간표 전체 조회")
def get_config(db: DB, user: Admin):
    return patrol.get_config(db, user)


@router.put("/route", response_model=ConfigResponse, summary="분리수거장·경로·시간표 일괄 저장 및 초기 설정 완료")
def save_config(body: ConfigInput, db: DB, user: Admin):
    return patrol.save_config(db, user, body)


@router.post("/route/complete", response_model=SetupResponse, summary="개별 저장한 순찰 설정 확인 및 초기 설정 완료")
def complete_setup(db: DB, user: Admin):
    return patrol.complete_setup(db, user)
