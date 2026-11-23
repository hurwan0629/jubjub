"""분리수거장 목록과 활성 경로의 참조를 관리해요."""

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import RecyclingStation, Route, User
from app.schemas.patrol import StationInput
from app.services.patrol import (
    _ensure_catalog,
    _inside,
    _park,
    _position,
    _route_input,
    _save_route,
    _station_by_id,
    _station_list,
    _station_response,
    _validate_points,
    transaction,
)


@transaction()
def list_stations(db: Session, user: User):
    return _station_list(db, _park(db, user))


def _unique_position(db: Session, park_id: int, body: StationInput, exclude_id: int | None = None):
    query = select(RecyclingStation.id).where(
        RecyclingStation.park_id == park_id,
        RecyclingStation.deleted_at.is_(None),
        RecyclingStation.lat == body.position.latitude,
        RecyclingStation.lng == body.position.longitude,
    )
    if exclude_id is not None:
        query = query.where(RecyclingStation.id != exclude_id)
    if db.scalar(query):
        raise AppError(409, "같은 위치의 분리수거장이 이미 있어요", code="station_position_exists")


@transaction(write=True)
def create_station(db: Session, user: User, body: StationInput):
    park = _park(db, user)
    _ensure_catalog(db, park, body.catalog_id)
    _inside(park, body.position)
    _unique_position(db, park.id, body)
    if (
        db.scalar(
            select(func.count())
            .select_from(RecyclingStation)
            .where(RecyclingStation.park_id == park.id, RecyclingStation.deleted_at.is_(None))
        )
        >= 100
    ):
        raise AppError(422, "분리수거장은 공원당 100곳까지 등록할 수 있어요", code="station_limit_exceeded")
    item = RecyclingStation(park_id=park.id, name=body.name, lat=body.position.latitude, lng=body.position.longitude)
    db.add(item)
    db.flush()
    return _station_response(item)


@transaction(write=True)
def update_station(db: Session, user: User, station_id: int, body: StationInput):
    park = _park(db, user)
    _ensure_catalog(db, park, body.catalog_id)
    item = _station_by_id(db, park, station_id)
    _inside(park, body.position)
    _unique_position(db, park.id, body, item.id)
    moved = _position(item) != body.position
    routes = (
        list(
            db.scalars(
                select(Route).where(
                    Route.park_id == park.id, Route.default_station_id == item.id, Route.is_active.is_(True)
                )
            )
        )
        if moved
        else []
    )
    changes = [(route.robot_id, _route_input(db, route)) for route in routes]
    for _, route_body in changes:
        _validate_points(park, body.position, route_body)
    item.name, item.lat, item.lng = body.name, body.position.latitude, body.position.longitude
    db.flush()
    for robot_id, route_body in changes:
        _save_route(db, user, park, route_body, robot_id, item)
    return _station_response(item)


@transaction(write=True)
def delete_station(db: Session, user: User, station_id: int, catalog_id: int | None):
    park = _park(db, user)
    _ensure_catalog(db, park, catalog_id)
    item = _station_by_id(db, park, station_id)
    if db.scalar(
        select(Route.id).where(Route.park_id == park.id, Route.default_station_id == item.id, Route.is_active.is_(True))
    ):
        raise AppError(409, "기본 분리수거장으로 사용 중이에요. 다른 장소를 먼저 선택해 주세요", code="station_in_use")
    item.deleted_at = datetime.now(UTC)
    db.flush()
