"""총관리자가 등록하고 공원에 할당하는 로봇을 저장해요."""

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Identity, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Robot(Base):
    __tablename__ = "robots"
    __table_args__ = (
        CheckConstraint("status IN ('idle', 'working', 'charging', 'offline', 'error')", name="robot_status"),
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
    status: Mapped[str] = mapped_column(Text, server_default="offline")
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
