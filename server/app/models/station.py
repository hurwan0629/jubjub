"""공원의 분리수거장 목록과 로봇별 기본 선택을 저장해요."""

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


class StationSelection(Base):
    __tablename__ = "station_selections"
    __table_args__ = (
        Index(
            "uq_station_selections_robot",
            "park_id",
            "robot_id",
            unique=True,
            postgresql_where=text("robot_id IS NOT NULL"),
            sqlite_where=text("robot_id IS NOT NULL"),
        ),
        Index(
            "uq_station_selections_draft",
            "park_id",
            unique=True,
            postgresql_where=text("robot_id IS NULL"),
            sqlite_where=text("robot_id IS NULL"),
        ),
    )
    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    park_id: Mapped[int] = mapped_column(ForeignKey("parks.id"))
    robot_id: Mapped[int | None] = mapped_column(ForeignKey("robots.id"))
    station_id: Mapped[int] = mapped_column(ForeignKey("recycling_stations.id"), index=True)
