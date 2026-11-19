"""인증된 사용자 본인의 알림과 기기 토큰만 처리해요."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Response

from app.routers.patrol import DB, Admin
from app.schemas.notifications import (
    NotificationResponse,
    PushTokenInput,
    PushTokenReference,
    PushTokenResponse,
    UnreadCountResponse,
)
from app.services import notifications

router = APIRouter(tags=["notifications"])
NotificationID = Annotated[int, Path(ge=1, le=9223372036854775807)]


@router.get("/notifications", response_model=list[NotificationResponse], summary="내 알림 목록")
def list_notifications(
    db: DB,
    user: Admin,
    notification_type: Annotated[str | None, Query(alias="type", min_length=1, max_length=100)] = None,
    is_read: Annotated[bool | None, Query(alias="isRead")] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0, le=9223372036854775807),
):
    return notifications.list_notifications(db, user, notification_type, is_read, limit, offset)


@router.get("/notifications/unread-count", response_model=UnreadCountResponse, summary="내 미확인 알림 개수")
def unread_count(db: DB, user: Admin):
    return notifications.unread_count(db, user)


@router.get("/notifications/{notification_id}", response_model=NotificationResponse, summary="내 알림 상세")
def get_notification(notification_id: NotificationID, db: DB, user: Admin):
    return notifications.get_notification(db, user, notification_id)


@router.patch("/notifications/{notification_id}/read", response_model=NotificationResponse, summary="내 알림 읽음 처리")
def mark_read(notification_id: NotificationID, db: DB, user: Admin):
    return notifications.mark_read(db, user, notification_id)


@router.put("/push-tokens", response_model=PushTokenResponse, summary="현재 기기의 Expo 토큰 등록·갱신")
def register_push_token(body: PushTokenInput, db: DB, user: Admin):
    return notifications.register_push_token(db, user, body)


@router.delete("/push-tokens", status_code=204, summary="로그아웃·권한 해제 시 현재 기기 토큰 해제")
def unregister_push_token(body: PushTokenReference, db: DB, user: Admin):
    notifications.unregister_push_token(db, user, body.token.get_secret_value())
    return Response(status_code=204)
