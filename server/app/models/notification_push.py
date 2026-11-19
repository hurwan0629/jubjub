"""알림 저장과 함께 발송 대기열을 보존해요."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Identity, Index, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.patrol import ID


class NotificationPushDelivery(Base):
    __tablename__ = "notification_push_deliveries"
    __table_args__ = (
        UniqueConstraint("notification_id", "push_token_id"),
        CheckConstraint(
            "status IN ('pending','submitted','delivered','failed','cancelled')", name="push_delivery_status"
        ),
        CheckConstraint("attempts >= 0 AND receipt_checks >= 0", name="push_delivery_attempts"),
        CheckConstraint(
            "status NOT IN ('submitted','delivered') OR "
            "(ticket_id IS NOT NULL AND length(trim(ticket_id)) > 0 AND submitted_at IS NOT NULL)",
            name="push_delivery_ticket",
        ),
        Index("ix_notification_push_deliveries_due", "status", "next_attempt_at"),
    )
    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    notification_id: Mapped[int] = mapped_column(ForeignKey("notifications.id"), index=True)
    push_token_id: Mapped[int] = mapped_column(ForeignKey("push_tokens.id"), index=True)
    status: Mapped[str] = mapped_column(Text, server_default="pending")
    attempts: Mapped[int] = mapped_column(Integer, server_default="0")
    receipt_checks: Mapped[int] = mapped_column(Integer, server_default="0")
    ticket_id: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
