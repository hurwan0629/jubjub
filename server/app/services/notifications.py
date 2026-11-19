"""계정별 알림 조회와 읽음 처리·기기 토큰 소유권을 관리해요."""

from contextlib import contextmanager

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Notification, NotificationPushDelivery, PushToken, User
from app.schemas.notifications import NotificationResponse, PushTokenInput, PushTokenResponse
from app.schemas.parks import LatLng


@contextmanager
def _transaction(db: Session, *, write=False):
    try:
        yield
        if write:
            db.commit()
    except AppError:
        if write:
            db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise AppError(
            503, "알림 정보를 처리하지 못했어요. 다시 시도해 주세요", code="notifications_unavailable"
        ) from exc


def _response(notification: Notification) -> NotificationResponse:
    return NotificationResponse(
        id=str(notification.id),
        type=notification.notification_type,
        title=notification.title,
        body=notification.body,
        park_id=str(notification.park_id) if notification.park_id is not None else None,
        robot_id=str(notification.robot_id) if notification.robot_id is not None else None,
        position=LatLng(latitude=notification.lat, longitude=notification.lng)
        if notification.lat is not None
        else None,
        occurred_at=notification.occurred_at,
        is_read=notification.is_read,
    )


def list_notifications(
    db: Session, user: User, notification_type: str | None, is_read: bool | None, limit: int, offset: int
):
    with _transaction(db):
        statement = select(Notification).where(Notification.user_id == user.id)
        if notification_type is not None:
            statement = statement.where(Notification.notification_type == notification_type)
        if is_read is not None:
            statement = statement.where(Notification.is_read == is_read)
        return [
            _response(item)
            for item in db.scalars(
                statement.order_by(Notification.occurred_at.desc(), Notification.id.desc()).limit(limit).offset(offset)
            )
        ]


def unread_count(db: Session, user: User) -> dict:
    with _transaction(db):
        return {
            "count": db.scalar(
                select(func.count())
                .select_from(Notification)
                .where(Notification.user_id == user.id, Notification.is_read.is_(False))
            )
        }


def _owned(db: Session, user: User, notification_id: int, *, lock=False) -> Notification:
    statement = select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id)
    if lock:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    notification = db.scalar(statement)
    if notification is None:
        raise AppError(404, "알림을 찾을 수 없어요", code="notification_not_found")
    return notification


def get_notification(db: Session, user: User, notification_id: int):
    with _transaction(db):
        return _response(_owned(db, user, notification_id))


def mark_read(db: Session, user: User, notification_id: int):
    with _transaction(db, write=True):
        item = _owned(db, user, notification_id, lock=True)
        item.is_read = True
        db.flush()
        return _response(item)


def register_push_token(db: Session, user: User, body: PushTokenInput):
    with _transaction(db, write=True):
        insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else pg_insert
        statement = insert(PushToken).values(
            user_id=user.id, token=body.token.get_secret_value(), platform=body.platform, is_active=True
        )
        statement = (
            statement.on_conflict_do_update(
                index_elements=[PushToken.token],
                set_={
                    "user_id": user.id,
                    "platform": body.platform,
                    "is_active": True,
                    "updated_at": func.now(),
                },
            )
            .returning(PushToken)
            .execution_options(populate_existing=True)
        )
        item = db.scalars(statement).one()
        return PushTokenResponse(
            id=str(item.id),
            platform=item.platform,
            is_active=item.is_active,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )


def unregister_push_token(db: Session, user: User, token: str):
    with _transaction(db, write=True):
        # 다른 계정의 토큰 존재 여부를 노출하지 않고 현재 소유자의 토큰만 비활성화해요.
        db.execute(
            update(PushToken)
            .where(PushToken.token == token, PushToken.user_id == user.id)
            .values(is_active=False, updated_at=func.now())
        )


def enqueue_notification(db: Session, notification: Notification):
    """호출자가 커밋할 때 알림과 발송 대기열이 함께 확정돼요."""
    db.add(notification)
    db.flush()
    tokens = db.scalars(
        select(PushToken.id).where(PushToken.user_id == notification.user_id, PushToken.is_active.is_(True))
    )
    for token_id in tokens:
        db.add(NotificationPushDelivery(notification_id=notification.id, push_token_id=token_id))
    db.flush()
