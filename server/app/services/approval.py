"""총관리자만 공원을 승인하고 로봇을 원자적으로 할당해요."""

from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Park, Robot, Route, User
from app.schemas.approval import ApprovalInput, ParkRequestResponse, RejectionInput, RobotInput, RobotResponse
from app.services.auth import require_super_admin
from app.services.patrol import _managed, _park, inherit_draft, transaction
from app.services.robot_availability import has_active_tasks
from app.services.robot_tokens import issue_token


def _robot_response(robot: Robot) -> RobotResponse:
    return RobotResponse(
        id=str(robot.id),
        name=robot.name,
        serial_no=robot.serial_no,
        park_id=str(robot.park_id) if robot.park_id is not None else None,
        status=robot.status,
        assigned_at=robot.assigned_at,
        created_at=robot.created_at,
        slam_x=robot.slam_x,
        slam_y=robot.slam_y,
        lat=robot.lat,
        lng=robot.lng,
        battery_voltage=robot.battery_voltage,
        last_seen_at=robot.last_seen_at,
        slam_yaw=robot.state.slam_yaw,
        updated_at=robot.state.updated_at,
        token_issued_at=robot.token_issued_at,
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
    statement = select(Park, User).join(User, Park.user_id == User.id).where(User.role == "manager")
    if status:
        statement = statement.where(Park.status == status)
    rows = db.execute(statement.order_by(Park.created_at, Park.id).limit(limit).offset(offset)).all()
    return [
        ParkRequestResponse(
            **_managed(park).model_dump(),
            user_id=str(park.user_id),
            applicant_name=applicant.name,
            applicant_login_id=applicant.login_id,
            applicant_email=applicant.email,
            applicant_phone=applicant.phone,
            registration_status=park.status,
            created_at=park.created_at,
        )
        for park, applicant in rows
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
    if any(robot.status not in ("idle", "offline") for robot in robots) or has_active_tasks(
        db, (robot.id for robot in robots)
    ):
        raise AppError(409, "대기 중이거나 오프라인인 미할당 로봇만 지정할 수 있어요", code="robot_not_available")
    now = datetime.now(UTC)
    park.status = "approved"
    park.reviewed_by = user.id
    park.reviewed_at = now
    park.reject_reason = None
    for robot in robots:
        robot.park_id = park.id
        robot.assigned_at = now
    db.flush()
    inherit_draft(db, db.get(User, park.user_id), park, robots)
    return _managed(park)


@transaction(write=True)
def reject(db: Session, user: User, park_id: int, body: RejectionInput):
    require_super_admin(user)
    park = _pending(db, park_id)
    park.status = "rejected"
    park.reviewed_by = user.id
    park.reviewed_at = datetime.now(UTC)
    park.reject_reason = body.reason
    db.flush()
    return _managed(park)


@transaction(write=True)
def register_robot(db: Session, user: User, body: RobotInput):
    require_super_admin(user)
    if db.scalar(select(Robot.id).where(Robot.serial_no == body.serial_no)):
        raise AppError(409, "이미 등록된 기기 식별 번호예요", code="robot_serial_exists")
    robot = Robot(name=body.name, serial_no=body.serial_no)
    token = issue_token(robot)
    db.add(robot)
    db.flush()
    return {**_robot_response(robot).model_dump(), "auth_token": token}


@transaction(write=True)
def revoke(db: Session, user: User, park_id: int, body: RejectionInput):
    require_super_admin(user)
    park = db.scalar(
        select(Park).where(Park.id == park_id).with_for_update(of=Park).execution_options(populate_existing=True)
    )
    if park is None:
        raise AppError(404, "공원 신청을 찾을 수 없어요", code="park_request_not_found")
    if park.status != "approved":
        raise AppError(409, "승인된 관리자만 승인을 취소할 수 있어요", code="registration_not_approved")
    robots = list(
        db.scalars(
            select(Robot)
            .where(Robot.park_id == park.id)
            .order_by(Robot.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    )
    if any(robot.status not in ("idle", "offline") for robot in robots) or has_active_tasks(
        db, (robot.id for robot in robots)
    ):
        raise AppError(
            409, "로봇을 대기 또는 오프라인 상태로 전환한 뒤 승인을 취소해 주세요", code="robot_not_available"
        )
    for robot in robots:
        robot.park_id = None
        robot.assigned_at = None
    if robots:
        released_ids = [robot.id for robot in robots]
        db.execute(
            update(Route)
            .where(Route.park_id == park.id, Route.robot_id.in_(released_ids), Route.is_active.is_(True))
            .values(is_active=False)
        )
        park.route_setup_done = False
    # 별도 DB 상태를 추가하지 않고 반려 상태와 사유로 업무 접근을 즉시 차단해요.
    park.status = "rejected"
    park.reviewed_by = user.id
    park.reviewed_at = datetime.now(UTC)
    park.reject_reason = body.reason
    db.flush()
    return _managed(park)


@transaction()
def list_robots(db: Session, user: User, unassigned: bool, limit: int, offset: int):
    from app.services.operations import admin_robot_response

    require_super_admin(user)
    statement = select(Robot)
    if unassigned:
        statement = statement.where(Robot.park_id.is_(None))
    return [
        admin_robot_response(db, robot)
        for robot in db.scalars(statement.order_by(Robot.id).limit(limit).offset(offset))
    ]


@transaction()
def my_robots(db: Session, user: User):
    park = _park(db, user)
    return [
        _robot_response(robot) for robot in db.scalars(select(Robot).where(Robot.park_id == park.id).order_by(Robot.id))
    ]


def _my_robot(db: Session, user: User, robot_id: int, *, lock: bool = False) -> Robot:
    park = _park(db, user)
    statement = select(Robot).where(Robot.id == robot_id, Robot.park_id == park.id)
    if lock:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    robot = db.scalar(statement)
    if robot is None:
        raise AppError(404, "이 공원에 배정된 로봇을 찾을 수 없어요", code="robot_not_found")
    return robot


@transaction()
def my_robot(db: Session, user: User, robot_id: int):
    return _robot_response(_my_robot(db, user, robot_id))


@transaction(write=True)
def rename_robot(db: Session, user: User, robot_id: int, name: str):
    robot = _my_robot(db, user, robot_id, lock=True)
    robot.name = name
    db.flush()
    return _robot_response(robot)


def registration_park_id(db: Session, user: User, applicant_id: int) -> int:
    require_super_admin(user)
    park_id = db.scalar(
        select(Park.id).join(User, Park.user_id == User.id).where(User.id == applicant_id, User.role == "manager")
    )
    if park_id is None:
        raise AppError(404, "회원가입 신청을 찾을 수 없어요", code="registration_not_found")
    return park_id
