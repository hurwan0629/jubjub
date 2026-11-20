"""관리자 앱 알림(A-05 · A-06) · 공원 변경 요청(C-02) · 운영 설정(A-12) · 알림 설정(C-02) API예요."""

from typing import Annotated, Literal

from fastapi import APIRouter, Path, Query

from app.routers.patrol import DB, Admin
from app.schemas.manager import (
    AdminParkChangeResponse,
    NotificationDetail,
    NotificationItem,
    NotificationSettings,
    NotificationSettingsPatch,
    NotificationType,
    OperationSettings,
    ParkChangeInput,
    ParkChangeRejection,
    ParkChangeResponse,
)
from app.services import manager

router = APIRouter()
ItemID = Annotated[int, Path(ge=1, le=9223372036854775807)]


@router.get("/notifications", response_model=list[NotificationItem], tags=["notifications"], summary="알림 목록")
def list_notifications(db: DB, user: Admin, type: NotificationType | None = None, limit: int = Query(50, ge=1, le=100)):
    return manager.list_notifications(db, user, type, limit)


@router.get("/notifications/{notification_id}", response_model=NotificationDetail, tags=["notifications"])
def get_notification(notification_id: ItemID, db: DB, user: Admin):
    return manager.get_notification(db, user, notification_id)


@router.post("/notifications/{notification_id}/ack", response_model=NotificationDetail, tags=["notifications"])
def ack_notification(notification_id: ItemID, db: DB, user: Admin):
    return manager.ack(db, user, notification_id)


@router.post(
    "/notifications/{notification_id}/resolve",
    response_model=NotificationDetail,
    tags=["notifications"],
    summary="처리 완료 표시 (집기 불가는 재확인을 대기열에 넣어요)",
)
def resolve_notification(notification_id: ItemID, db: DB, user: Admin):
    return manager.resolve(db, user, notification_id)


@router.post("/notifications/{notification_id}/recheck", response_model=NotificationDetail, tags=["notifications"])
def recheck_notification(notification_id: ItemID, db: DB, user: Admin):
    return manager.recheck(db, user, notification_id)


@router.get("/park-change-requests/current", response_model=ParkChangeResponse | None, tags=["park-change"])
def current_park_change(db: DB, user: Admin):
    return manager.current_change(db, user)


@router.post("/park-change-requests", response_model=ParkChangeResponse, status_code=201, tags=["park-change"])
def request_park_change(body: ParkChangeInput, db: DB, user: Admin):
    return manager.request_change(db, user, body)


@router.post("/park-change-requests/{request_id}/cancel", response_model=ParkChangeResponse, tags=["park-change"])
def cancel_park_change(request_id: ItemID, db: DB, user: Admin):
    return manager.cancel_change(db, user, request_id)


@router.get("/admin/park-change-requests", response_model=list[AdminParkChangeResponse], tags=["administration"])
def admin_park_changes(
    db: DB,
    user: Admin,
    status: Literal["pending", "approved", "rejected", "canceled"] | None = "pending",
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
):
    return manager.admin_changes(db, user, status, limit, offset)


@router.post(
    "/admin/park-change-requests/{request_id}/approve", response_model=ParkChangeResponse, tags=["administration"]
)
def approve_park_change(request_id: ItemID, db: DB, user: Admin):
    return manager.approve_change(db, user, request_id)


@router.post(
    "/admin/park-change-requests/{request_id}/reject", response_model=ParkChangeResponse, tags=["administration"]
)
def reject_park_change(request_id: ItemID, body: ParkChangeRejection, db: DB, user: Admin):
    return manager.reject_change(db, user, request_id, body)


@router.get("/settings/operation", response_model=OperationSettings, tags=["settings"], summary="운영 설정")
def get_operation(db: DB, user: Admin):
    return manager.get_operation(db, user)


@router.put("/settings/operation", response_model=OperationSettings, tags=["settings"])
def save_operation(body: OperationSettings, db: DB, user: Admin):
    return manager.save_operation(db, user, body)


@router.get("/settings/notifications", response_model=NotificationSettings, tags=["settings"], summary="알림 설정")
def get_notify_settings(db: DB, user: Admin):
    return manager.get_notify_settings(db, user)


@router.patch("/settings/notifications", response_model=NotificationSettings, tags=["settings"])
def patch_notify_settings(body: NotificationSettingsPatch, db: DB, user: Admin):
    return manager.patch_notify_settings(db, user, body)
