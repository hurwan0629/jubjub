"""관리자 권한으로 로봇 상태·활동 기록과 좌표 기준점을 조회·수정해요."""

from sqlalchemy import select

from app.core.errors import AppError
from app.models import Detection, Park, RobotError, RobotTask, RobotTaskPoint
from app.services.approval import _robot_response
from app.services.auth import require_super_admin
from app.services.patrol import transaction
from app.services.robot_coordinates import to_slam
from app.services.robot_protocol import active_tasks, robot_record
from app.services.robot_tokens import issue_token


def owned_robot(db, user, robot_id, *, lock=False):
    robot = robot_record(db, robot_id, lock=lock)
    if user.role != "super_admin":
        park = db.get(Park, robot.park_id) if robot.park_id else None
        if park is None or park.user_id != user.id or park.status != "approved":
            raise AppError(404, "이 공원의 로봇을 찾을 수 없어요", code="robot_not_found")
    return robot


@transaction(write=True)
def rotate_token(db, user, robot_id):
    require_super_admin(user)
    robot = robot_record(db, robot_id, lock=True)
    token = issue_token(robot)
    db.flush()
    return {"robotId": str(robot.id), "authToken": token, "tokenIssuedAt": robot.token_issued_at}


@transaction()
def state(db, user, robot_id):
    robot = owned_robot(db, user, robot_id)
    tasks = active_tasks(db, robot.id)
    task = tasks[0] if tasks else None
    points = list(db.scalars(select(RobotTaskPoint).where(RobotTaskPoint.task_id == task.id))) if task else []
    return {
        **_robot_response(robot).model_dump(by_alias=True),
        "currentTaskId": str(task.id) if task else None,
        "processedPoints": len(points),
    }


def task_response(task):
    return {
        "id": str(task.id),
        "parkId": str(task.park_id),
        "robotId": str(task.robot_id),
        "taskType": task.task_type,
        "routeId": str(task.route_id) if task.route_id else None,
        "trigger": task.trigger,
        "startedAt": task.started_at,
        "endedAt": task.ended_at,
        "result": task.result,
    }


@transaction()
def records(db, user, robot_id, kind, limit, offset):
    robot = owned_robot(db, user, robot_id)
    model, timestamp = {
        "tasks": (RobotTask, RobotTask.started_at),
        "detections": (Detection, Detection.detected_at),
        "errors": (RobotError, RobotError.occurred_at),
    }[kind]
    statement = select(model).where(model.robot_id == robot.id)
    if user.role != "super_admin":
        statement = statement.where(model.park_id == robot.park_id)
    items = db.scalars(statement.order_by(timestamp.desc(), model.id.desc()).limit(limit).offset(offset))
    if kind == "tasks":
        return [task_response(item) for item in items]
    if kind == "detections":
        return [
            {
                "id": str(item.id),
                "robotId": str(item.robot_id),
                "taskId": str(item.task_id),
                "clientDetectionId": str(item.client_detection_id),
                "material": item.material,
                "confidence": item.confidence,
                "slamX": item.slam_x,
                "slamY": item.slam_y,
                "lat": item.lat,
                "lng": item.lng,
                "detectedAt": item.detected_at,
                "pickupResult": item.pickup_result,
                "pickupFailReason": item.pickup_fail_reason,
            }
            for item in items
        ]
    return [
        {
            "id": str(item.id),
            "robotId": str(item.robot_id),
            "taskId": str(item.task_id) if item.task_id else None,
            "code": item.code,
            "action": item.action,
            "detail": item.detail,
            "slamX": item.slam_x,
            "slamY": item.slam_y,
            "lat": item.lat,
            "lng": item.lng,
            "occurredAt": item.occurred_at,
        }
        for item in items
    ]


@transaction()
def task_points(db, user, robot_id, task_id):
    robot = owned_robot(db, user, robot_id)
    task = db.get(RobotTask, task_id)
    if task is None or task.robot_id != robot.id or (user.role != "super_admin" and task.park_id != robot.park_id):
        raise AppError(404, "순찰 기록을 찾을 수 없어요", code="robot_task_not_found")
    return [
        {
            "id": str(item.id),
            "taskId": str(item.task_id),
            "pointId": str(item.point_id),
            "seq": item.seq,
            "result": item.result,
            "reason": item.reason,
            "occurredAt": item.occurred_at,
        }
        for item in db.scalars(
            select(RobotTaskPoint).where(RobotTaskPoint.task_id == task.id).order_by(RobotTaskPoint.seq)
        )
    ]


@transaction(write=True)
def set_anchors(db, user, park_id, anchors):
    park = db.scalar(select(Park).where(Park.id == park_id).with_for_update(of=Park))
    if park is None or (user.role != "super_admin" and (park.user_id != user.id or park.status != "approved")):
        raise AppError(404, "공원을 찾을 수 없어요", code="park_not_found")
    if db.scalar(select(RobotTask.id).where(RobotTask.park_id == park.id, RobotTask.ended_at.is_(None))):
        raise AppError(409, "진행 중인 작업이 끝난 뒤 기준점을 변경해 주세요", code="robot_task_active")
    values = [item.model_dump() for item in anchors]
    to_slam(values, values[0]["lat"], values[0]["lng"])
    park.anchor_points = values
    return {"parkId": str(park.id), "anchorPoints": values}
