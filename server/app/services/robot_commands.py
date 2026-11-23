"""순찰 기록을 먼저 확정하고 로봇의 수락·종료를 따로 처리해요."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.core.errors import AppError
from app.models import Park, PatrolPoint, RecyclingStation, RobotTask, Route, RoutePoint
from app.services.robot_api import owned_robot, task_response
from app.services.robot_coordinates import to_slam
from app.services.robot_protocol import active_tasks, notify, robot_record, utc


def _missed(db, task, when):
    task.started_at = task.ended_at = when
    task.result = "missed"
    notify(
        db,
        task.park_id,
        task.robot_id,
        "patrol_missed",
        "순찰을 시작하지 못했어요",
        "연결 상태와 로봇 상태를 확인해 주세요",
        when,
    )


def prepare_start(db, user, robot_id, connected, trigger, planned=None):
    try:
        robot = owned_robot(db, user, robot_id, lock=True) if user else robot_record(db, robot_id, lock=True)
        park = db.get(Park, robot.park_id) if robot.park_id else None
        if park is None or park.status != "approved":
            raise AppError(409, "승인된 공원에 로봇을 할당해 주세요", code="robot_park_required")
        route = db.scalar(
            select(Route).where(Route.robot_id == robot.id, Route.park_id == park.id, Route.is_active.is_(True))
        )
        if route is None:
            raise AppError(409, "활성 순찰 경로를 먼저 저장해 주세요", code="robot_route_required")
        when = planned or datetime.now(UTC)
        if planned:
            existing = db.scalar(
                select(RobotTask).where(
                    RobotTask.robot_id == robot.id,
                    RobotTask.trigger == "schedule",
                    RobotTask.started_at >= planned,
                    RobotTask.started_at < planned + timedelta(minutes=1),
                )
            )
            if existing:
                db.rollback()
                return existing.id, None
        busy = bool(active_tasks(db, robot.id)) or robot.status != "idle" or not connected
        task = RobotTask(
            park_id=park.id, robot_id=robot.id, task_type="patrol", route_id=route.id, trigger=trigger, started_at=when
        )
        db.add(task)
        db.flush()
        data = None
        if busy:
            _missed(db, task, when)
        else:
            station = db.get(RecyclingStation, route.default_station_id)
            if station is None or station.park_id != park.id or station.deleted_at:
                raise AppError(409, "경로의 분리수거장을 확인해 주세요", code="robot_station_invalid")
            points = db.execute(
                select(RoutePoint.seq, PatrolPoint)
                .join(PatrolPoint, RoutePoint.point_id == PatrolPoint.id)
                .where(RoutePoint.route_id == route.id)
                .order_by(RoutePoint.seq)
            ).all()
            if not points:
                raise AppError(409, "순찰 지점을 먼저 저장해 주세요", code="robot_route_required")
            data = {
                "patrol_id": task.id,
                "home": to_slam(park.anchor_points, station.lat, station.lng),
                "points": [{"seq": seq, **to_slam(park.anchor_points, point.lat, point.lng)} for seq, point in points],
            }
        db.commit()
        return task.id, data
    except Exception:
        db.rollback()
        raise


def finish_start(db, robot_id, task_id, accepted):
    try:
        robot = robot_record(db, robot_id, lock=True)
        task = db.get(RobotTask, task_id)
        if accepted:
            route = db.get(Route, task.route_id)
            if route.applied_at is None:
                route.applied_at = datetime.now(UTC)
            if task.ended_at is None and robot.status == "idle":
                robot.status = "working"
        elif task.ended_at is None:
            _missed(db, task, utc(task.started_at))
        db.commit()
        return task_response(task)
    except Exception:
        db.rollback()
        raise


async def start(db, user, robot_id, connections, trigger="request", planned=None):
    task_id, data = prepare_start(db, user, robot_id, connections.connected(robot_id), trigger, planned)
    if data is None:
        return task_response(db.get(RobotTask, task_id))
    # 응답을 받지 못하면 실제 출발했을 수도 있어 기록을 진행 중으로 남겨 재접속 때 대조해요.
    result = await connections.command(robot_id, "patrol_start", data, get_settings().robot_command_timeout_seconds)
    response = finish_start(db, robot_id, task_id, result.result == "accepted")
    return {**response, "accepted": result.result == "accepted", "reason": result.reason}


async def stop(db, user, robot_id, connections):
    robot = owned_robot(db, user, robot_id, lock=True)
    tasks = active_tasks(db, robot.id)
    if not tasks:
        db.rollback()
        raise AppError(409, "진행 중인 순찰이 없어요", code="robot_task_not_active")
    task_id = tasks[0].id
    db.rollback()
    result = await connections.command(
        robot_id, "patrol_stop", {"patrol_id": task_id}, get_settings().robot_command_timeout_seconds
    )
    robot = robot_record(db, robot_id, lock=True)
    task = db.get(RobotTask, task_id)
    if result.result == "accepted" and task.ended_at is None:
        robot.status = "returning"
    db.commit()
    return {"taskId": str(task_id), "accepted": result.result == "accepted", "reason": result.reason}
