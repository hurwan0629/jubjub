"""기간 보고(A-10)와 지도 현황(A-02 · A-03)을 에이전트 기록 · 알림 · 순찰 설정에서 모아 만들어요.

에이전트가 agent_steps.output에 남기는 값을 읽어요 (없으면 그 항목은 비어 보여요):
  pick(줍기):   success(기본 true) · slot(pet·can·paper·general) · point(순찰 지점 이름) · position{latitude, longitude}
  plan(계획):   missedPoints(돌지 못한 지점 수)
  empty:        분리수거장에 다녀온 횟수로 세요
  agent_runs.trigger == "patrol" 이면 순찰 1회예요.
집기 불가 알림은 payload.position · detection · photoUrl 이 있으면 지도 마커로 보여요.
"""

from collections import Counter
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import AgentRun, AgentStep, Notification, Park, User
from app.schemas.insights import MapOverview, PeriodReport
from app.services.manager import KST, _local
from app.services.patrol import _managed, _park, _points, _position, _route, _station, transaction

MAX_DAYS = 92
SLOTS = ("pet", "can", "paper", "general")


def _parse(value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise AppError(422, "날짜는 YYYY-MM-DD 형식으로 보내 주세요", code="invalid_date") from exc


def _utc_range(db: Session, start: date, end: date) -> tuple[datetime, datetime]:
    """한국 날짜 [start, end] → UTC 시각 [시작, 끝)"""
    a = datetime.combine(start, time.min, tzinfo=KST).astimezone(UTC)
    b = datetime.combine(end + timedelta(days=1), time.min, tzinfo=KST).astimezone(UTC)
    if db.get_bind().dialect.name == "sqlite":  # SQLite는 시간대 없이 저장해요
        return a.replace(tzinfo=None), b.replace(tzinfo=None)
    return a, b


def _steps(db: Session, park: Park, start: date, end: date) -> list[AgentStep]:
    a, b = _utc_range(db, start, end)
    return list(
        db.scalars(
            select(AgentStep)
            .join(AgentRun, AgentStep.run_id == AgentRun.id)
            .where(AgentRun.park_id == park.id, AgentStep.created_at >= a, AgentStep.created_at < b)
        )
    )


def _picked(steps: list[AgentStep]) -> list[AgentStep]:
    return [s for s in steps if s.step_type == "pick" and (s.output or {}).get("success", True)]


@transaction()
def period_report(db: Session, user: User, start_text: str, end_text: str) -> PeriodReport:
    park = _park(db, user)
    start, end = _parse(start_text), _parse(end_text)
    if end < start:
        raise AppError(422, "끝날이 시작일보다 빨라요", code="invalid_period")
    days = (end - start).days + 1
    if days > MAX_DAYS:
        raise AppError(422, "최대 3개월까지 볼 수 있어요", code="period_too_long")

    steps = _steps(db, park, start, end)
    picked = _picked(steps)
    pickups = len(picked)

    prev = _picked(_steps(db, park, start - timedelta(days=days), start - timedelta(days=1)))
    change = round((pickups - len(prev)) / len(prev) * 100) if prev else None

    a, b = _utc_range(db, start, end)
    notes = list(
        db.scalars(
            select(Notification).where(
                Notification.park_id == park.id, Notification.created_at >= a, Notification.created_at < b
            )
        )
    )
    unpickable = [n for n in notes if n.type == "unpickable"]
    attempts = pickups + len(unpickable)
    success = round(pickups / attempts * 100) if attempts else None

    patrols = len(
        list(
            db.scalars(
                select(AgentRun.id).where(
                    AgentRun.park_id == park.id,
                    AgentRun.trigger == "patrol",
                    AgentRun.started_at >= a,
                    AgentRun.started_at < b,
                )
            )
        )
    )

    slots = Counter((s.output or {}).get("slot") for s in picked)
    points = Counter((s.output or {}).get("point") for s in picked if (s.output or {}).get("point"))
    total_points = sum(points.values())

    unresolved = []
    open_unpickable = [n for n in unpickable if n.status != "resolved"]
    if open_unpickable:
        unresolved.append(
            {
                "kind": "unpickable",
                "title": "자동 수거 제외 쓰레기",
                "body": f"집기 불가 대상 {len(open_unpickable)}건은 관리자님의 현장 확인과 직접 처리가 필요해요.",
            }
        )
    errors = [n for n in notes if n.type == "robotError"]
    if errors:
        last = max(errors, key=lambda n: n.created_at)
        unresolved.append(
            {
                "kind": "robotError",
                "title": f"로봇 오류 {len(errors)}번",
                "body": f"마지막 오류는 {_local(last.created_at):%m.%d %H:%M} {last.place}에서 생겼어요.",
            }
        )
    missed = sum(int((s.output or {}).get("missedPoints", 0) or 0) for s in steps)
    if missed:
        unresolved.append(
            {
                "kind": "missedPoint",
                "title": f"돌지 못한 순찰 지점 {missed}곳",
                "body": "로봇 오류나 배터리 부족으로 순찰 지점을 건너뛰었어요.",
            }
        )

    return PeriodReport(
        from_=start_text,
        to=end_text,
        pickups=pickups,
        change_percent=change,
        pick_success_rate=success,
        patrols=patrols,
        station_visits=sum(1 for s in steps if s.step_type == "empty"),
        by_material=[{"slot": slot, "count": slots.get(slot, 0)} for slot in SLOTS],
        by_point=[{"name": name, "percent": round(count / total_points * 100)} for name, count in points.most_common()],
        unresolved=unresolved,
    )


@transaction()
def map_overview(db: Session, user: User) -> MapOverview:
    park = _park(db, user)
    managed = _managed(park)
    markers = []

    station = _station(db, park)
    if station:
        markers.append(
            {"id": f"station-{station.id}", "type": "station", "label": "분리수거장", "position": _position(station)}
        )

    for n in db.scalars(
        select(Notification).where(
            Notification.park_id == park.id, Notification.type == "unpickable", Notification.status != "resolved"
        )
    ):
        p = n.payload or {}
        if not p.get("position"):
            continue
        detection = p.get("detection") or {}
        markers.append(
            {
                "id": f"unpickable-{n.id}",
                "type": "unpickable",
                "label": n.title,
                "position": p["position"],
                "detail": {
                    "place": n.place,
                    "material": detection.get("label", "확인 필요"),
                    "confidence": int(detection.get("confidence", 0)),
                    "last_seen": _local(n.created_at).strftime("%H:%M"),
                    "photo_url": p.get("photoUrl"),
                    "notification_id": str(n.id),
                },
            }
        )

    points = _points(db, _route(db, park))
    route = [_position(point) for point in points]
    if route:
        route.append(route[0])

    # 최근 7일 줍기 위치를 약 10m 칸으로 묶어 많을수록 진하게 칠해요
    today = datetime.now(UTC).astimezone(KST).date()
    cells: Counter = Counter()
    for step in _picked(_steps(db, park, today - timedelta(days=6), today)):
        position = (step.output or {}).get("position")
        if position:
            cells[(round(position["latitude"], 4), round(position["longitude"], 4))] += 1
    top = max(cells.values(), default=0)
    heat = [
        {"position": {"latitude": lat, "longitude": lng}, "weight": round(count / top, 2)}
        for (lat, lng), count in cells.items()
    ]

    return MapOverview(
        park_name=managed.name,
        bounds=managed.bounds,
        area=managed.area,
        markers=markers,
        route=route,
        heat=heat,
        updated_at=datetime.now(UTC),
    )
