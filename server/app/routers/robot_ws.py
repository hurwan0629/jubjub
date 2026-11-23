"""로봇 접속 WebSocket (/ws/robot).

로봇(또는 시뮬레이터)이 헤더에 로봇 id와 토큰을 넣어 접속해요.
    X-Robot-Id: 1
    Authorization: Bearer <발급받은 토큰>

앱 사용자 JWT가 아니라 로봇 토큰으로 인증하므로 routers/api.py가 아닌 main.py에 등록해요.
"""

import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import sessionmaker
from starlette.concurrency import run_in_threadpool

from app.core.db import SessionLocal
from app.services import robot_auth, robot_link
from app.services.robot_connections import manager

logger = logging.getLogger(__name__)

router = APIRouter()


def get_session_factory() -> sessionmaker:
    """연결이 오래 유지되므로 요청 하나에 세션 하나(get_db)가 아니라, 메시지마다 세션을 새로 열어요."""
    return SessionLocal


def read_credentials(websocket: WebSocket) -> tuple[int | None, str]:
    raw_id = websocket.headers.get("x-robot-id", "")
    robot_id = int(raw_id) if raw_id.isdigit() else None
    scheme, _, token = websocket.headers.get("authorization", "").partition(" ")
    return robot_id, token.strip() if scheme.lower() == "bearer" else ""


@router.websocket("/ws/robot")
async def robot_socket(websocket: WebSocket, session_factory: sessionmaker = Depends(get_session_factory)) -> None:
    robot_id, token = read_credentials(websocket)
    if robot_id is None or not await run_in_threadpool(robot_auth.authenticate, session_factory, robot_id, token):
        logger.warning("로봇 접속 거절: id=%s (토큰 없음 또는 불일치)", robot_id)
        # accept 전에 닫으면 접속 요청 자체가 403으로 거절돼요. 로봇은 이걸 보고 재시도하지 않아요.
        await websocket.close(code=1008)
        return

    await websocket.accept()
    connection = await manager.register(robot_id, websocket)
    logger.info("로봇 %s 연결됨", robot_id)

    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            text = message.get("text")
            if text is None:
                logger.warning("로봇 %s: 바이너리 메시지는 받지 않아요 (사진은 detection의 base64로)", robot_id)
                continue
            await robot_link.handle_message(connection, text, session_factory)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        # 새 연결로 교체됐거나 감시가 이미 끊었다면 상태를 건드리지 않아요
        if manager.unregister(connection):
            await run_in_threadpool(robot_link.mark_offline, session_factory, robot_id)
        logger.info("로봇 %s 연결 끊김", robot_id)
