"""관리자 앱 알림(A-05 · A-06)과 공원 변경 요청(C-02)을 저장해요."""

from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Text,
    false,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

ID = BigInteger().with_variant(Integer, "sqlite")
DOCUMENT = JSON().with_variant(JSONB, "postgresql")


class Notification(Base):
    """관리자에게 보여 줄 알림. 유형별 상세 값(사진·재확인·로봇 오류·공원 변경)은 payload에 담아요."""

    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint(
            "type IN ('robotError', 'unpickable', 'lowBattery', 'dailyReport', 'parkChange')",
            name="notification_type",
        ),
        CheckConstraint("status IN ('new', 'acked', 'resolved')", name="notification_status"),
        Index("ix_notifications_park_created", "park_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    park_id: Mapped[int] = mapped_column(ForeignKey("parks.id"))
    type: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default="new")
    title: Mapped[str] = mapped_column(Text)
    place: Mapped[str] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    pinned: Mapped[bool] = mapped_column(Boolean, server_default=false())
    payload: Mapped[dict] = mapped_column(DOCUMENT, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ParkChangeRequest(Base):
    """관리자가 담당 공원을 바꿔 달라고 총관리자에게 보내는 요청이에요. 승인되면 공원과 로봇이 같이 옮겨 가요."""

    __tablename__ = "park_change_requests"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'approved', 'rejected', 'canceled')", name="park_change_request_status"),
        Index(
            "uq_park_change_requests_pending_park",
            "park_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
            sqlite_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    park_id: Mapped[int] = mapped_column(ForeignKey("parks.id"), index=True)
    from_catalog_id: Mapped[int] = mapped_column(ForeignKey("park_catalog_entries.id"))
    to_catalog_id: Mapped[int] = mapped_column(ForeignKey("park_catalog_entries.id"))
    memo: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default="pending")
    reason_kind: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    resolved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
