"""DB에 보관한 공원 목록을 검색하고 선택적 위치로 거리를 계산해요."""

from math import asin, cos, radians, sin, sqrt

from sqlalchemy import or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import ParkCatalogEntry
from app.schemas.parks import ParkResponse


def distance_meters(latitude: float, longitude: float, park_lat: float, park_lng: float) -> float:
    lat1, lat2 = radians(latitude), radians(park_lat)
    dlat, dlng = lat2 - lat1, radians(park_lng - longitude)
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    return 6371008.8 * 2 * asin(sqrt(min(1, max(0, a))))


def display_distance(meters: float) -> str:
    return f"{round(meters)}m" if meters < 1000 else f"{meters / 1000:.1f}km"


def search_parks(
    db: Session,
    query: str,
    latitude: float | None,
    longitude: float | None,
    limit: int,
    offset: int,
) -> list[ParkResponse]:
    if (latitude is None) != (longitude is None):
        raise AppError(422, "위도와 경도를 함께 보내 주세요", code="validation_error")
    query = query.strip()
    if not query and latitude is None:
        return []
    statement = select(ParkCatalogEntry).where(ParkCatalogEntry.is_active.is_(True))
    for token in query.split():
        statement = statement.where(
            or_(
                ParkCatalogEntry.name.icontains(token, autoescape=True),
                ParkCatalogEntry.address.icontains(token, autoescape=True),
            )
        )
    distances: dict[int, float] = {}
    try:
        if latitude is not None and longitude is not None:
            # 서울 목록의 대표 좌표만 읽어요. 큰 경계 JSON은 페이지에 필요한 것만 가져와요.
            positions = db.execute(
                statement.with_only_columns(
                    ParkCatalogEntry.id,
                    ParkCatalogEntry.center_lat,
                    ParkCatalogEntry.center_lng,
                )
            ).all()
            distances = {
                row.id: distance_meters(latitude, longitude, row.center_lat, row.center_lng) for row in positions
            }
            ids = sorted(distances, key=lambda key: (distances[key], key))[offset : offset + limit]
            if not ids:
                return []
            entries = db.scalars(select(ParkCatalogEntry).where(ParkCatalogEntry.id.in_(ids))).all()
            entries = sorted(entries, key=lambda entry: (distances[entry.id], entry.id))
        else:
            entries = db.scalars(
                statement.order_by(ParkCatalogEntry.name, ParkCatalogEntry.id).offset(offset).limit(limit)
            ).all()
    except SQLAlchemyError as exc:
        raise AppError(
            503, "공원 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요", code="park_catalog_unavailable"
        ) from exc
    return [
        ParkResponse(
            id=str(entry.id),
            name=entry.name,
            address=entry.address,
            distance=display_distance(distances[entry.id]) if entry.id in distances else "",
            bounds=entry.bounds,
            area=entry.area,
        )
        for entry in entries
    ]
