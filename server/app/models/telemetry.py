"""탐지·작업 이력과 관리자별 알림·푸시 기기를 저장해요."""

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Double, ForeignKey, Identity, Index, Text, false, func, true
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.patrol import ID


class Detection(Base):
    __tablename__ = "detections"
    __table_args__ = (
        CheckConstraint("material IN ('plastic', 'can', 'glass', 'general')", name="detection_material"),
        CheckConstraint("pickup_result IS NULL OR pickup_result IN ('collected', 'failed')", name="detection_result"),
        CheckConstraint("lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180", name="detection_coordinates"),
        Index("ix_detections_park_time", "park_id", "detected_at"),
        Index("ix_detections_robot_time", "robot_id", "detected_at"),
    )
    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    park_id: Mapped[int] = mapped_column(ForeignKey("parks.id"))
    robot_id: Mapped[int] = mapped_column(ForeignKey("robots.id"))
    material: Mapped[str] = mapped_column(Text)
    slam_x: Mapped[float] = mapped_column(Double)
    slam_y: Mapped[float] = mapped_column(Double)
    lat: Mapped[float] = mapped_column(Double)
    lng: Mapped[float] = mapped_column(Double)
    image_path: Mapped[str] = mapped_column(Text)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    pickup_result: Mapped[str | None] = mapped_column(Text)


class RobotTask(Base):
    __tablename__ = "robot_tasks"
    __table_args__ = (
        CheckConstraint("task_type IN ('patrol', 'station_move')", name="task_type"),
        CheckConstraint("result IS NULL OR result IN ('success', 'failed')", name="task_result"),
        CheckConstraint(
            "(task_type = 'patrol' AND route_id IS NOT NULL AND trigger IN ('schedule', 'request') AND trigger IS NOT NULL) OR "
            "(task_type = 'station_move' AND route_id IS NULL AND trigger IS NULL)",
            name="task_patrol_metadata",
        ),
        CheckConstraint(
            "(ended_at IS NULL AND result IS NULL) OR "
            "(ended_at IS NOT NULL AND result IS NOT NULL AND ended_at >= started_at)",
            name="task_completion",
        ),
        Index("ix_robot_tasks_park_time", "park_id", "started_at"),
        Index("ix_robot_tasks_robot_time", "robot_id", "started_at"),
    )
    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    park_id: Mapped[int] = mapped_column(ForeignKey("parks.id"))
    robot_id: Mapped[int] = mapped_column(ForeignKey("robots.id"))
    task_type: Mapped[str] = mapped_column(Text)
    route_id: Mapped[int | None] = mapped_column(ForeignKey("routes.id"), index=True)
    trigger: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    result: Mapped[str | None] = mapped_column(Text)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint("recipient_role IN ('manager', 'super_admin')", name="notification_role"),
        CheckConstraint(
            "(lat IS NULL AND lng IS NULL) OR "
            "(lat IS NOT NULL AND lng IS NOT NULL AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)",
            name="notification_coordinates",
        ),
        Index("ix_notifications_inbox", "user_id", "is_read", "occurred_at"),
    )
    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    recipient_role: Mapped[str] = mapped_column(Text)
    park_id: Mapped[int | None] = mapped_column(ForeignKey("parks.id"), index=True)
    robot_id: Mapped[int | None] = mapped_column(ForeignKey("robots.id"), index=True)
    notification_type: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    lat: Mapped[float | None] = mapped_column(Double)
    lng: Mapped[float | None] = mapped_column(Double)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    is_read: Mapped[bool] = mapped_column(Boolean, server_default=false())


class PushToken(Base):
    __tablename__ = "push_tokens"
    __table_args__ = (
        CheckConstraint("platform IN ('android', 'ios')", name="push_platform"),
        CheckConstraint("length(trim(token)) > 0", name="push_token_nonempty"),
        CheckConstraint("updated_at >= created_at", name="push_token_timestamps"),
    )
    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token: Mapped[str] = mapped_column(Text, unique=True)
    platform: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
