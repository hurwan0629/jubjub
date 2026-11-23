"""공원의 분리수거장 목록을 저장해요. 선택은 경로에서 관리해요."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Identity, Index, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.patrol import ID


class RecyclingStation(Base):
    __tablename__ = "recycling_stations"
    __table_args__ = (
        CheckConstraint("lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180", name="station_coordinates"),
        CheckConstraint("length(trim(name)) BETWEEN 1 AND 100", name="station_name"),
        Index(
            "uq_recycling_stations_live_position",
            "park_id",
            "lat",
            "lng",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
            sqlite_where=text("deleted_at IS NULL"),
        ),
    )
    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    park_id: Mapped[int] = mapped_column(ForeignKey("parks.id"), index=True)
    name: Mapped[str] = mapped_column(Text)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
