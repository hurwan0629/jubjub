"""관리자 앱의 로봇 목록·순찰 제어·로봇 배정 요청 API예요 (A-01 홈 · A-13 로봇 목록)."""

from typing import Annotated, Literal

from fastapi import APIRouter, Path, Query

from app.routers.patrol import DB, Admin
from app.schemas.robots import (
    AdminRobotRequestResponse,
    ManagedRobot,
    PatrolPause,
    RobotRename,
    RobotRequestInput,
    RobotRequestResponse,
)
from app.services import robots

router = APIRouter(tags=["robots"])
RobotID = Annotated[int, Path(ge=1, le=9223372036854775807)]


@router.get("/robots", response_model=list[ManagedRobot], summary="내 공원에 배정된 로봇과 순찰 상태")
def list_robots(db: DB, user: Admin):
    return robots.list_robots(db, user)


@router.patch("/robots/{robot_id}", response_model=ManagedRobot, summary="로봇 이름 바꾸기 (10자 이내)")
def rename_robot(robot_id: RobotID, body: RobotRename, db: DB, user: Admin):
    return robots.rename(db, user, robot_id, body)


@router.post("/robots/{robot_id}/pause", response_model=ManagedRobot, summary="순찰 멈추기 (그 자리 · 돌아가기)")
def pause_patrol(robot_id: RobotID, body: PatrolPause, db: DB, user: Admin):
    return robots.pause(db, user, robot_id, body)


@router.post("/robots/{robot_id}/resume", response_model=ManagedRobot, summary="순찰 다시 시작 · 지금 순찰 시작")
def resume_patrol(robot_id: RobotID, db: DB, user: Admin):
    return robots.resume(db, user, robot_id)


@router.get("/robot-requests/current", response_model=RobotRequestResponse | None, summary="확인 중인 로봇 요청")
def current_request(db: DB, user: Admin):
    return robots.current_request(db, user)


@router.post("/robot-requests", response_model=RobotRequestResponse, status_code=201, summary="로봇 배정·추가 요청")
def create_request(body: RobotRequestInput, db: DB, user: Admin):
    return robots.create_request(db, user, body)


@router.post("/robot-requests/{request_id}/cancel", response_model=RobotRequestResponse, summary="로봇 요청 취소")
def cancel_request(request_id: RobotID, db: DB, user: Admin):
    return robots.cancel_request(db, user, request_id)


@router.get("/admin/robot-requests", response_model=list[AdminRobotRequestResponse], summary="총관리자: 로봇 요청 목록")
def admin_requests(
    db: DB,
    user: Admin,
    status: Literal["pending", "approved", "rejected", "canceled"] | None = "pending",
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
):
    return robots.admin_requests(db, user, status, limit, offset)
