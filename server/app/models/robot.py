"""총관리자가 등록하고 공원에 할당하는 로봇을 저장해요."""

from datetime import datetime

from sqlalchemy import REAL, BigInteger, CheckConstraint, DateTime, Double, ForeignKey, Identity, Integer, Text, func
from sqlalchemy.ext.associationproxy import association_proxy
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Robot(Base):
    __tablename__ = "robots"
    __table_args__ = (
        CheckConstraint(
            "(park_id IS NULL AND assigned_at IS NULL) OR (park_id IS NOT NULL AND assigned_at IS NOT NULL)",
            name="robot_assignment",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), Identity(always=True), primary_key=True
    )
    name: Mapped[str] = mapped_column(Text)
    serial_no: Mapped[str] = mapped_column(Text, unique=True)
    park_id: Mapped[int | None] = mapped_column(ForeignKey("parks.id"), index=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    auth_token_hash: Mapped[str | None] = mapped_column(Text)
    token_issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    state: Mapped["RobotState"] = relationship(
        cascade="all, delete-orphan", single_parent=True, lazy="selectin", uselist=False
    )

    def __init__(self, **kwargs):
        self.state = RobotState()
        super().__init__(**kwargs)

    status = association_proxy("state", "status")
    slam_x = association_proxy("state", "slam_x")
    slam_y = association_proxy("state", "slam_y")
    lat = association_proxy("state", "lat")
    lng = association_proxy("state", "lng")
    battery_voltage = association_proxy("state", "battery_voltage")
    last_seen_at = association_proxy("state", "last_seen_at")


class RobotState(Base):
    """로봇별 최신 상태를 저장해요. 고정 정보와 쓰기 주기를 분리해요."""

    __tablename__ = "robot_states"
    __table_args__ = (
        CheckConstraint(
            "status IN ('idle','working','returning','emptying','offline','error')", name="robot_state_status"
        ),
    )

    robot_id: Mapped[int] = mapped_column(ForeignKey("robots.id", ondelete="CASCADE"), primary_key=True)
    status: Mapped[str] = mapped_column(Text, default="offline", server_default="offline")
    slam_x: Mapped[float | None] = mapped_column(Double)
    slam_y: Mapped[float | None] = mapped_column(Double)
    lat: Mapped[float | None] = mapped_column(Double)
    lng: Mapped[float | None] = mapped_column(Double)
    battery_voltage: Mapped[float | None] = mapped_column(REAL)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    slam_yaw: Mapped[float | None] = mapped_column(Double)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
