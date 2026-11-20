"""관리자 앱의 알림 · 공원 변경 요청 · 운영 설정 · 알림 설정을 처리해요.

알림은 서버가 만들어요. 지금은 공원 변경 승인·반려 때 만들고, 로봇 오류·집기 불가·배터리 부족 알림은
로봇 브리지·에이전트가 생기면 create_notification으로 넣어요.
"""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Notification, Park, ParkCatalogEntry, ParkChangeRequest, Robot, Schedule, User
from app.schemas.manager import (
    AdminParkChangeResponse,
    NotificationDetail,
    NotificationItem,
    NotificationSettings,
    NotificationSettingsPatch,
    OperationSettings,
    ParkChangeInput,
    ParkChangeRejection,
    ParkChangeResponse,
)
from app.services.auth import require_super_admin
from app.services.patrol import _deactivate, _hide_points, _park, transaction

KST = ZoneInfo("Asia/Seoul")


# ───────── 시각 표시 ─────────


def _local(at: datetime) -> datetime:
    if at.tzinfo is None:  # SQLite는 시간대를 저장하지 않아요
        at = at.replace(tzinfo=UTC)
    return at.astimezone(KST)


def short_time(at: datetime, now: datetime | None = None) -> str:
    """목록용: 1분 안 '방금' · 오늘 '11:02' · 어제 '어제 22:00' · 그 전 '11월 17일'"""
    now = _local(now or datetime.now(UTC))
    local = _local(at)
    if now - local < timedelta(minutes=1):
        return "방금"
    if local.date() == now.date():
        return local.strftime("%H:%M")
    if local.date() == (now - timedelta(days=1)).date():
        return f"어제 {local:%H:%M}"
    return f"{local.month}월 {local.day}일"


def long_time(at: datetime, now: datetime | None = None) -> str:
    """상세용: '오늘 09:50' · '어제 14:02' · '11월 17일 10:00' (1분 안은 '방금')"""
    short = short_time(at, now)
    if short == "방금" or short.startswith("어제"):
        return short
    local = _local(at)
    if ":" in short:
        return f"오늘 {short}"
    return f"{local.month}월 {local.day}일 {local:%H:%M}"


def _day(at: datetime) -> str:
    local = _local(at)
    return f"{local.month}월 {local.day}일"


# ───────── 알림 ─────────


def create_notification(
    db: Session,
    park_id: int,
    type: str,
    title: str,
    place: str,
    note: str | None = None,
    payload: dict | None = None,
    pinned: bool = False,
) -> Notification:
    notification = Notification(
        park_id=park_id,
        type=type,
        status="new",
        title=title,
        place=place,
        note=note,
        pinned=pinned,
        payload=payload or {},
        created_at=datetime.now(UTC),
    )
    db.add(notification)
    db.flush()
    return notification


def _item(n: Notification) -> NotificationItem:
    return NotificationItem(
        id=str(n.id),
        type=n.type,
        status=n.status,
        title=n.title,
        place=n.place,
        time=short_time(n.created_at),
        note=n.note,
        # 처리하지 않은 로봇 오류는 맨 위에 고정해요
        pinned=n.pinned and n.status != "resolved",
    )


def _detail(n: Notification) -> NotificationDetail:
    p = n.payload or {}
    return NotificationDetail(
        **_item(n).model_dump(),
        happened_at=long_time(n.created_at),
        photo_url=p.get("photoUrl"),
        detection=p.get("detection"),
        recheck=p.get("recheck"),
        robot_issue=p.get("robotIssue"),
        park_change=p.get("parkChange"),
    )


def _my_notification(db: Session, park: Park, notification_id: int) -> Notification:
    n = db.scalar(
        select(Notification)
        .where(Notification.id == notification_id, Notification.park_id == park.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if n is None:
        raise AppError(404, "알림을 찾을 수 없어요", code="notification_not_found")
    return n


@transaction()
def list_notifications(db: Session, user: User, type: str | None, limit: int) -> list[NotificationItem]:
    park = _park(db, user)
    statement = select(Notification).where(Notification.park_id == park.id)
    if type:
        statement = statement.where(Notification.type == type)
    rows = db.scalars(statement.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit))
    return [_item(n) for n in rows]


@transaction()
def get_notification(db: Session, user: User, notification_id: int) -> NotificationDetail:
    park = _park(db, user)
    n = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.park_id == park.id))
    if n is None:
        raise AppError(404, "알림을 찾을 수 없어요", code="notification_not_found")
    return _detail(n)


@transaction(write=True)
def ack(db: Session, user: User, notification_id: int) -> NotificationDetail:
    n = _my_notification(db, _park(db, user), notification_id)
    if n.status == "new":
        n.status = "acked"
    db.flush()
    return _detail(n)


def _queue_recheck(db: Session, n: Notification):
    """집기 불가 재확인을 대기열에 넣어요. 순서는 같은 공원에서 재확인 기다리는 알림 수로 정해요."""
    waiting = db.scalars(
        select(Notification).where(
            Notification.park_id == n.park_id, Notification.type == "unpickable", Notification.id != n.id
        )
    )
    position = 1 + sum(1 for other in waiting if (other.payload or {}).get("recheck", {}).get("status") == "requested")
    n.payload = {
        **(n.payload or {}),
        "recheck": {"status": "requested", "queuePosition": position, "eta": None, "checkedAt": None, "photoUrl": None},
    }


@transaction(write=True)
def resolve(db: Session, user: User, notification_id: int) -> NotificationDetail:
    """처리 완료 표시. 집기 불가는 로봇이 다시 가서 치워졌는지 확인하도록 재확인을 대기열에 넣어요."""
    n = _my_notification(db, _park(db, user), notification_id)
    n.status = "resolved"
    if n.type == "unpickable":
        _queue_recheck(db, n)
    db.flush()
    return _detail(n)


@transaction(write=True)
def recheck(db: Session, user: User, notification_id: int) -> NotificationDetail:
    n = _my_notification(db, _park(db, user), notification_id)
    if n.type != "unpickable":
        raise AppError(409, "줍지 못한 쓰레기 알림만 재확인할 수 있어요", code="recheck_not_supported")
    if n.status == "new":
        n.status = "acked"
    _queue_recheck(db, n)
    db.flush()
    return _detail(n)


# ───────── 공원 변경 요청 ─────────


def _change_response(db: Session, r: ParkChangeRequest) -> ParkChangeResponse:
    names = dict(
        db.execute(
            select(ParkCatalogEntry.id, ParkCatalogEntry.name).where(
                ParkCatalogEntry.id.in_([r.from_catalog_id, r.to_catalog_id])
            )
        ).all()
    )
    return ParkChangeResponse(
        id=str(r.id),
        from_park=names.get(r.from_catalog_id, ""),
        to_park=names.get(r.to_catalog_id, ""),
        to_catalog_id=str(r.to_catalog_id),
        memo=r.memo,
        status=r.status,
        created_at=r.created_at,
    )


def _catalog_taken(db: Session, catalog_id: int) -> bool:
    return db.scalar(select(Park.id).where(Park.catalog_id == catalog_id, Park.status == "approved")) is not None


@transaction()
def current_change(db: Session, user: User) -> ParkChangeResponse | None:
    park = _park(db, user)
    r = db.scalar(
        select(ParkChangeRequest).where(ParkChangeRequest.park_id == park.id, ParkChangeRequest.status == "pending")
    )
    return _change_response(db, r) if r else None


@transaction(write=True)
def request_change(db: Session, user: User, body: ParkChangeInput) -> ParkChangeResponse:
    park = _park(db, user)
    target = db.get(ParkCatalogEntry, int(body.catalog_id))
    if target is None or not target.is_active:
        raise AppError(404, "선택한 공원을 찾을 수 없어요", code="park_not_found")
    if target.id == park.catalog_id:
        raise AppError(409, "지금 관리하는 공원이에요", code="same_park")
    if _catalog_taken(db, target.id):
        raise AppError(409, "이미 담당 관리자가 있는 공원이에요", code="park_already_managed")
    if db.scalar(
        select(ParkChangeRequest.id).where(ParkChangeRequest.park_id == park.id, ParkChangeRequest.status == "pending")
    ):
        raise AppError(409, "이미 확인 중인 공원 변경 요청이 있어요", code="park_change_exists")
    r = ParkChangeRequest(
        park_id=park.id,
        from_catalog_id=park.catalog_id,
        to_catalog_id=target.id,
        memo=body.memo or None,
        status="pending",
        created_at=datetime.now(UTC),
    )
    db.add(r)
    db.flush()
    return _change_response(db, r)


@transaction(write=True)
def cancel_change(db: Session, user: User, request_id: int) -> ParkChangeResponse:
    park = _park(db, user)
    r = db.scalar(
        select(ParkChangeRequest)
        .where(ParkChangeRequest.id == request_id, ParkChangeRequest.park_id == park.id)
        .with_for_update()
    )
    if r is None:
        raise AppError(404, "공원 변경 요청을 찾을 수 없어요", code="park_change_not_found")
    if r.status != "pending":
        raise AppError(409, "확인 중인 요청만 취소할 수 있어요", code="park_change_not_pending")
    r.status = "canceled"
    r.resolved_at = datetime.now(UTC)
    db.flush()
    return _change_response(db, r)


@transaction()
def admin_changes(db: Session, user: User, status: str | None, limit: int, offset: int):
    require_super_admin(user)
    statement = (
        select(ParkChangeRequest, User)
        .join(Park, ParkChangeRequest.park_id == Park.id)
        .join(User, Park.user_id == User.id)
    )
    if status:
        statement = statement.where(ParkChangeRequest.status == status)
    rows = db.execute(statement.order_by(ParkChangeRequest.created_at).limit(limit).offset(offset)).all()
    return [
        AdminParkChangeResponse(
            **_change_response(db, r).model_dump(), park_id=str(r.park_id), applicant_name=applicant.name
        )
        for r, applicant in rows
    ]


def _pending_change(db: Session, request_id: int) -> ParkChangeRequest:
    r = db.scalar(
        select(ParkChangeRequest)
        .where(ParkChangeRequest.id == request_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if r is None:
        raise AppError(404, "공원 변경 요청을 찾을 수 없어요", code="park_change_not_found")
    if r.status != "pending":
        raise AppError(409, "확인 중인 요청만 처리할 수 있어요", code="park_change_not_pending")
    return r


def _robot_names(db: Session, park_id: int) -> str:
    names = list(db.scalars(select(Robot.name).where(Robot.park_id == park_id).order_by(Robot.id)))
    return " · ".join(names) if names else "로봇"


def _notify_change(db: Session, r: ParkChangeRequest, result: str):
    view = _change_response(db, r)
    rejected = result == "rejected"
    create_notification(
        db,
        r.park_id,
        "parkChange",
        "공원 변경 요청이 반려됐어요" if rejected else "공원 변경이 승인됐어요",
        (r.reason_kind or f"{view.to_park} 요청이 반려됐어요") if rejected else f"이제 {view.to_park}을 관리해요",
        note="운영 관리자",
        payload={
            "parkChange": {
                "result": result,
                "requestedOn": _day(r.created_at),
                "currentPark": view.from_park,
                "requestedPark": view.to_park,
                "reasonKind": r.reason_kind,
                "reason": r.reason,
                "robotNames": _robot_names(db, r.park_id),
            }
        },
    )


@transaction(write=True)
def approve_change(db: Session, user: User, request_id: int) -> ParkChangeResponse:
    """승인: 같은 공원 행의 카탈로그를 바꿔서 로봇이 같이 옮겨 가요. 기존 경로·지점·시간표는 지우고 처음 설정부터 다시 해요."""
    require_super_admin(user)
    r = _pending_change(db, request_id)
    if _catalog_taken(db, r.to_catalog_id):
        raise AppError(409, "이미 담당 관리자가 있는 공원이에요", code="park_already_managed")
    park = db.get(Park, r.park_id)
    _deactivate(db, park)
    _hide_points(db, park)
    db.execute(delete(Schedule).where(Schedule.park_id == park.id))
    park.catalog_id = r.to_catalog_id
    park.route_setup_done = False
    r.status = "approved"
    r.resolved_by = user.id
    r.resolved_at = datetime.now(UTC)
    db.flush()
    _notify_change(db, r, "approved")
    return _change_response(db, r)


@transaction(write=True)
def reject_change(db: Session, user: User, request_id: int, body: ParkChangeRejection) -> ParkChangeResponse:
    require_super_admin(user)
    r = _pending_change(db, request_id)
    r.status = "rejected"
    r.reason_kind = body.reason_kind
    r.reason = body.reason
    r.resolved_by = user.id
    r.resolved_at = datetime.now(UTC)
    db.flush()
    _notify_change(db, r, "rejected")
    return _change_response(db, r)


# ───────── 운영 설정 · 알림 설정 ─────────


def _operation(park: Park) -> OperationSettings:
    return OperationSettings(charge_at=park.charge_at, empty_at=park.empty_at, agent_paused=park.agent_paused)


@transaction()
def get_operation(db: Session, user: User) -> OperationSettings:
    return _operation(_park(db, user))


@transaction(write=True)
def save_operation(db: Session, user: User, body: OperationSettings) -> OperationSettings:
    park = _park(db, user)
    park.charge_at = body.charge_at
    park.empty_at = body.empty_at
    park.agent_paused = body.agent_paused
    db.flush()
    return _operation(park)


def _notify_settings(user: User) -> NotificationSettings:
    return NotificationSettings(unpickable=user.notify_unpickable, daily_report=user.notify_daily_report)


@transaction()
def get_notify_settings(db: Session, user: User) -> NotificationSettings:
    return _notify_settings(user)


@transaction(write=True)
def patch_notify_settings(db: Session, user: User, body: NotificationSettingsPatch) -> NotificationSettings:
    target = db.get(User, user.id)
    if body.unpickable is not None:
        target.notify_unpickable = body.unpickable
    if body.daily_report is not None:
        target.notify_daily_report = body.daily_report
    db.flush()
    return _notify_settings(target)
