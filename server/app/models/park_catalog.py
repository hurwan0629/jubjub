"""검색 가능한 공원 경계 목록을 저장해요. 운영 공원 설정과는 분리해요."""

from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Float, Identity, Integer, Text, func, true
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ParkCatalogEntry(Base):
    __tablename__ = "park_catalog_entries"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), Identity(always=True), primary_key=True
    )
    source_key: Mapped[str] = mapped_column(Text, unique=True)
    dataset: Mapped[str] = mapped_column(Text, index=True)
    name: Mapped[str] = mapped_column(Text)
    address: Mapped[str] = mapped_column(Text)
    center_lat: Mapped[float] = mapped_column(Float)
    center_lng: Mapped[float] = mapped_column(Float)
    bounds: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"))
    area: Mapped[dict] = mapped_column(JSON().with_variant(JSONB, "postgresql"))
    source_url: Mapped[str] = mapped_column(Text)
    source_license: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=true())
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
