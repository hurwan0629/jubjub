"""관리 공원·순찰 설정과 변경 이력을 저장해요."""

from datetime import datetime, time

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Identity,
    Index,
    Integer,
    SmallInteger,
    Text,
    Time,
    UniqueConstraint,
    false,
    func,
    text,
    true,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.park_catalog import ParkCatalogEntry

ID = BigInteger().with_variant(Integer, "sqlite")
DOCUMENT = JSON().with_variant(JSONB, "postgresql")


class Park(Base):
    __tablename__ = "parks"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'approved', 'rejected')", name="park_status"),
        CheckConstraint(
            "(status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND reject_reason IS NULL) OR "
            "(status = 'pending' AND approved_by IS NULL AND approved_at IS NULL AND reject_reason IS NULL) OR "
            "(status = 'rejected' AND approved_by IS NULL AND approved_at IS NULL AND length(trim(reject_reason)) > 0 AND reject_reason IS NOT NULL)",
            name="park_review_metadata",
        ),
        Index(
            "uq_parks_approved_catalog",
            "catalog_id",
            unique=True,
            postgresql_where=text("status = 'approved'"),
            sqlite_where=text("status = 'approved'"),
        ),
    )

    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    catalog_id: Mapped[int] = mapped_column(ForeignKey("park_catalog_entries.id"))
    status: Mapped[str] = mapped_column(Text, server_default="pending")
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reject_reason: Mapped[str | None] = mapped_column(Text)
    route_setup_done: Mapped[bool] = mapped_column(Boolean, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    catalog: Mapped[ParkCatalogEntry] = relationship(lazy="joined")


class PatrolPoint(Base):
    __tablename__ = "points"
    __table_args__ = (
        CheckConstraint("type IN ('patrol', 'station', 'charger', 'bin')", name="point_type"),
        CheckConstraint("lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180", name="point_coordinates"),
        Index(
            "uq_points_live_station",
            "park_id",
            unique=True,
            postgresql_where=text("type = 'station' AND deleted_at IS NULL"),
            sqlite_where=text("type = 'station' AND deleted_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    park_id: Mapped[int] = mapped_column(ForeignKey("parks.id"), index=True)
    name: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(Text)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    slam_x: Mapped[float | None] = mapped_column(Float)
    slam_y: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Route(Base):
    __tablename__ = "routes"
    __table_args__ = (
        Index(
            "uq_routes_active_park",
            "park_id",
            unique=True,
            postgresql_where=text("is_active"),
            sqlite_where=text("is_active = 1"),
        ),
    )

    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    park_id: Mapped[int] = mapped_column(ForeignKey("parks.id"))
    station_id: Mapped[int] = mapped_column(ForeignKey("points.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=false())
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RoutePoint(Base):
    __tablename__ = "route_points"
    __table_args__ = (UniqueConstraint("route_id", "point_id"), CheckConstraint("seq >= 0", name="route_sequence"))

    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"), primary_key=True)
    seq: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    point_id: Mapped[int] = mapped_column(ForeignKey("points.id"))


class Schedule(Base):
    __tablename__ = "schedules"
    __table_args__ = (
        UniqueConstraint("park_id", "run_at", "repeat"),
        CheckConstraint("repeat IN ('daily', 'weekdays', 'weekends')", name="schedule_repeat"),
    )

    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    park_id: Mapped[int] = mapped_column(ForeignKey("parks.id"), index=True)
    run_at: Mapped[time] = mapped_column(Time)
    enabled: Mapped[bool] = mapped_column(Boolean, server_default=true())
    label: Mapped[str] = mapped_column(Text)
    repeat: Mapped[str] = mapped_column(Text)


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    park_id: Mapped[int] = mapped_column(ForeignKey("parks.id"), index=True)
    robot_id: Mapped[int | None] = mapped_column(ForeignKey("robots.id"), index=True)
    trigger: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)
    plan: Mapped[str] = mapped_column(Text)
    result: Mapped[str] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AgentStep(Base):
    __tablename__ = "agent_steps"

    id: Mapped[int] = mapped_column(ID, Identity(always=True), primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("agent_runs.id"))
    step_type: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    details: Mapped[list] = mapped_column(ARRAY(Text).with_variant(JSON, "sqlite"))
    input: Mapped[dict] = mapped_column(DOCUMENT)
    output: Mapped[dict] = mapped_column(DOCUMENT)
    decision: Mapped[str] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(Text)
    tool: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
