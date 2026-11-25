"""로봇 통신의 지점 처리·오류·중복 수신 기록을 저장해요."""

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Double,
    ForeignKey,
    Identity,
    Index,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.patrol import ID


class RobotTaskPoint(Base):
    __tablename__ = "robot_task_points"
    __table_args__ = (
        UniqueConstraint("task_id", "seq"),
        CheckConstraint("seq >= 0", name="task_point_sequence"),
        CheckConstraint("result IN ('arrived','skipped')", name="task_point_result"),
        CheckConstraint(
            "(result = 'arrived' AND reason IS NULL) OR (result = 'skipped' AND reason IS NOT NULL AND length(trim(reason)) > 0)",
            name="task_point_reason",
        ),
    )
    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("robot_tasks.id"))
    seq: Mapped[int] = mapped_column(SmallInteger)
    point_id: Mapped[int] = mapped_column(ForeignKey("points.id"), index=True)
    result: Mapped[str] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RobotError(Base):
    __tablename__ = "robot_errors"
    __table_args__ = (
        CheckConstraint(
            "code IN ('path_blocked','pick_failed_repeatedly','low_battery','return_failed','device_failure')",
            name="robot_error_code",
        ),
        CheckConstraint("action IN ('returning','stopped')", name="robot_error_action"),
        CheckConstraint("lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180", name="robot_error_coordinates"),
        Index("ix_robot_errors_robot_time", "robot_id", "occurred_at"),
        Index("ix_robot_errors_park_time", "park_id", "occurred_at"),
    )
    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    park_id: Mapped[int] = mapped_column(ForeignKey("parks.id"))
    robot_id: Mapped[int] = mapped_column(ForeignKey("robots.id"))
    task_id: Mapped[int | None] = mapped_column(ForeignKey("robot_tasks.id"), index=True)
    code: Mapped[str] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text)
    slam_x: Mapped[float] = mapped_column(Double)
    slam_y: Mapped[float] = mapped_column(Double)
    lat: Mapped[float] = mapped_column(Double)
    lng: Mapped[float] = mapped_column(Double)
    detail: Mapped[str | None] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RobotMessageReceipt(Base):
    __tablename__ = "robot_message_receipts"
    __table_args__ = (Index("ix_robot_message_receipts_received_at", "received_at"),)
    robot_id: Mapped[int] = mapped_column(ForeignKey("robots.id"), primary_key=True)
    message_id: Mapped[str] = mapped_column(Text, primary_key=True)
    message_type: Mapped[str] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
