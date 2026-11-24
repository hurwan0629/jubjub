"""DB에 보관한 공원 목록을 이름·주소로 검색해요."""

from math import asin, cos, radians, sin, sqrt

from sqlalchemy import or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Park, ParkCatalogEntry
from app.schemas.parks import ParkResponse


def distance_meters(latitude: float, longitude: float, park_lat: float, park_lng: float) -> float:
    lat1, lat2 = radians(latitude), radians(park_lat)
    dlat, dlng = lat2 - lat1, radians(park_lng - longitude)
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    return 6371008.8 * 2 * asin(sqrt(min(1, max(0, a))))


def search_parks(
    db: Session,
    query: str,
    limit: int,
    offset: int,
) -> list[ParkResponse]:
    query = query.strip()
    if not query:
        return []
    statement = select(ParkCatalogEntry).where(ParkCatalogEntry.is_active.is_(True))
    for token in query.split():
        statement = statement.where(
            or_(
                ParkCatalogEntry.name.icontains(token, autoescape=True),
                ParkCatalogEntry.address.icontains(token, autoescape=True),
            )
        )
    try:
        entries = db.scalars(
            statement.order_by(ParkCatalogEntry.name, ParkCatalogEntry.id).offset(offset).limit(limit)
        ).all()
    except SQLAlchemyError as exc:
        raise AppError(
            503, "공원 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요", code="park_catalog_unavailable"
        ) from exc
    taken = _managed_ids(db, [entry.id for entry in entries])
    return [
        ParkResponse(
            id=str(entry.id),
            name=entry.name,
            address=entry.address,
            distance="",
            has_manager=entry.id in taken,
            bounds=entry.bounds,
            area=entry.area,
        )
        for entry in entries
    ]


def _managed_ids(db: Session, catalog_ids: list[int]) -> set[int]:
    """이미 승인된 담당 관리자가 있는 공원 카탈로그 ID"""
    if not catalog_ids:
        return set()
    try:
        return set(
            db.scalars(select(Park.catalog_id).where(Park.catalog_id.in_(catalog_ids), Park.status == "approved"))
        )
    except SQLAlchemyError:
        return set()
