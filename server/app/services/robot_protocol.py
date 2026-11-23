"""로봇 메시지와 수신 번호를 같은 트랜잭션으로 저장해요."""

import base64
import binascii
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.models import (
    Detection,
    Notification,
    Park,
    Robot,
    RobotError,
    RobotMessageReceipt,
    RobotTask,
    RobotTaskPoint,
    RoutePoint,
)
from app.schemas.robot_protocol import RobotMessage
from app.services import photo_storage
from app.services.notifications import enqueue_notification
from app.services.photos import validate_image
from app.services.robot_coordinates import to_geo
from app.services.robot_tokens import token_matches


def utc(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def robot_record(db, robot_id, *, lock=False):
    statement = select(Robot).where(Robot.id == robot_id)
    if lock:
        statement = statement.with_for_update(of=Robot).execution_options(populate_existing=True)
    robot = db.scalar(statement)
    if robot is None:
        raise AppError(404, "로봇을 찾을 수 없어요", code="robot_not_found")
    return robot


def authenticate(db, robot_id, token):
    robot = robot_record(db, robot_id)
    if not token or len(token) > 256 or not token_matches(robot, token):
        raise AppError(401, "로봇 인증 정보를 확인해 주세요", code="robot_unauthorized")
    return robot


def task_record(db, robot, task_id):
    task = db.get(RobotTask, task_id)
    if task is None or task.robot_id != robot.id or task.park_id != robot.park_id or task.task_type != "patrol":
        raise AppError(404, "이 로봇의 순찰 기록을 찾을 수 없어요", code="robot_task_not_found")
    return task


def active_tasks(db, robot_id):
    return list(db.scalars(select(RobotTask).where(RobotTask.robot_id == robot_id, RobotTask.ended_at.is_(None))))


def notify(db, park_id, robot_id, kind, title, body, occurred_at, lat=None, lng=None):
    park = db.get(Park, park_id)
    enqueue_notification(
        db,
        Notification(
            user_id=park.user_id,
            recipient_role="manager",
            park_id=park.id,
            robot_id=robot_id,
            notification_type=kind,
            title=title,
            body=body,
            occurred_at=occurred_at,
            lat=lat,
            lng=lng,
        ),
    )


def ack(message):
    return {
        "type": "ack",
        "message_id": str(uuid4()),
        "request_id": str(message.message_id),
        "occurred_at": datetime.now(UTC).isoformat(),
        "data": {"result": "ok"},
    }


def _coordinates(db, robot, position):
    park = db.get(Park, robot.park_id) if robot.park_id else None
    return to_geo(park.anchor_points if park else [], position.x, position.y)


def _status(db, robot, message, payload, received):
    if payload.patrol_id is not None:
        task = task_record(db, robot, payload.patrol_id)
        if task.ended_at is not None:
            raise AppError(409, "이미 종료된 순찰이에요", code="robot_task_finished")
    if message.type == "hello" and payload.state == "idle" and payload.pending_count == 0:
        for task in active_tasks(db, robot.id):
            task.result, task.ended_at = "aborted", max(received, utc(task.started_at))
    robot.status = payload.state
    robot.slam_x, robot.slam_y = payload.position.x, payload.position.y
    robot.state.slam_yaw = payload.position.yaw
    robot.battery_voltage = payload.battery_voltage
    robot.last_seen_at, robot.state.updated_at = received, received
    try:
        robot.lat, robot.lng = _coordinates(db, robot, payload.position)
    except AppError as exc:
        if exc.code != "robot_anchors_required":
            raise
        robot.lat = robot.lng = None


def _event(db, robot, message, payload, received):
    task = task_record(db, robot, payload.patrol_id) if payload.patrol_id is not None else None
    if task and message.occurred_at < utc(task.started_at) - timedelta(seconds=5):
        raise AppError(422, "순찰 시작보다 이른 기록이에요", code="robot_event_time_invalid")
    if message.type == "point_arrived":
        point_id = db.scalar(
            select(RoutePoint.point_id).where(RoutePoint.route_id == task.route_id, RoutePoint.seq == payload.seq)
        )
        if point_id is None:
            raise AppError(422, "순찰 경로에 없는 지점이에요", code="robot_point_invalid")
        previous = db.scalar(
            select(RobotTaskPoint).where(RobotTaskPoint.task_id == task.id, RobotTaskPoint.seq == payload.seq)
        )
        if previous is not None:
            if previous.result != payload.result or previous.reason != payload.reason:
                raise AppError(409, "이미 다른 결과가 저장된 지점이에요", code="robot_point_conflict")
        else:
            db.add(
                RobotTaskPoint(
                    task_id=task.id,
                    seq=payload.seq,
                    point_id=point_id,
                    result=payload.result,
                    reason=payload.reason,
                    occurred_at=message.occurred_at,
                )
            )
    elif message.type == "patrol_end":
        if task.result is not None and task.result != payload.result:
            raise AppError(409, "이미 다른 종료 결과가 저장됐어요", code="robot_task_conflict")
        if task.ended_at is None:
            task.result, task.ended_at = payload.result, max(message.occurred_at, utc(task.started_at))
            db.flush()
            if not active_tasks(db, robot.id) and message.occurred_at >= utc(robot.state.updated_at):
                robot.status = "idle"
    elif message.type == "detection":
        previous = db.scalar(select(Detection).where(Detection.client_detection_id == payload.detection_id))
        if previous is not None:
            if previous.robot_id != robot.id or previous.task_id != task.id:
                raise AppError(409, "이미 사용 중인 탐지 번호예요", code="robot_detection_conflict")
            return
        lat, lng = _coordinates(db, robot, payload.position)
        if len(payload.image) > (get_settings().photo_max_bytes + 2) // 3 * 4:
            raise AppError(413, "사진 파일이 너무 커요", code="photo_too_large")
        try:
            image = base64.b64decode(payload.image, validate=True)
        except (ValueError, binascii.Error):
            raise AppError(422, "올바른 base64 사진을 보내 주세요", code="photo_invalid") from None
        validate_image(image, "image/jpeg")
        key = f"detections/{payload.detection_id}.jpg"
        db.add(
            Detection(
                park_id=task.park_id,
                robot_id=robot.id,
                task_id=task.id,
                client_detection_id=payload.detection_id,
                material=payload.material,
                confidence=payload.confidence,
                slam_x=payload.position.x,
                slam_y=payload.position.y,
                lat=lat,
                lng=lng,
                image_path=key,
                detected_at=message.occurred_at,
            )
        )
        db.flush()
        photo_storage.get_photo_storage().put(key, image, "image/jpeg")
    elif message.type == "pick_result":
        item = db.scalar(
            select(Detection).where(
                Detection.client_detection_id == payload.detection_id,
                Detection.robot_id == robot.id,
                Detection.task_id == task.id,
            )
        )
        if item is None:
            raise AppError(404, "탐지 기록을 먼저 보내 주세요", code="detection_not_found")
        if item.pickup_result is not None and (
            item.pickup_result != payload.result or item.pickup_fail_reason != payload.reason
        ):
            raise AppError(409, "이미 다른 수거 결과가 저장됐어요", code="robot_pickup_conflict")
        item.pickup_result, item.pickup_fail_reason = payload.result, payload.reason
    elif message.type == "error":
        lat, lng = _coordinates(db, robot, payload.position)
        park_id = task.park_id if task else robot.park_id
        if park_id is None:
            raise AppError(409, "공원 할당 후 오류 기록을 보낼 수 있어요", code="robot_park_required")
        db.add(
            RobotError(
                park_id=park_id,
                robot_id=robot.id,
                task_id=task.id if task else None,
                code=payload.code,
                action=payload.action,
                slam_x=payload.position.x,
                slam_y=payload.position.y,
                lat=lat,
                lng=lng,
                detail=payload.detail,
                occurred_at=message.occurred_at,
            )
        )
        if (task is None or task.ended_at is None) and message.occurred_at >= utc(robot.state.updated_at):
            robot.status = "returning" if payload.action == "returning" else "error"
        if task and task.ended_at is None and payload.action == "stopped":
            task.result, task.ended_at = "aborted", max(message.occurred_at, utc(task.started_at))
        notify(
            db, park_id, robot.id, "robot_error", "로봇 오류가 발생했어요", payload.code, message.occurred_at, lat, lng
        )
    robot.last_seen_at = received


def process_message(db: Session, robot_id: int, message: RobotMessage):
    received = datetime.now(UTC)
    if message.occurred_at > received + timedelta(seconds=30):
        raise AppError(422, "로봇 시계를 확인해 주세요", code="robot_event_time_invalid")
    try:
        robot = robot_record(db, robot_id, lock=True)
        key = {"robot_id": robot_id, "message_id": str(message.message_id)}
        seen = message.type != "status" and db.get(RobotMessageReceipt, key) is not None
        if seen and message.type != "hello":
            robot.last_seen_at = received
            db.commit()
            return ack(message)
        payload = message.payload()
        if message.type in ("hello", "status"):
            _status(db, robot, message, payload, received)
        elif message.type == "ack":
            raise AppError(422, "명령 응답은 연결에서 처리해 주세요", code="robot_message_invalid")
        else:
            _event(db, robot, message, payload, received)
        if message.type != "status" and not seen:
            db.add(RobotMessageReceipt(**key, message_type=message.type))
        db.commit()
        return None if message.type == "status" else ack(message)
    except AppError:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise AppError(503, "로봇 기록을 저장하지 못했어요", code="robot_storage_unavailable") from exc


def mark_offline(db, robot_id):
    robot = robot_record(db, robot_id, lock=True)
    robot.status = "offline"
    db.commit()
