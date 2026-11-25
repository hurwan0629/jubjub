"""하위관리자 요청과 총관리자 실제 배정 처리를 분리해요."""

from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Path, Query

from app.routers.patrol import DB, Admin
from app.schemas.approval import RejectionInput
from app.schemas.robot_assignment import (
    RobotAssignmentApprovalInput,
    RobotAssignmentRequestInput,
    RobotAssignmentRequestResponse,
)
from app.services import robot_assignment
from app.services.notification_push import dispatch_pending_pushes

router = APIRouter(tags=["robot-assignment-requests"])
RequestID = Annotated[int, Path(ge=1, le=9223372036854775807)]
Status = Literal["all", "pending", "approved", "rejected", "cancelled"]


@router.post(
    "/robot-assignment-requests",
    response_model=RobotAssignmentRequestResponse,
    status_code=201,
    summary="최초·추가 로봇 배정 요청",
)
def submit(body: RobotAssignmentRequestInput, db: DB, user: Admin):
    return robot_assignment.submit(db, user, body)


@router.get(
    "/robot-assignment-requests", response_model=list[RobotAssignmentRequestResponse], summary="내 로봇 배정 요청 조회"
)
def own_requests(
    db: DB,
    user: Admin,
    status: Status = "all",
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0, le=9223372036854775807),
):
    return robot_assignment.own_requests(db, user, None if status == "all" else status, limit, offset)


@router.post(
    "/robot-assignment-requests/{request_id}/cancel",
    response_model=RobotAssignmentRequestResponse,
    summary="내 대기 요청 취소",
)
def cancel(request_id: RequestID, db: DB, user: Admin):
    return robot_assignment.cancel(db, user, request_id)


@router.get(
    "/admin/robot-assignment-requests",
    response_model=list[RobotAssignmentRequestResponse],
    summary="총관리자 로봇 배정 요청 목록",
)
def list_requests(
    db: DB,
    user: Admin,
    status: Status = "pending",
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0, le=9223372036854775807),
):
    return robot_assignment.list_requests(db, user, None if status == "all" else status, limit, offset)


@router.post(
    "/admin/robot-assignment-requests/{request_id}/approve",
    response_model=RobotAssignmentRequestResponse,
    summary="요청 승인과 로봇 일괄 배정",
)
def approve(
    request_id: RequestID, body: RobotAssignmentApprovalInput, db: DB, user: Admin, background_tasks: BackgroundTasks
):
    result = robot_assignment.approve(db, user, request_id, body)
    background_tasks.add_task(dispatch_pending_pushes)
    return result


@router.post(
    "/admin/robot-assignment-requests/{request_id}/reject",
    response_model=RobotAssignmentRequestResponse,
    summary="로봇 배정 요청 반려",
)
def reject(request_id: RequestID, body: RejectionInput, db: DB, user: Admin, background_tasks: BackgroundTasks):
    result = robot_assignment.reject(db, user, request_id, body.reason)
    background_tasks.add_task(dispatch_pending_pushes)
    return result
