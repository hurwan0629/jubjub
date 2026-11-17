"""관리자별 순찰 설정을 검증하고 버전과 함께 저장해요."""

from collections.abc import Callable
from datetime import UTC, datetime, time
from functools import wraps

from shapely.geometry import Point, Polygon
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Robot, User
from app.models.park_catalog import ParkCatalogEntry
from app.models.patrol import AgentRun, AgentStep, Park, PatrolPoint, Route, RoutePoint, Schedule
from app.schemas.parks import LatLng
from app.schemas.patrol import (
    ConfigInput,
    ConfigResponse,
    ManagedPark,
    ParkSelection,
    PointResponse,
    RouteInput,
    RouteResponse,
    ScheduleInput,
    ScheduleResponse,
    SetupResponse,
)
from app.services.auth import require_manager
from app.services.parks import distance_meters


def transaction(*, write=False):
    """요청 단위로 커밋하고 실패 시 모든 변경을 되돌려요."""

    def decorate(function: Callable):
        @wraps(function)
        def wrapped(db: Session, user: User, *args, **kwargs):
            try:
                if write:
                    # 같은 관리자의 공원 생성·경로 변경을 직렬화해요.
                    db.scalar(
                        select(User)
                        .where(User.id == user.id)
                        .with_for_update()
                        .execution_options(populate_existing=True)
                    )
                result = function(db, user, *args, **kwargs)
                if write:
                    db.commit()
                return result
            except AppError:
                if write:
                    db.rollback()
                raise
            except IntegrityError as exc:
                db.rollback()
                raise AppError(
                    409, "설정이 변경됐어요. 다시 불러온 뒤 저장해 주세요", code="settings_conflict"
                ) from exc
            except SQLAlchemyError as exc:
                db.rollback()
                raise AppError(
                    503, "순찰 설정을 처리하지 못했어요. 잠시 후 다시 시도해 주세요", code="patrol_unavailable"
                ) from exc

        return wrapped

    return decorate


def _park(db: Session, user: User) -> Park:
    require_manager(user)
    park = db.scalar(select(Park).where(Park.user_id == user.id).execution_options(populate_existing=True))
    if park is None:
        raise AppError(409, "먼저 관리할 공원을 선택해 주세요", code="park_required")
    if park.status != "approved":
        raise AppError(403, "총관리자의 공원 승인을 기다려 주세요", code="park_not_approved")
    return park


def _position(point: PatrolPoint | None) -> LatLng | None:
    return LatLng(latitude=point.lat, longitude=point.lng) if point else None


def _ensure_catalog(db: Session, park: Park, expected: str | int | None):
    from app.models.operations import ParkChangeRequest

    changed = expected is None and db.scalar(
        select(ParkChangeRequest.id)
        .where(ParkChangeRequest.park_id == park.id, ParkChangeRequest.status == "approved")
        .limit(1)
    )
    if changed or (expected is not None and str(expected) != str(park.catalog_id)):
        raise AppError(409, "담당 공원이 변경됐어요. 새 공원 설정을 다시 불러와 주세요", code="park_changed")


def _station(db: Session, park: Park) -> PatrolPoint | None:
    return db.scalar(
        select(PatrolPoint).where(
            PatrolPoint.park_id == park.id, PatrolPoint.type == "station", PatrolPoint.deleted_at.is_(None)
        )
    )


def _robot_id(db: Session, park: Park, robot_id: int | None) -> int | None:
    if robot_id is not None:
        robot = db.get(Robot, robot_id, populate_existing=True)
        if robot is None or robot.park_id != park.id:
            raise AppError(404, "이 공원에 배정된 로봇을 찾을 수 없어요", code="robot_not_found")
        return robot.id
    ids = list(db.scalars(select(Robot.id).where(Robot.park_id == park.id).order_by(Robot.id)))
    if len(ids) > 1:
        raise AppError(422, "경로를 설정할 로봇을 선택해 주세요", code="robot_required")
    return ids[0] if ids else None


def _route(db: Session, park: Park, robot_id: int | None = None) -> Route | None:
    return db.scalar(
        select(Route).where(Route.park_id == park.id, Route.robot_id == robot_id, Route.is_active.is_(True))
    )


def _points(db: Session, route: Route | None) -> list[PatrolPoint]:
    if route is None:
        return []
    return list(
        db.scalars(
            select(PatrolPoint)
            .join(RoutePoint, RoutePoint.point_id == PatrolPoint.id)
            .where(RoutePoint.route_id == route.id)
            .order_by(RoutePoint.seq)
        )
    )


def _inside(park: Park, position: LatLng):
    area = park.catalog.area
    polygon = Polygon(
        [(p["longitude"], p["latitude"]) for p in area["outer"]],
        [[(p["longitude"], p["latitude"]) for p in ring] for ring in area.get("holes", [])],
    )
    if not polygon.covers(Point(position.longitude, position.latitude)):
        raise AppError(422, "공원 경계 안의 위치를 선택해 주세요", code="point_outside_park")


def _validate_points(park: Park, station: LatLng, body: RouteInput):
    _inside(park, station)
    existing = [station]
    for point in body.points:
        _inside(park, point.position)
    # 입력 배열은 순찰 순서예요. 핀을 추가한 순서와 다르므로 연결성을 검사해요.
    remaining = [point.position for point in body.points]
    while remaining:
        distances = [
            min(distance_meters(p.latitude, p.longitude, item.latitude, item.longitude) for p in existing)
            for item in remaining
        ]
        closest = min(range(len(remaining)), key=distances.__getitem__)
        nearest = distances[closest]
        if nearest > 1000:
            raise AppError(
                422,
                f"기존 지점과 약 {nearest / 1000:.1f}km 떨어져 있어요. 1km 이내로 지정해 주세요",
                code="point_too_far",
                details={"distanceMeters": round(nearest), "maxDistanceMeters": 1000},
            )
        existing.append(remaining.pop(closest))


def _managed(park: Park) -> ManagedPark:
    return ManagedPark(
        id=str(park.id),
        catalog_id=str(park.catalog_id),
        name=park.catalog.name,
        address=park.catalog.address,
        center=LatLng(latitude=park.catalog.center_lat, longitude=park.catalog.center_lng),
        bounds=park.catalog.bounds,
        area=park.catalog.area,
        status=park.status,
        approved_by=str(park.approved_by) if park.approved_by is not None else None,
        approved_at=park.approved_at,
        reject_reason=park.reject_reason,
        route_setup_done=park.route_setup_done,
        anchor_points=park.anchor_points,
    )


def _hide_points(db: Session, park: Park, kind: str | None = None):
    statement = select(PatrolPoint).where(PatrolPoint.park_id == park.id, PatrolPoint.deleted_at.is_(None))
    if kind:
        statement = statement.where(PatrolPoint.type == kind)
    for point in db.scalars(statement):
        point.deleted_at = datetime.now(UTC)
    db.flush()


def _deactivate(db: Session, park: Park):
    for route in db.scalars(select(Route).where(Route.park_id == park.id, Route.is_active.is_(True))):
        route.is_active = False
    db.flush()


def _save_station(db: Session, park: Park, position: LatLng) -> PatrolPoint:
    _inside(park, position)
    current = _station(db, park)
    if current and current.lat == position.latitude and current.lng == position.longitude:
        return current
    _hide_points(db, park, "station")
    point = PatrolPoint(
        park_id=park.id, name="분리수거장", type="station", lat=position.latitude, lng=position.longitude
    )
    db.add(point)
    db.flush()
    return point


def _save_route(db: Session, user: User, park: Park, body: RouteInput, robot_id: int | None = None) -> Route:
    station = _station(db, park)
    if station is None:
        raise AppError(409, "먼저 분리수거장 위치를 등록해 주세요", code="station_required")
    _validate_points(park, _position(station), body)
    previous = _route(db, park, robot_id)
    if previous:
        previous.is_active = False
        for point in _points(db, previous):
            point.deleted_at = datetime.now(UTC)
        db.flush()
    route = Route(park_id=park.id, robot_id=robot_id, station_id=station.id, is_active=True, created_by=user.id)
    db.add(route)
    db.flush()
    for seq, item in enumerate(body.points):
        point = PatrolPoint(
            park_id=park.id, name=item.name, type="patrol", lat=item.position.latitude, lng=item.position.longitude
        )
        db.add(point)
        db.flush()
        db.add(RoutePoint(route_id=route.id, seq=seq, point_id=point.id))
    run = AgentRun(
        park_id=park.id,
        robot_id=robot_id,
        trigger="adminRequest",
        status="done",
        plan="관리자 경로 수정",
        result="다음 순찰부터 적용해요",
        ended_at=datetime.now(UTC),
    )
    db.add(run)
    db.flush()
    db.add(
        AgentStep(
            run_id=run.id,
            step_type="route",
            title="관리자 경로 수정",
            details=["다음 순찰부터 새 경로를 사용해요"],
            input={"userId": str(user.id)},
            output={"routeId": str(route.id)},
            decision="경로 변경",
            reason="관리자가 저장했어요",
            tool="save_routes",
        )
    )
    db.flush()
    return route


def _schedule_response(db: Session, park: Park, robot_id: int | None = None) -> list[ScheduleResponse]:
    return [
        ScheduleResponse(id=str(s.id), time=s.run_at.strftime("%H:%M"), label=s.label, on=s.enabled, repeat=s.repeat)
        for s in db.scalars(
            select(Schedule)
            .where(Schedule.park_id == park.id, Schedule.robot_id == robot_id)
            .order_by(Schedule.run_at, Schedule.id)
        )
    ]


def _save_schedules(db: Session, park: Park, body: list[ScheduleInput], robot_id: int | None = None):
    # daily와 weekdays/weekends의 같은 시각도 중복 실행되므로 함께 거부해요.
    seen: dict[str, set[str]] = {}
    for slot in body:
        repeats = seen.setdefault(slot.time, set())
        if slot.repeat in repeats or (repeats and (slot.repeat == "daily" or "daily" in repeats)):
            raise AppError(422, "겹치는 순찰 시각은 한 번만 지정해 주세요", code="duplicate_schedule")
        repeats.add(slot.repeat)
    db.execute(delete(Schedule).where(Schedule.park_id == park.id, Schedule.robot_id == robot_id))
    db.flush()
    for slot in body:
        db.add(
            Schedule(
                park_id=park.id,
                robot_id=robot_id,
                run_at=time.fromisoformat(slot.time),
                enabled=slot.on,
                label=slot.label,
                repeat=slot.repeat,
            )
        )
    db.flush()


def _route_response(db: Session, park: Park, robot_id: int | None = None) -> RouteResponse:
    route = _route(db, park, robot_id)
    station = db.get(PatrolPoint, route.station_id) if route else _station(db, park)
    return RouteResponse(
        catalog_id=str(park.catalog_id),
        robot_id=str(robot_id) if robot_id is not None else None,
        id=str(route.id) if route else None,
        start=_position(station),
        end=_position(station),
        points=[PointResponse(id=str(p.id), name=p.name, position=_position(p)) for p in _points(db, route)],
    )


def _config(db: Session, park: Park, robot_id: int | None = None) -> ConfigResponse:
    route = _route_response(db, park, robot_id)
    return ConfigResponse(
        catalog_id=str(park.catalog_id),
        robot_id=str(robot_id) if robot_id is not None else None,
        park_name=park.catalog.name,
        bounds=park.catalog.bounds,
        area=park.catalog.area,
        station=_position(_station(db, park)),
        points=route.points,
        schedule=_schedule_response(db, park, robot_id),
    )


@transaction()
def get_park(db: Session, user: User):
    require_manager(user)
    park = db.scalar(select(Park).where(Park.user_id == user.id))
    if park is None:
        raise AppError(404, "아직 관리 공원을 선택하지 않았어요", code="park_not_found")
    return _managed(park)


@transaction(write=True)
def select_park(db: Session, user: User, body: ParkSelection):
    require_manager(user)
    catalog_id = int(body.catalog_id)
    if catalog_id > 9223372036854775807:
        raise AppError(404, "선택한 공원을 찾을 수 없어요", code="park_not_found")
    catalog = db.get(ParkCatalogEntry, catalog_id)
    if catalog is None or not catalog.is_active:
        raise AppError(404, "선택한 공원을 찾을 수 없어요", code="park_not_found")
    park = db.scalar(
        select(Park).where(Park.user_id == user.id).with_for_update(of=Park).execution_options(populate_existing=True)
    )
    if park and park.catalog_id == catalog.id and park.status != "rejected":
        return _managed(park)
    if park and park.status == "approved":
        raise AppError(
            409,
            "승인된 공원은 임의로 변경할 수 없어요. 총관리자에게 문의해 주세요",
            code="approved_park_change_forbidden",
        )
    same_catalog = park is not None and park.catalog_id == catalog.id
    if park and not same_catalog:
        _deactivate(db, park)
        _hide_points(db, park)
        db.execute(delete(Schedule).where(Schedule.park_id == park.id))
    elif park is None:
        park = Park(user_id=user.id)
        db.add(park)
    park.catalog = catalog
    park.status = "pending"
    park.approved_by = None
    park.approved_at = None
    park.reject_reason = None
    if not same_catalog:
        park.route_setup_done = False
        park.anchor_points = []
    db.flush()
    return _managed(park)


@transaction()
def get_station(db: Session, user: User):
    return _position(_station(db, _park(db, user)))


def _route_input(db: Session, route: Route) -> RouteInput:
    return RouteInput(
        points=[PointResponse(id=str(p.id), name=p.name, position=_position(p)) for p in _points(db, route)]
    )


def _move_station(
    db: Session, user: User, park: Park, position: LatLng, replacement: tuple[int | None, RouteInput] | None = None
):
    current = _station(db, park)
    if current and _position(current) == position:
        _inside(park, position)
        return
    assigned = select(Robot.id).where(Robot.park_id == park.id)
    routes = list(
        db.scalars(
            select(Route).where(
                Route.park_id == park.id,
                Route.is_active.is_(True),
                Route.robot_id.in_(assigned) | Route.robot_id.is_(None),
            )
        )
    )
    updates = [(r.robot_id, _route_input(db, r)) for r in routes]
    # 대상 로봇은 새 지점으로, 다른 로봇은 기존 지점으로 검증해요.
    if replacement is not None:
        updates = [(rid, body) for rid, body in updates if rid != replacement[0]]
        updates.append(replacement)
    _inside(park, position)
    for _, body in updates:
        _validate_points(park, position, body)
    _save_station(db, park, position)
    for rid, body in updates:
        if replacement is None or rid != replacement[0]:
            _save_route(db, user, park, body, rid)


def _has_complete_config(db: Session, park: Park) -> bool:
    # 배정된 로봇 하나 이상의 설정이 완성되면 초기 진입을 완료해요.
    ids = list(db.scalars(select(Robot.id).where(Robot.park_id == park.id))) or [None]
    return _station(db, park) is not None and any(
        _route(db, park, rid) is not None and bool(_schedule_response(db, park, rid)) for rid in ids
    )


@transaction(write=True)
def save_station(db: Session, user: User, body: LatLng, catalog_id: int | None = None):
    park = _park(db, user)
    _ensure_catalog(db, park, catalog_id)
    _move_station(db, user, park, body)
    return _position(_station(db, park))


@transaction()
def get_routes(db: Session, user: User, robot_id: int | None = None):
    park = _park(db, user)
    return _route_response(db, park, _robot_id(db, park, robot_id))


@transaction(write=True)
def save_routes(db: Session, user: User, body: RouteInput, robot_id: int | None = None):
    park = _park(db, user)
    _ensure_catalog(db, park, body.catalog_id)
    rid = _robot_id(db, park, robot_id)
    _save_route(db, user, park, body, rid)
    return _route_response(db, park, rid)


@transaction()
def get_schedules(db: Session, user: User, robot_id: int | None = None):
    park = _park(db, user)
    return _schedule_response(db, park, _robot_id(db, park, robot_id))


@transaction(write=True)
def save_schedules(
    db: Session, user: User, body: list[ScheduleInput], robot_id: int | None = None, catalog_id: int | None = None
):
    park = _park(db, user)
    _ensure_catalog(db, park, catalog_id)
    rid = _robot_id(db, park, robot_id)
    _save_schedules(db, park, body, rid)
    if park.route_setup_done:
        park.route_setup_done = _has_complete_config(db, park)
    return _schedule_response(db, park, rid)


@transaction()
def get_config(db: Session, user: User, robot_id: int | None = None):
    park = _park(db, user)
    return _config(db, park, _robot_id(db, park, robot_id))


@transaction(write=True)
def save_config(db: Session, user: User, body: ConfigInput, robot_id: int | None = None):
    park = _park(db, user)
    _ensure_catalog(db, park, body.catalog_id)
    rid = _robot_id(db, park, robot_id)
    _move_station(db, user, park, body.station, (rid, body))
    _save_route(db, user, park, body, rid)
    _save_schedules(db, park, body.schedule, rid)
    park.route_setup_done = True
    return _config(db, park, rid)


@transaction(write=True)
def complete_setup(db: Session, user: User, robot_id: int | None = None, catalog_id: int | None = None):
    park = _park(db, user)
    _ensure_catalog(db, park, catalog_id)
    rid = _robot_id(db, park, robot_id)
    if _station(db, park) is None or _route(db, park, rid) is None or not _schedule_response(db, park, rid):
        raise AppError(409, "분리수거장·순찰 지점·시간표를 먼저 저장해 주세요", code="setup_incomplete")
    park.route_setup_done = True
    return SetupResponse(route_setup_done=True)


def inherit_draft(db: Session, user: User, park: Park, robots: list[Robot]):
    """로봇 미배정 초안을 첫 배정 시 독립된 설정으로 복사해요."""
    draft = _route(db, park)
    schedules = _schedule_response(db, park)
    for robot in robots:
        if draft and _route(db, park, robot.id) is None:
            _save_route(db, user, park, _route_input(db, draft), robot.id)
        if schedules and not _schedule_response(db, park, robot.id):
            _save_schedules(db, park, schedules, robot.id)
    if draft and robots:
        draft.is_active = False
        for point in _points(db, draft):
            point.deleted_at = datetime.now(UTC)
        db.execute(delete(Schedule).where(Schedule.park_id == park.id, Schedule.robot_id.is_(None)))
        db.flush()
    if park.route_setup_done:
        park.route_setup_done = _has_complete_config(db, park)
