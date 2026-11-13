"""총관리자만 공원을 승인하고 로봇을 원자적으로 할당해요."""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Park, Robot, User
from app.schemas.approval import ApprovalInput, ParkRequestResponse, RejectionInput, RobotInput, RobotResponse
from app.services.auth import require_super_admin
from app.services.patrol import _managed, _park, transaction


def _robot_response(robot: Robot) -> RobotResponse:
    return RobotResponse(
        id=str(robot.id),
        name=robot.name,
        serial_no=robot.serial_no,
        park_id=str(robot.park_id) if robot.park_id is not None else None,
        status=robot.status,
        assigned_at=robot.assigned_at,
        created_at=robot.created_at,
    )


def _pending(db: Session, park_id: int) -> Park:
    park = db.scalar(
        select(Park).where(Park.id == park_id).with_for_update(of=Park).execution_options(populate_existing=True)
    )
    if park is None:
        raise AppError(404, "공원 신청을 찾을 수 없어요", code="park_request_not_found")
    if park.status != "pending":
        raise AppError(409, "대기 중인 신청만 처리할 수 있어요", code="park_request_not_pending")
    return park


@transaction()
def list_requests(db: Session, user: User, status: str | None, limit: int, offset: int):
    require_super_admin(user)
    statement = select(Park, User.name).join(User, Park.user_id == User.id)
    if status:
        statement = statement.where(Park.status == status)
    rows = db.execute(statement.order_by(Park.created_at, Park.id).limit(limit).offset(offset)).all()
    return [
        ParkRequestResponse(
            **_managed(park).model_dump(), user_id=str(park.user_id), applicant_name=name, created_at=park.created_at
        )
        for park, name in rows
    ]


@transaction(write=True)
def approve(db: Session, user: User, park_id: int, body: ApprovalInput):
    require_super_admin(user)
    park = _pending(db, park_id)
    if db.get(User, park.user_id).role != "manager":
        raise AppError(409, "하위관리자의 신청만 승인할 수 있어요", code="invalid_applicant_role")
    if not park.catalog.is_active:
        raise AppError(409, "현재 운영할 수 없는 공원이에요", code="park_catalog_inactive")
    # catalog_id의 부분 유일 인덱스가 서로 다른 총관리자의 동시 승인도 막아요.
    if db.scalar(select(Park.id).where(Park.catalog_id == park.catalog_id, Park.status == "approved")):
        raise AppError(409, "이미 승인된 관리자가 있는 공원이에요", code="park_already_approved")
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
        raise AppError(409, "이미 공원에 할당된 로봇이 있어요", code="robot_already_assigned")
    if any(robot.status not in ("idle", "offline") for robot in robots):
        raise AppError(409, "대기 중이거나 오프라인인 미할당 로봇만 지정할 수 있어요", code="robot_not_available")
    now = datetime.now(UTC)
    park.status = "approved"
    park.approved_by = user.id
    park.approved_at = now
    park.reject_reason = None
    for robot in robots:
        robot.park_id = park.id
        robot.assigned_at = now
    db.flush()
    return _managed(park)


@transaction(write=True)
def reject(db: Session, user: User, park_id: int, body: RejectionInput):
    require_super_admin(user)
    park = _pending(db, park_id)
    park.status = "rejected"
    park.approved_by = None
    park.approved_at = None
    park.reject_reason = body.reason
    db.flush()
    return _managed(park)


@transaction(write=True)
def register_robot(db: Session, user: User, body: RobotInput):
    require_super_admin(user)
    if db.scalar(select(Robot.id).where(Robot.serial_no == body.serial_no)):
        raise AppError(409, "이미 등록된 기기 식별 번호예요", code="robot_serial_exists")
    robot = Robot(name=body.name, serial_no=body.serial_no)
    db.add(robot)
    db.flush()
    return _robot_response(robot)


@transaction()
def list_robots(db: Session, user: User, unassigned: bool, limit: int, offset: int):
    require_super_admin(user)
    statement = select(Robot)
    if unassigned:
        statement = statement.where(Robot.park_id.is_(None))
    return [_robot_response(robot) for robot in db.scalars(statement.order_by(Robot.id).limit(limit).offset(offset))]


@transaction()
def my_robots(db: Session, user: User):
    park = _park(db, user)
    return [
        _robot_response(robot) for robot in db.scalars(select(Robot).where(Robot.park_id == park.id).order_by(Robot.id))
    ]
