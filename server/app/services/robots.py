"""관리자 공원에 배정된 로봇 조회·이름 변경·순찰 멈춤/다시 시작과 로봇 배정 요청을 처리해요.

실제 로봇에 명령을 보내는 브리지는 아직 없어서, 여기서는 순찰 제어 상태를 DB에 기록해요.
로봇 브리지가 생기면 patrol_state를 읽어 로봇을 멈추거나 돌려보내요.
"""

from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Park, Robot, RobotRequest, Schedule, User
from app.schemas.robots import (
    AdminRobotRequestResponse,
    ManagedRobot,
    PatrolPause,
    RobotRename,
    RobotRequestInput,
    RobotRequestResponse,
)
from app.services.auth import require_super_admin
from app.services.patrol import _park, _points, _route, transaction

KST = ZoneInfo("Asia/Seoul")


def _applies(repeat: str, day: datetime) -> bool:
    weekend = day.weekday() >= 5
    return repeat == "daily" or (repeat == "weekends") == weekend


def _patrol_plan(db: Session, park: Park, now: datetime) -> tuple[int, int, str | None]:
    """(순찰 지점 수, 오늘 순찰 횟수, 다음 순찰 시각 HH:mm)"""
    route = _route(db, park)
    point_count = len(_points(db, route)) if route else 0
    schedules = list(db.scalars(select(Schedule).where(Schedule.park_id == park.id, Schedule.enabled)))
    local = now.astimezone(KST)
    today = sorted(s.run_at for s in schedules if _applies(s.repeat, local))
    upcoming = [t for t in today if t > local.time().replace(second=0, microsecond=0)]
    if not upcoming:
        tomorrow = local + timedelta(days=1)
        upcoming = sorted(s.run_at for s in schedules if _applies(s.repeat, tomorrow))
    next_at: time | None = upcoming[0] if upcoming else None
    return point_count, len(today), next_at.strftime("%H:%M") if next_at else None


def _state(robot: Robot) -> str:
    if robot.status == "offline":
        return "disconnected"
    if robot.status == "working":
        return robot.patrol_state if robot.patrol_state in ("paused", "returning") else "patrolling"
    return robot.status  # idle · charging · error


def _response(robot: Robot, plan: tuple[int, int, str | None]) -> ManagedRobot:
    point_count, per_day, next_at = plan
    return ManagedRobot(
        id=str(robot.id),
        name=robot.name,
        state=_state(robot),
        battery=robot.battery,
        near_point=robot.near_point,
        next_point=robot.next_point,
        remaining_points=robot.remaining_points,
        paused_at=robot.paused_at,
        next_patrol_at=next_at,
        route_point_count=point_count,
        patrols_per_day=per_day,
        # 수거 기록 테이블이 생기면 오늘 수거 개수를 세요.
        today_pickups=0,
    )


def _my_robot(db: Session, park: Park, robot_id: int) -> Robot:
    robot = db.scalar(
        select(Robot)
        .where(Robot.id == robot_id, Robot.park_id == park.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if robot is None:
        raise AppError(404, "우리 공원에 배정된 로봇이 아니에요", code="robot_not_found")
    return robot


@transaction()
def list_robots(db: Session, user: User) -> list[ManagedRobot]:
    park = _park(db, user)
    plan = _patrol_plan(db, park, datetime.now(UTC))
    robots = db.scalars(select(Robot).where(Robot.park_id == park.id).order_by(Robot.id))
    return [_response(robot, plan) for robot in robots]


@transaction(write=True)
def rename(db: Session, user: User, robot_id: int, body: RobotRename) -> ManagedRobot:
    park = _park(db, user)
    robot = _my_robot(db, park, robot_id)
    taken = db.scalar(select(Robot.id).where(Robot.park_id == park.id, Robot.name == body.name, Robot.id != robot.id))
    if taken:
        raise AppError(409, "공원 안에 같은 이름의 로봇이 있어요", code="robot_name_taken")
    robot.name = body.name
    db.flush()
    return _response(robot, _patrol_plan(db, park, datetime.now(UTC)))


@transaction(write=True)
def pause(db: Session, user: User, robot_id: int, body: PatrolPause) -> ManagedRobot:
    park = _park(db, user)
    robot = _my_robot(db, park, robot_id)
    state = _state(robot)
    if state not in ("patrolling", "returning"):
        raise AppError(409, "순찰 중인 로봇만 멈출 수 있어요", code="robot_not_patrolling")
    if body.mode == "return":
        if state == "returning":
            raise AppError(409, "이미 분리수거장으로 돌아가고 있어요", code="robot_already_returning")
        robot.patrol_state = "returning"
    else:
        robot.patrol_state = "paused"
        robot.paused_at = datetime.now(UTC)
    db.flush()
    return _response(robot, _patrol_plan(db, park, datetime.now(UTC)))


@transaction(write=True)
def resume(db: Session, user: User, robot_id: int) -> ManagedRobot:
    """멈춘 로봇은 남은 지점부터 이어서, 대기 중인 로봇은 시간표를 기다리지 않고 바로 순찰해요."""
    park = _park(db, user)
    robot = _my_robot(db, park, robot_id)
    if _state(robot) not in ("paused", "idle"):
        raise AppError(409, "멈춰 있거나 대기 중인 로봇만 순찰을 시작할 수 있어요", code="robot_not_ready")
    robot.status = "working"
    robot.patrol_state = "patrolling"
    robot.paused_at = None
    db.flush()
    return _response(robot, _patrol_plan(db, park, datetime.now(UTC)))


def _request_response(request: RobotRequest) -> RobotRequestResponse:
    return RobotRequestResponse(
        id=str(request.id),
        count=request.count,
        memo=request.memo,
        status=request.status,
        created_at=request.created_at,
    )


@transaction()
def current_request(db: Session, user: User) -> RobotRequestResponse | None:
    park = _park(db, user)
    request = db.scalar(select(RobotRequest).where(RobotRequest.park_id == park.id, RobotRequest.status == "pending"))
    return _request_response(request) if request else None


@transaction(write=True)
def create_request(db: Session, user: User, body: RobotRequestInput) -> RobotRequestResponse:
    park = _park(db, user)
    if db.scalar(select(RobotRequest.id).where(RobotRequest.park_id == park.id, RobotRequest.status == "pending")):
        raise AppError(409, "이미 확인 중인 요청이 있어요", code="robot_request_exists")
    request = RobotRequest(
        park_id=park.id,
        requested_by=user.id,
        count=body.count,
        memo=body.memo or None,
        status="pending",
        created_at=datetime.now(UTC),
    )
    db.add(request)
    db.flush()
    return _request_response(request)


@transaction(write=True)
def cancel_request(db: Session, user: User, request_id: int) -> RobotRequestResponse:
    park = _park(db, user)
    request = db.scalar(
        select(RobotRequest).where(RobotRequest.id == request_id, RobotRequest.park_id == park.id).with_for_update()
    )
    if request is None:
        raise AppError(404, "로봇 요청을 찾을 수 없어요", code="robot_request_not_found")
    if request.status != "pending":
        raise AppError(409, "확인 중인 요청만 취소할 수 있어요", code="robot_request_not_pending")
    request.status = "canceled"
    request.resolved_at = datetime.now(UTC)
    db.flush()
    return _request_response(request)


@transaction()
def admin_requests(db: Session, user: User, status: str | None, limit: int, offset: int):
    require_super_admin(user)
    statement = select(RobotRequest, Park).join(Park, RobotRequest.park_id == Park.id)
    if status:
        statement = statement.where(RobotRequest.status == status)
    rows = db.execute(statement.order_by(RobotRequest.created_at, RobotRequest.id).limit(limit).offset(offset)).all()
    return [
        AdminRobotRequestResponse(
            **_request_response(request).model_dump(),
            park_id=str(park.id),
            park_name=park.catalog.name,
            requested_by=str(request.requested_by),
        )
        for request, park in rows
    ]
