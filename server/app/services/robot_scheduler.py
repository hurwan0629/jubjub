"""한국 시간의 시간표를 확인하고 순찰 시작 기록으로 중복 실행을 막아요."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta, timezone

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models import Park, Robot, Schedule
from app.services.robot_commands import start

logger = logging.getLogger(__name__)
KST = timezone(timedelta(hours=9))


def due_robots(db, now):
    local = now.astimezone(KST)
    repeat = "weekends" if local.weekday() >= 5 else "weekdays"
    rows = db.execute(
        select(Schedule.robot_id, Schedule.run_at)
        .join(Robot, Robot.id == Schedule.robot_id)
        .join(Park, Park.id == Schedule.park_id)
        .where(
            Schedule.enabled.is_(True),
            Schedule.robot_id.is_not(None),
            Robot.park_id == Schedule.park_id,
            Park.status == "approved",
            Schedule.repeat.in_(["daily", repeat]),
        )
    ).all()
    return {robot_id for robot_id, run_at in rows if (run_at.hour, run_at.minute) == (local.hour, local.minute)}


async def run_due(connections, now=None, session_factory=SessionLocal):
    now = now or datetime.now(UTC)
    with session_factory() as db:
        ids = due_robots(db, now)

    async def launch(robot_id):
        with session_factory() as db:
            try:
                await start(db, None, robot_id, connections, "schedule", now.replace(second=0, microsecond=0))
            except Exception:
                db.rollback()
                logger.warning("시간표 순찰 요청을 처리하지 못했어요: %s", robot_id)

    await asyncio.gather(*(launch(robot_id) for robot_id in ids))


async def scheduler_loop(connections):
    while True:
        try:
            await run_due(connections)
        except Exception:
            logger.warning("로봇 순찰 시간표를 확인하지 못했어요")
        await asyncio.sleep(5)
