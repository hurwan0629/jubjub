"""공원 변경 승인·로봇 배정·보고 조회의 권한과 데이터 일관성을 관리해요."""

from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Park, ParkCatalogEntry, Robot, User
from app.models.operations import ParkChangeRequest
from app.models.patrol import Route, Schedule
from app.models.station import StationSelection
from app.schemas.operations import AdminParkResponse, ParkChangeInput, ParkChangeResponse
from app.services.approval import _robot_response
from app.services.auth import require_manager, require_super_admin
from app.services.patrol import (
    _deactivate,
    _has_complete_config,
    _hide_points,
    _park,
    _points,
    inherit_draft,
    transaction,
)


def _conflict(db: Session, request: ParkChangeRequest) -> str | None:
    return db.scalar(
        select(User.name)
        .join(Park, Park.user_id == User.id)
        .where(Park.catalog_id == request.to_catalog_id, Park.status == "approved", Park.id != request.park_id)
    )


def _change_response(db: Session, request: ParkChangeRequest) -> ParkChangeResponse:
    user = db.get(User, request.user_id)
    current = db.get(ParkCatalogEntry, request.from_catalog_id)
    target = db.get(ParkCatalogEntry, request.to_catalog_id)
    return ParkChangeResponse(
        id=str(request.id),
        park_id=str(request.park_id),
        user_id=str(request.user_id),
        applicant_name=user.name,
        applicant_login_id=user.login_id,
        current_catalog_id=str(current.id),
        current_park_name=current.name,
        requested_catalog_id=str(target.id),
        requested_park_name=target.name,
        requested_park_address=target.address,
        reason=request.reason,
        status=request.status,
        reject_reason=request.reject_reason,
        created_at=request.created_at,
        reviewed_at=request.reviewed_at,
        conflicting_manager_name=_conflict(db, request),
    )


def _lock_managers(db: Session, ids: list[int]):
    # 앱의 경로 저장과 동일한 사용자 잠금을 먼저 잡아 승인 중 이전 공원 좌표 저장을 막아요.
    list(
        db.scalars(
            select(User)
            .where(User.id.in_(ids))
            .order_by(User.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    )


def _pending_change(db: Session, request_id: int) -> ParkChangeRequest:
    snapshot = db.get(ParkChangeRequest, request_id)
    if snapshot is None:
        raise AppError(404, "공원 변경 요청을 찾을 수 없어요", code="park_change_not_found")
    _lock_managers(db, [snapshot.user_id])
    request = db.scalar(
        select(ParkChangeRequest)
        .where(ParkChangeRequest.id == request_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if request.status != "pending":
        raise AppError(409, "대기 중인 공원 변경 요청만 처리할 수 있어요", code="park_change_not_pending")
    return request


@transaction()
def own_changes(db: Session, user: User):
    require_manager(user)
    return [
        _change_response(db, request)
        for request in db.scalars(
            select(ParkChangeRequest)
            .where(ParkChangeRequest.user_id == user.id)
            .order_by(ParkChangeRequest.id.desc())
            .limit(50)
        )
    ]


@transaction(write=True)
def submit_change(db: Session, user: User, body: ParkChangeInput):
    park = _park(db, user)
    if db.scalar(
        select(ParkChangeRequest.id).where(ParkChangeRequest.park_id == park.id, ParkChangeRequest.status == "pending")
    ):
        raise AppError(409, "이미 대기 중인 공원 변경 요청이 있어요", code="park_change_pending")
    target = db.get(ParkCatalogEntry, int(body.catalog_id))
    if target is None or not target.is_active:
        raise AppError(404, "선택한 공원을 찾을 수 없어요", code="park_not_found")
    if target.id == park.catalog_id:
        raise AppError(422, "현재 공원과 다른 공원을 선택해 주세요", code="same_park")
    request = ParkChangeRequest(
        park_id=park.id, user_id=user.id, from_catalog_id=park.catalog_id, to_catalog_id=target.id, reason=body.reason
    )
    db.add(request)
    db.flush()
    return _change_response(db, request)


@transaction(write=True)
def cancel_change(db: Session, user: User, request_id: int):
    require_manager(user)
    # 다른 계정의 요청 존재 여부도 노출하지 않아요.
    if not db.scalar(
        select(ParkChangeRequest.id).where(ParkChangeRequest.id == request_id, ParkChangeRequest.user_id == user.id)
    ):
        raise AppError(404, "공원 변경 요청을 찾을 수 없어요", code="park_change_not_found")
    request = _pending_change(db, request_id)
    request.status = "cancelled"
    request.reviewed_at = datetime.now(UTC)
    db.flush()
    return _change_response(db, request)


@transaction()
def list_changes(db: Session, user: User, status: str | None, limit: int, offset: int):
    require_super_admin(user)
    statement = select(ParkChangeRequest)
    if status:
        statement = statement.where(ParkChangeRequest.status == status)
    return [
        _change_response(db, request)
        for request in db.scalars(
            statement.order_by(ParkChangeRequest.created_at.desc(), ParkChangeRequest.id.desc())
            .limit(limit)
            .offset(offset)
        )
    ]


@transaction(write=True)
def approve_change(db: Session, user: User, request_id: int):
    require_super_admin(user)
    request = _pending_change(db, request_id)
    park = db.scalar(
        select(Park)
        .where(Park.id == request.park_id)
        .with_for_update(of=Park)
        .execution_options(populate_existing=True)
    )
    if park is None or park.status != "approved" or park.catalog_id != request.from_catalog_id:
        raise AppError(409, "담당 공원 상태가 변경됐어요. 요청을 다시 확인해 주세요", code="park_change_stale")
    target = db.get(ParkCatalogEntry, request.to_catalog_id, populate_existing=True)
    if not target.is_active:
        raise AppError(409, "현재 운영할 수 없는 공원이에요", code="park_catalog_inactive")
    if _conflict(db, request) is not None:
        raise AppError(409, "이미 담당 관리자가 있는 공원이에요", code="park_already_approved")
    robots = list(
        db.scalars(
            select(Robot)
            .where(Robot.park_id == park.id)
            .order_by(Robot.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    )
    if any(robot.status not in ("idle", "offline") for robot in robots):
        raise AppError(409, "모든 로봇을 대기 또는 오프라인 상태로 전환한 뒤 승인해 주세요", code="robot_not_available")
    _deactivate(db, park)
    _hide_points(db, park)
    db.execute(delete(Schedule).where(Schedule.park_id == park.id))
    park.catalog = target
    park.anchor_points = []
    park.route_setup_done = False
    park.reviewed_by = user.id
    park.reviewed_at = datetime.now(UTC)
    request.status = "approved"
    request.reviewed_by = user.id
    request.reviewed_at = park.reviewed_at
    db.flush()
    return _change_response(db, request)


@transaction(write=True)
def reject_change(db: Session, user: User, request_id: int, reason: str):
    require_super_admin(user)
    request = _pending_change(db, request_id)
    request.status = "rejected"
    request.reject_reason = reason
    request.reviewed_by = user.id
    request.reviewed_at = datetime.now(UTC)
    db.flush()
    return _change_response(db, request)


@transaction()
def list_parks(db: Session, user: User, limit: int, offset: int):
    require_super_admin(user)
    rows = db.execute(
        select(Park, User)
        .join(User, User.id == Park.user_id)
        .where(Park.status == "approved")
        .order_by(Park.id)
        .limit(limit)
        .offset(offset)
    ).all()
    counts = dict(db.execute(select(Robot.park_id, func.count(Robot.id)).group_by(Robot.park_id)).all())
    return [
        AdminParkResponse(
            id=str(park.id),
            catalog_id=str(park.catalog_id),
            name=park.catalog.name,
            address=park.catalog.address,
            manager_id=str(manager.id),
            manager_name=manager.name,
            manager_login_id=manager.login_id,
            status=park.status,
            robot_count=counts.get(park.id, 0),
        )
        for park, manager in rows
    ]


def admin_robot_response(db: Session, robot: Robot):
    response = _robot_response(robot)
    if robot.park_id is not None:
        park = db.get(Park, robot.park_id)
        manager = db.get(User, park.user_id)
        response.park_name = park.catalog.name
        response.manager_id = str(manager.id)
        response.manager_name = manager.name
        response.manager_login_id = manager.login_id
    return response


@transaction(write=True)
def assign_robot(db: Session, user: User, robot_id: int, target_park_id: int | None):
    require_super_admin(user)
    snapshot = db.get(Robot, robot_id)
    if snapshot is None:
        raise AppError(404, "로봇을 찾을 수 없어요", code="robot_not_found")
    source_park_id = snapshot.park_id
    park_ids = sorted({pid for pid in (source_park_id, target_park_id) if pid is not None})
    manager_ids = list(db.scalars(select(Park.user_id).where(Park.id.in_(park_ids))))
    _lock_managers(db, manager_ids)
    parks = {
        park.id: park
        for park in db.scalars(
            select(Park)
            .where(Park.id.in_(park_ids))
            .order_by(Park.id)
            .with_for_update(of=Park)
            .execution_options(populate_existing=True)
        )
    }
    robot = db.scalar(
        select(Robot).where(Robot.id == robot_id).with_for_update().execution_options(populate_existing=True)
    )
    if robot.park_id != source_park_id:
        raise AppError(409, "로봇 배정이 변경됐어요. 다시 불러와 주세요", code="robot_assignment_changed")
    if robot.status not in ("idle", "offline"):
        raise AppError(409, "대기 또는 오프라인 상태의 로봇만 배정할 수 있어요", code="robot_not_available")
    target = parks.get(target_park_id) if target_park_id is not None else None
    if target_park_id is not None and (target is None or target.status != "approved"):
        raise AppError(409, "승인된 관리자의 공원만 선택할 수 있어요", code="park_not_approved")
    if target is not None and not target.catalog.is_active:
        raise AppError(409, "현재 운영할 수 없는 공원이에요", code="park_catalog_inactive")
    if robot.park_id == target_park_id:
        return admin_robot_response(db, robot)
    source = parks.get(robot.park_id)
    if source:
        db.execute(
            delete(StationSelection).where(StationSelection.park_id == source.id, StationSelection.robot_id == robot.id)
        )
        for route in db.scalars(
            select(Route).where(Route.park_id == source.id, Route.robot_id == robot.id, Route.is_active.is_(True))
        ):
            route.is_active = False
            for point in _points(db, route):
                point.deleted_at = datetime.now(UTC)
        db.execute(delete(Schedule).where(Schedule.park_id == source.id, Schedule.robot_id == robot.id))
    robot.park_id = target_park_id
    robot.assigned_at = datetime.now(UTC) if target is not None else None
    db.flush()
    if source and source.route_setup_done:
        source.route_setup_done = _has_complete_config(db, source)
    if target:
        inherit_draft(db, db.get(User, target.user_id), target, [robot])
    db.flush()
    return admin_robot_response(db, robot)
