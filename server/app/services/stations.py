"""분리수거장 여러 곳을 관리하고 로봇마다 비우러 갈 곳을 정해요 (C-02 분리수거장 관리).

기본 분리수거장(경로가 기준으로 삼는 곳)은 순찰 설정(PUT /station · /route)이 그대로 다뤄요.
station_id가 비어 있는 로봇은 기본 분리수거장을 써요.
"""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import PatrolPoint, Robot, User
from app.schemas.stations import RobotStationInput, Station, StationInput, StationPatch
from app.services.patrol import _inside, _park, _position, _route, _station, transaction


def _live(db: Session, park_id: int) -> list[PatrolPoint]:
    return list(
        db.scalars(
            select(PatrolPoint)
            .where(PatrolPoint.park_id == park_id, PatrolPoint.type == "station", PatrolPoint.deleted_at.is_(None))
            .order_by(PatrolPoint.id)
        )
    )


def _users(robots: list[Robot], station: PatrolPoint, primary_id: int | None) -> list[Robot]:
    return [r for r in robots if r.station_id == station.id or (r.station_id is None and station.id == primary_id)]


def _list(db: Session, park) -> list[Station]:
    primary = _station(db, park)
    primary_id = primary.id if primary else None
    robots = list(db.scalars(select(Robot).where(Robot.park_id == park.id).order_by(Robot.id)))
    return [
        Station(
            id=str(s.id),
            name=s.name,
            position=_position(s),
            primary=s.id == primary_id,
            robots=[{"id": str(r.id), "name": r.name} for r in _users(robots, s, primary_id)],
        )
        for s in _live(db, park.id)
    ]


def _one(db: Session, park, station_id: int) -> PatrolPoint:
    point = db.scalar(
        select(PatrolPoint)
        .where(
            PatrolPoint.id == station_id,
            PatrolPoint.park_id == park.id,
            PatrolPoint.type == "station",
            PatrolPoint.deleted_at.is_(None),
        )
        .with_for_update()
    )
    if point is None:
        raise AppError(404, "분리수거장을 찾을 수 없어요", code="station_not_found")
    return point


def _by_id(stations: list[Station], station_id: int) -> Station:
    return next(s for s in stations if s.id == str(station_id))


@transaction()
def list_stations(db: Session, user: User) -> list[Station]:
    return _list(db, _park(db, user))


@transaction(write=True)
def add_station(db: Session, user: User, body: StationInput) -> Station:
    park = _park(db, user)
    _inside(park, body.position)
    point = PatrolPoint(
        park_id=park.id, name=body.name, type="station", lat=body.position.latitude, lng=body.position.longitude
    )
    db.add(point)
    db.flush()
    return _by_id(_list(db, park), point.id)


@transaction(write=True)
def edit_station(db: Session, user: User, station_id: int, body: StationPatch) -> Station:
    park = _park(db, user)
    point = _one(db, park, station_id)
    if body.name is not None:
        point.name = body.name
    if body.position is not None:
        _inside(park, body.position)
        point.lat = body.position.latitude
        point.lng = body.position.longitude
    db.flush()
    return _by_id(_list(db, park), point.id)


@transaction(write=True)
def delete_station(db: Session, user: User, station_id: int) -> list[Station]:
    """쓰는 로봇이 있으면 지울 수 없어요. 기본 분리수거장을 지우면 남은 곳 중 하나가 기본이 돼요."""
    park = _park(db, user)
    point = _one(db, park, station_id)
    live = _live(db, park.id)
    if len(live) <= 1:
        raise AppError(409, "분리수거장은 한 곳 이상 있어야 해요", code="last_station")
    primary = _station(db, park)
    robots = list(db.scalars(select(Robot).where(Robot.park_id == park.id).order_by(Robot.id)))
    users = _users(robots, point, primary.id if primary else None)
    if users:
        names = ", ".join(r.name for r in users)
        raise AppError(
            409,
            f"{names}이(가) 쓰는 분리수거장이라 지울 수 없어요",
            code="station_in_use",
            details=[{"id": str(r.id), "name": r.name} for r in users],
        )
    point.deleted_at = datetime.now(UTC)
    route = _route(db, park)
    if route and route.station_id == point.id:
        route.station_id = next(s.id for s in live if s.id != point.id)
    db.flush()
    return _list(db, park)


@transaction(write=True)
def set_robot_station(db: Session, user: User, robot_id: int, body: RobotStationInput) -> list[Station]:
    park = _park(db, user)
    robot = db.scalar(select(Robot).where(Robot.id == robot_id, Robot.park_id == park.id).with_for_update())
    if robot is None:
        raise AppError(404, "우리 공원에 배정된 로봇이 아니에요", code="robot_not_found")
    point = _one(db, park, int(body.station_id))
    robot.station_id = point.id
    db.flush()
    return _list(db, park)
