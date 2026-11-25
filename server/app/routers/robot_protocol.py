"""로봇용 WebSocket과 관리자용 상태·기록·제어 API를 연결해요."""

import asyncio
import json
import logging
import time
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, Response, WebSocket, WebSocketDisconnect
from pydantic import Field, ValidationError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import AppError, error_body
from app.models import Park
from app.routers.patrol import DB, Admin
from app.schemas.robot_protocol import Finite, Input, RobotMessage
from app.services import robot_api, robot_commands, robot_protocol

logger = logging.getLogger(__name__)
router = APIRouter(tags=["robot-protocol"])
socket_router = APIRouter()
RobotID = Annotated[int, Path(ge=1, le=9223372036854775807)]


class Anchor(Input):
    name: str = Field(default="", max_length=100)
    lat: Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]
    lng: Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]
    slam_x: Finite
    slam_y: Finite


class Anchors(Input):
    anchorPoints: list[Anchor] = Field(min_length=2, max_length=20)


@router.post("/admin/robots/{robot_id}/token")
async def rotate(robot_id: RobotID, db: DB, user: Admin, request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    result = robot_api.rotate_token(db, user, robot_id)
    await request.app.state.robot_connections.disconnect(robot_id)
    return result


@router.get("/robots/{robot_id}/state")
def state(robot_id: RobotID, db: DB, user: Admin):
    return robot_api.state(db, user, robot_id)


@router.get("/robots/{robot_id}/tasks")
def tasks(robot_id: RobotID, db: DB, user: Admin, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    return robot_api.records(db, user, robot_id, "tasks", limit, offset)


@router.get("/robots/{robot_id}/detections")
def detections(
    robot_id: RobotID, db: DB, user: Admin, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)
):
    return robot_api.records(db, user, robot_id, "detections", limit, offset)


@router.get("/robots/{robot_id}/errors")
def errors(robot_id: RobotID, db: DB, user: Admin, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    return robot_api.records(db, user, robot_id, "errors", limit, offset)


@router.get("/robots/{robot_id}/tasks/{task_id}/points")
def points(robot_id: RobotID, task_id: RobotID, db: DB, user: Admin):
    return robot_api.task_points(db, user, robot_id, task_id)


@router.post("/robots/{robot_id}/patrol/start")
async def start(robot_id: RobotID, db: DB, user: Admin, request: Request):
    return await robot_commands.start(db, user, robot_id, request.app.state.robot_connections)


@router.post("/robots/{robot_id}/patrol/stop")
async def stop(robot_id: RobotID, db: DB, user: Admin, request: Request):
    return await robot_commands.stop(db, user, robot_id, request.app.state.robot_connections)


@router.put("/park/anchors")
def my_anchors(body: Anchors, db: DB, user: Admin):
    park = db.query(Park).filter(Park.user_id == user.id).first()
    if park is None:
        raise AppError(404, "담당 공원을 찾을 수 없어요", code="park_not_found")
    return robot_api.set_anchors(db, user, park.id, body.anchorPoints)


@router.put("/admin/parks/{park_id}/anchors")
def admin_anchors(park_id: RobotID, body: Anchors, db: DB, user: Admin):
    from app.services.auth import require_super_admin

    require_super_admin(user)
    return robot_api.set_anchors(db, user, park_id, body.anchorPoints)


@socket_router.websocket("/ws/robots")
async def robot_socket(socket: WebSocket, db: Annotated[Session, Depends(get_db)]):
    connections = socket.app.state.robot_connections
    try:
        raw_id = socket.headers.get("x-robot-id", "")
        authorization = socket.headers.get("authorization", "")
        token = authorization[7:] if authorization.startswith("Bearer ") else ""
        if not raw_id.isdecimal() or not 0 < int(raw_id) <= 9223372036854775807:
            raise AppError(401, "로봇 인증 정보를 확인해 주세요", code="robot_unauthorized")
        robot_id = int(raw_id)
        robot_protocol.authenticate(db, robot_id, token)
        db.rollback()
    except AppError:
        await socket.close(code=4401)
        return
    await socket.accept()
    connection = await connections.attach(robot_id, socket)
    try:
        while connections.current(robot_id, connection):
            remaining = get_settings().robot_heartbeat_timeout_seconds - (time.monotonic() - connection.last_seen)
            if remaining <= 0:
                break
            raw = await asyncio.wait_for(socket.receive_text(), remaining)
            if not connections.current(robot_id, connection):
                break
            if len(raw.encode()) > get_settings().photo_max_bytes * 4 // 3 + 16384:
                await socket.close(code=1009)
                break
            try:
                db.expire_all()
                robot_protocol.authenticate(db, robot_id, token)
                db.rollback()
                message = RobotMessage.model_validate(json.loads(raw))
                if not connection.ready and message.type != "hello":
                    raise AppError(409, "hello 메시지를 먼저 보내 주세요", code="robot_hello_required")
                if message.type == "ack":
                    if connections.resolve(connection, message):
                        connection.last_seen = time.monotonic()
                    continue
                response = robot_protocol.process_message(db, robot_id, message)
                connection.last_seen = time.monotonic()
                if message.type == "hello":
                    connection.ready = True
                if response:
                    await socket.send_json(response)
            except (ValidationError, ValueError):
                db.rollback()
                await socket.send_json(error_body(422, "로봇 메시지 형식을 확인해 주세요", "robot_message_invalid"))
            except AppError as exc:
                db.rollback()
                await socket.send_json(error_body(exc.status, exc.message, exc.code))
                if exc.status == 401:
                    await socket.close(code=4401)
                    break
    except (WebSocketDisconnect, TimeoutError, RuntimeError):
        pass
    finally:
        if connections.current(robot_id, connection):
            connections.connections.pop(robot_id, None)
            try:
                robot_protocol.mark_offline(db, robot_id)
            except Exception:
                db.rollback()
                logger.warning("로봇 연결 종료 상태를 저장하지 못했어요: %s", robot_id)
            # 상태 저장 뒤에 양보해야 새 연결의 hello를 offline으로 덮어쓰지 않아요.
            await connections._close(connection, 4000)
