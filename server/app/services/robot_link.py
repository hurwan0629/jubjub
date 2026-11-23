"""로봇 WebSocket 메시지 처리와 끊김 감시 (Confluence "로봇 - 서버" 1-1, 2장, 4-1, 4-3).

지금 처리하는 메시지
- hello: robot_states 갱신 후 ack
- status: robot_states 갱신 (ack 없음)
- ack: 로봇이 서버 명령에 답한 것. 지금은 로그만 남겨요 (순찰 명령을 만들 때 연결)

순찰·탐지·오류 같은 결과 메시지는 아직 저장하지 않아요. 저장하지 않은 결과에 ack를 보내면
로봇이 결과를 지워 버리므로 ack도 보내지 않아요 (로봇은 재접속 때 다시 보내요).
"""

import asyncio
import logging
import time
from datetime import UTC, datetime, timedelta

from pydantic import ValidationError
from sqlalchemy import update
from sqlalchemy.orm import sessionmaker
from starlette.concurrency import run_in_threadpool

from app.models import RobotState
from app.schemas.robot_ws import HelloData, RobotMessage, StatusData, ack
from app.services.robot_connections import CLOSE_STALE, RobotConnection, RobotConnectionManager

logger = logging.getLogger(__name__)

# create_task로 띄운 작업이 끝나기 전에 사라지지 않게 참조를 잡아 둬요
_background_tasks: set[asyncio.Task] = set()


# ---------- DB (동기 함수, run_in_threadpool로 불러요) ----------


def save_state(session_factory: sessionmaker, robot_id: int, data: StatusData) -> None:
    """hello·status 내용으로 로봇 최신 상태를 덮어써요. 위경도(lat·lng) 변환은 공원 기준점이 정해지면 추가해요."""
    with session_factory() as db:
        state = db.get(RobotState, robot_id)
        if state is None:
            state = RobotState(robot_id=robot_id)
            db.add(state)
        state.status = data.state
        state.slam_x = data.position.x
        state.slam_y = data.position.y
        state.slam_yaw = data.position.yaw
        state.battery_voltage = data.battery_voltage
        state.last_seen_at = datetime.now(UTC)
        db.commit()


def mark_offline(session_factory: sessionmaker, robot_id: int) -> None:
    with session_factory() as db:
        db.execute(update(RobotState).where(RobotState.robot_id == robot_id).values(status="offline"))
        db.commit()


def mark_stale_offline(session_factory: sessionmaker, cutoff: datetime, connected_ids: set[int]) -> int:
    """연결이 없고 last_seen_at이 cutoff보다 오래된 로봇을 offline으로 바꿔요.

    서버가 다시 켜졌을 때 DB에 남아 있던 이전 상태(idle·working 등)를 정리하는 역할도 해요.
    """
    query = update(RobotState).where(
        RobotState.status != "offline",
        (RobotState.last_seen_at.is_(None)) | (RobotState.last_seen_at < cutoff),
    )
    if connected_ids:
        query = query.where(RobotState.robot_id.not_in(connected_ids))
    with session_factory() as db:
        result = db.execute(query.values(status="offline"))
        db.commit()
        return result.rowcount or 0


# ---------- 메시지 처리 ----------


async def handle_message(connection: RobotConnection, raw: str, session_factory: sessionmaker) -> None:
    try:
        message = RobotMessage.model_validate_json(raw)
    except ValidationError as exc:
        logger.warning("로봇 %s: 형식이 맞지 않는 메시지를 버려요 (%s)", connection.robot_id, exc.errors()[:1])
        return

    connection.touch()

    if message.type in ("hello", "status"):
        model = HelloData if message.type == "hello" else StatusData
        try:
            data = model.model_validate(message.data)
        except ValidationError as exc:
            logger.warning("로봇 %s: %s 내용이 맞지 않아요 (%s)", connection.robot_id, message.type, exc.errors()[:1])
            return
        await run_in_threadpool(save_state, session_factory, connection.robot_id, data)
        if message.type == "hello":
            logger.info(
                "로봇 %s hello: state=%s pending=%s", connection.robot_id, data.state, getattr(data, "pending_count", 0)
            )
            await connection.send(ack(message.message_id))
    elif message.type == "ack":
        logger.info("로봇 %s ack: request_id=%s data=%s", connection.robot_id, message.request_id, message.data)
    else:
        logger.info("로봇 %s: 아직 처리하지 않는 메시지 type=%s", connection.robot_id, message.type)


# ---------- 끊김 감시 (백그라운드) ----------


async def sweep(session_factory: sessionmaker, manager: RobotConnectionManager, offline_after: float) -> None:
    """1) 메모리의 연결 중 오래 소식이 없는 것을 닫고 offline으로, 2) DB에만 남은 오래된 상태도 offline으로."""
    for connection in manager.stale(time.monotonic() - offline_after):
        if manager.unregister(connection):
            logger.warning("로봇 %s: %s초 넘게 소식이 없어 연결을 끊어요", connection.robot_id, offline_after)
            await run_in_threadpool(mark_offline, session_factory, connection.robot_id)
            # Wi-Fi가 갑자기 끊기면 닫기 응답을 기다리다 멈출 수 있어서 기다리지 않고 닫아요
            task = asyncio.create_task(connection.close(CLOSE_STALE, "stale"))
            _background_tasks.add(task)
            task.add_done_callback(_background_tasks.discard)

    cutoff = datetime.now(UTC) - timedelta(seconds=offline_after)
    await run_in_threadpool(mark_stale_offline, session_factory, cutoff, manager.connected_ids())


async def run_watchdog(
    session_factory: sessionmaker, manager: RobotConnectionManager, interval: float, offline_after: float
) -> None:
    logger.info("로봇 끊김 감시 시작: %s초마다, %s초 기준", interval, offline_after)
    while True:
        try:
            await sweep(session_factory, manager, offline_after)
        except Exception:
            # DB가 잠깐 안 돼도 감시는 계속 돌아야 해요
            logger.exception("로봇 끊김 감시 중 에러")
        await asyncio.sleep(interval)
