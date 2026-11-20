"""총관리자가 등록하고 공원에 할당하는 로봇과, 관리자의 로봇 배정 요청을 저장해요."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    SmallInteger,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

ID = BigInteger().with_variant(Integer, "sqlite")


class Robot(Base):
    __tablename__ = "robots"
    __table_args__ = (
        CheckConstraint("status IN ('idle', 'working', 'charging', 'offline', 'error')", name="robot_status"),
        CheckConstraint(
            "(park_id IS NULL AND assigned_at IS NULL) OR (park_id IS NOT NULL AND assigned_at IS NOT NULL)",
            name="robot_assignment",
        ),
        # 순찰 제어 상태 (A-01 순찰 멈추기). working일 때만 의미가 있어요.
        CheckConstraint(
            "patrol_state IS NULL OR patrol_state IN ('patrolling', 'paused', 'returning')",
            name="robot_patrol_state",
        ),
        CheckConstraint("battery IS NULL OR battery BETWEEN 0 AND 100", name="robot_battery"),
    )

    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    serial_no: Mapped[str] = mapped_column(Text, unique=True)
    park_id: Mapped[int | None] = mapped_column(ForeignKey("parks.id"), index=True)
    status: Mapped[str] = mapped_column(Text, server_default="offline")
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # 로봇 브리지가 채우는 최근 상태. 아직 연결 전이면 비어 있어요.
    patrol_state: Mapped[str | None] = mapped_column(Text)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    battery: Mapped[int | None] = mapped_column(SmallInteger)
    near_point: Mapped[str | None] = mapped_column(Text)
    next_point: Mapped[str | None] = mapped_column(Text)
    remaining_points: Mapped[int | None] = mapped_column(SmallInteger)
    # 비우러 가는 분리수거장 (없으면 공원의 기본 분리수거장)
    station_id: Mapped[int | None] = mapped_column(ForeignKey("points.id"))


class RobotRequest(Base):
    """관리자가 총관리자에게 보내는 로봇 배정·추가 요청 (A-01 · A-13)."""

    __tablename__ = "robot_requests"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'approved', 'rejected', 'canceled')", name="robot_request_status"),
        CheckConstraint("count BETWEEN 1 AND 5", name="robot_request_count"),
        # 공원마다 확인 중인 요청은 하나만 둬요.
        Index(
            "uq_robot_requests_pending_park",
            "park_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
            sqlite_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    park_id: Mapped[int] = mapped_column(ForeignKey("parks.id"), index=True)
    requested_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    count: Mapped[int] = mapped_column(SmallInteger)
    memo: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
