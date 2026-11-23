"""배정 요청의 상태 전환과 로봇 배정을 한 트랜잭션으로 처리해요."""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import (
    Notification,
    Park,
    ParkCatalogEntry,
    Robot,
    RobotAssignmentRequest,
    RobotAssignmentRequestRobot,
    User,
)
from app.schemas.robot_assignment import (
    RobotAssignmentApprovalInput,
    RobotAssignmentRequestInput,
    RobotAssignmentRequestResponse,
)
from app.services.auth import require_manager, require_super_admin
from app.services.notifications import enqueue_notification
from app.services.operations import _lock_managers
from app.services.patrol import inherit_draft, transaction
from app.services.robot_availability import has_active_tasks


def _response(db: Session, request: RobotAssignmentRequest) -> RobotAssignmentRequestResponse:
    applicant = db.get(User, request.user_id)
    catalog = db.get(ParkCatalogEntry, request.catalog_id)
    return RobotAssignmentRequestResponse(
        id=str(request.id),
        user_id=str(request.user_id),
        park_id=str(request.park_id),
        catalog_id=str(request.catalog_id),
        park_name=catalog.name,
        applicant_name=applicant.name,
        applicant_login_id=applicant.login_id,
        robot_count=request.robot_count,
        reason=request.reason,
        status=request.status,
        reject_reason=request.reject_reason,
        reviewed_by=str(request.reviewed_by) if request.reviewed_by is not None else None,
        reviewed_at=request.reviewed_at,
        created_at=request.created_at,
        assigned_robot_ids=[
            str(value)
            for value in db.scalars(
                select(RobotAssignmentRequestRobot.robot_id)
                .where(RobotAssignmentRequestRobot.request_id == request.id)
                .order_by(RobotAssignmentRequestRobot.robot_id)
            )
        ],
    )


def _pending(db: Session, request_id: int, owner_id: int | None = None) -> RobotAssignmentRequest:
    statement = select(RobotAssignmentRequest).where(RobotAssignmentRequest.id == request_id)
    if owner_id is not None:
        statement = statement.where(RobotAssignmentRequest.user_id == owner_id)
    snapshot = db.scalar(statement)
    if snapshot is None:
        raise AppError(404, "로봇 배정 요청을 찾을 수 없어요", code="robot_assignment_request_not_found")
    # 경로 저장·직접 배정·공원 변경과 같은 순서로 관리자 → 요청 → 공원 → 로봇을 잠가요.
    _lock_managers(db, [snapshot.user_id])
    request = db.scalar(statement.with_for_update().execution_options(populate_existing=True))
    if request.status != "pending":
        raise AppError(409, "대기 중인 로봇 배정 요청만 처리할 수 있어요", code="robot_assignment_request_not_pending")
    return request


def _complete(request: RobotAssignmentRequest, actor: User, status: str):
    request.status = status
    request.reviewed_by = actor.id
    request.reviewed_at = datetime.now(UTC)


@transaction(write=True)
def submit(db: Session, user: User, body: RobotAssignmentRequestInput):
    require_manager(user)
    park = db.scalar(
        select(Park).where(Park.user_id == user.id).with_for_update(of=Park).execution_options(populate_existing=True)
    )
    if park is None or park.status != "approved":
        raise AppError(409, "승인된 담당 공원이 필요해요", code="park_not_approved")
    if not park.catalog.is_active:
        raise AppError(409, "현재 운영할 수 없는 공원이에요", code="park_catalog_inactive")
    if db.scalar(
        select(RobotAssignmentRequest.id).where(
            RobotAssignmentRequest.park_id == park.id, RobotAssignmentRequest.status == "pending"
        )
    ):
        raise AppError(409, "이미 대기 중인 로봇 배정 요청이 있어요", code="robot_assignment_request_pending")
    request = RobotAssignmentRequest(
        user_id=user.id, park_id=park.id, catalog_id=park.catalog_id, robot_count=body.robot_count, reason=body.reason
    )
    db.add(request)
    db.flush()
    return _response(db, request)


@transaction()
def own_requests(db: Session, user: User, status: str | None, limit: int, offset: int):
    require_manager(user)
    statement = select(RobotAssignmentRequest).where(RobotAssignmentRequest.user_id == user.id)
    if status is not None:
        statement = statement.where(RobotAssignmentRequest.status == status)
    return [
        _response(db, request)
        for request in db.scalars(
            statement.order_by(RobotAssignmentRequest.created_at.desc(), RobotAssignmentRequest.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ]


@transaction(write=True)
def cancel(db: Session, user: User, request_id: int):
    require_manager(user)
    request = _pending(db, request_id, user.id)
    _complete(request, user, "cancelled")
    db.flush()
    return _response(db, request)


@transaction()
def list_requests(db: Session, user: User, status: str | None, limit: int, offset: int):
    require_super_admin(user)
    statement = select(RobotAssignmentRequest)
    if status is not None:
        statement = statement.where(RobotAssignmentRequest.status == status)
    return [
        _response(db, request)
        for request in db.scalars(
            statement.order_by(RobotAssignmentRequest.created_at.desc(), RobotAssignmentRequest.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ]


@transaction(write=True)
def approve(db: Session, user: User, request_id: int, body: RobotAssignmentApprovalInput):
    require_super_admin(user)
    request = _pending(db, request_id)
    park = db.scalar(
        select(Park)
        .where(Park.id == request.park_id)
        .with_for_update(of=Park)
        .execution_options(populate_existing=True)
    )
    applicant = db.get(User, request.user_id, populate_existing=True)
    if (
        park is None
        or park.status != "approved"
        or park.catalog_id != request.catalog_id
        or park.user_id != request.user_id
        or applicant.role != "manager"
    ):
        raise AppError(
            409, "신청 당시 공원 상태가 변경됐어요. 요청을 다시 확인해 주세요", code="robot_assignment_request_stale"
        )
    if not park.catalog.is_active:
        raise AppError(409, "현재 운영할 수 없는 공원이에요", code="park_catalog_inactive")
    if len(body.robot_ids) != request.robot_count:
        raise AppError(422, "요청한 대수만큼 로봇을 선택해 주세요", code="robot_assignment_count_mismatch")
    ids = sorted(int(value) for value in body.robot_ids)
    robots = list(
        db.scalars(
            select(Robot)
            .where(Robot.id.in_(ids))
            .order_by(Robot.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    )
    if len(robots) != len(ids):
        raise AppError(404, "선택한 로봇을 찾을 수 없어요", code="robot_not_found")
    if any(robot.park_id is not None for robot in robots):
        raise AppError(409, "이미 공원에 배정된 로봇이 있어요", code="robot_already_assigned")
    if any(robot.status not in ("idle", "offline") for robot in robots) or has_active_tasks(
        db, (robot.id for robot in robots)
    ):
        raise AppError(409, "대기 또는 오프라인 상태의 로봇만 배정할 수 있어요", code="robot_not_available")
    # 모든 로봇을 검증한 뒤 일괄 배정해야 일부만 배정되는 일을 막을 수 있어요.
    now = datetime.now(UTC)
    for robot in robots:
        robot.park_id, robot.assigned_at = park.id, now
        db.add(RobotAssignmentRequestRobot(request_id=request.id, robot_id=robot.id))
    db.flush()
    inherit_draft(db, applicant, park, robots)
    _complete(request, user, "approved")
    enqueue_notification(
        db,
        Notification(
            user_id=applicant.id,
            recipient_role="manager",
            park_id=park.id,
            notification_type="robotAssignmentApproved",
            title="로봇 배정이 완료되었어요",
            body=f"{park.catalog.name}에 로봇 {len(robots)}대를 배정했어요",
        ),
    )
    db.flush()
    return _response(db, request)


@transaction(write=True)
def reject(db: Session, user: User, request_id: int, reason: str):
    require_super_admin(user)
    request = _pending(db, request_id)
    _complete(request, user, "rejected")
    request.reject_reason = reason
    enqueue_notification(
        db,
        Notification(
            user_id=request.user_id,
            recipient_role="manager",
            park_id=request.park_id,
            notification_type="robotAssignmentRejected",
            title="로봇 배정 요청이 반려되었어요",
            body=reason,
        ),
    )
    db.flush()
    return _response(db, request)
