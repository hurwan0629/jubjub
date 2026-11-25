"""연결이 끊겨도 진행 중인 작업이 있으면 로봇을 다른 공원으로 옮기지 않아요."""

from sqlalchemy import select

from app.models import RobotTask


def has_active_tasks(db, robot_ids):
    return (
        db.scalar(
            select(RobotTask.id).where(RobotTask.robot_id.in_(list(robot_ids)), RobotTask.ended_at.is_(None)).limit(1)
        )
        is not None
    )
