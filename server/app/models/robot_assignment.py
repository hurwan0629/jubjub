"""로봇 배정 요청과 승인 당시 배정된 로봇 이력을 보존해요."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Identity, Index, Integer, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.patrol import ID


class RobotAssignmentRequest(Base):
    __tablename__ = "robot_assignment_requests"
    __table_args__ = (
        CheckConstraint("robot_count BETWEEN 1 AND 100", name="assignment_request_count"),
        CheckConstraint("status IN ('pending','approved','rejected','cancelled')", name="assignment_request_status"),
        CheckConstraint("length(reason) <= 1000", name="assignment_request_reason"),
        CheckConstraint(
            "(status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND reject_reason IS NULL) OR "
            "(status IN ('approved','cancelled') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reject_reason IS NULL) OR "
            "(status = 'rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reject_reason IS NOT NULL AND length(trim(reject_reason)) > 0)",
            name="assignment_request_review",
        ),
        Index(
            "uq_robot_assignment_requests_pending",
            "park_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
            sqlite_where=text("status = 'pending'"),
        ),
        Index("ix_robot_assignment_requests_user_time", "user_id", "created_at"),
        Index("ix_robot_assignment_requests_status_time", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    park_id: Mapped[int] = mapped_column(ForeignKey("parks.id"))
    catalog_id: Mapped[int] = mapped_column(ForeignKey("park_catalog_entries.id"))
    robot_count: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(Text, server_default="")
    status: Mapped[str] = mapped_column(Text, server_default="pending")
    reject_reason: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RobotAssignmentRequestRobot(Base):
    __tablename__ = "robot_assignment_request_robots"

    request_id: Mapped[int] = mapped_column(ForeignKey("robot_assignment_requests.id"), primary_key=True)
    robot_id: Mapped[int] = mapped_column(ForeignKey("robots.id"), primary_key=True, index=True)
