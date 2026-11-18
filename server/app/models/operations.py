"""공원 변경 신청 이력과 공원별 일일 보고를 보존해요."""

from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Identity, Index, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.patrol import DOCUMENT, ID


class ParkChangeRequest(Base):
    __tablename__ = "park_change_requests"
    __table_args__ = (
        CheckConstraint("status IN ('pending','approved','rejected','cancelled')", name="park_change_status"),
        CheckConstraint("from_catalog_id <> to_catalog_id", name="park_change_distinct"),
        Index(
            "uq_park_changes_pending",
            "park_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
            sqlite_where=text("status = 'pending'"),
        ),
    )
    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    park_id: Mapped[int] = mapped_column(ForeignKey("parks.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    from_catalog_id: Mapped[int] = mapped_column(ForeignKey("park_catalog_entries.id"))
    to_catalog_id: Mapped[int] = mapped_column(ForeignKey("park_catalog_entries.id"))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default="pending")
    reject_reason: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DailyReport(Base):
    __tablename__ = "daily_reports"
    __table_args__ = (UniqueConstraint("catalog_id", "date"),)
    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    park_id: Mapped[int] = mapped_column(ForeignKey("parks.id"), index=True)
    catalog_id: Mapped[int] = mapped_column(ForeignKey("park_catalog_entries.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    summary: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(DOCUMENT, default=dict, server_default=text("'{}'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
