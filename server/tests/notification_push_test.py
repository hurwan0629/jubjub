"""외부 네트워크 없이 Expo 티켓·영수증·재시도를 검증해요."""

from datetime import UTC, datetime, timedelta
from urllib.error import HTTPError

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.models import Notification, NotificationPushDelivery, PushToken
from app.services.notifications import enqueue_notification
from tests import patrol_fixtures
from tests.patrol_fixtures import choose

setup_client = patrol_fixtures.setup_client


@pytest.mark.parametrize("status,retryable", [(429, True), (503, True), (400, False), (401, False)])
def test_expo_http_errors_are_classified_without_exposing_tokens(monkeypatch, status, retryable):
    from app.services import notification_push as service

    def fail(*args, **kwargs):
        raise HTTPError("https://example.invalid", status, "secret token in provider message", {}, None)

    monkeypatch.setattr(service, "urlopen", fail)
    with pytest.raises(service.PushServiceError) as error:
        service._post("/send", {"to": "ExpoPushToken[secret]"})
    assert error.value.code == f"http_{status}"
    assert error.value.retryable is retryable
    assert "secret" not in str(error.value)


def test_disabled_push_does_not_access_database_or_network(monkeypatch):
    from app.services import notification_push as service

    monkeypatch.setenv("EXPO_PUSH_ENABLED", "false")
    get_settings.cache_clear()

    def must_not_run():
        raise AssertionError("비활성화된 푸시는 DB에 접근하면 안 돼요")

    assert service.dispatch_pending_pushes(must_not_run) == 0


def test_permanent_push_error_does_not_retry_and_keeps_inbox(setup_client, monkeypatch):
    from app.services import notification_push as service

    client, db = setup_client
    choose(client)
    _, notification = pending(db)
    monkeypatch.setenv("EXPO_PUSH_ENABLED", "true")
    get_settings.cache_clear()
    monkeypatch.setattr(
        service, "_post", lambda *args: {"data": {"status": "error", "details": {"error": "InvalidCredentials"}}}
    )
    service.dispatch_pending_pushes(sessionmaker(bind=db.get_bind()), limit=1)
    db.expire_all()
    job = db.scalar(select(NotificationPushDelivery))
    assert job.status == "failed" and job.attempts == 1
    assert db.get(Notification, notification.id) is not None


def pending(db):
    token = PushToken(user_id=1, token="ExpoPushToken[delivery-test]", platform="android")
    db.add(token)
    db.commit()
    notification = Notification(
        user_id=1,
        recipient_role="manager",
        notification_type="robotAssignmentApproved",
        title="민감한 공원 이름",
        body="관리자 전용 반려 사유",
    )
    enqueue_notification(db, notification)
    db.commit()
    return token, notification


def test_expo_ticket_then_receipt_and_private_content_is_not_in_push(setup_client, monkeypatch):
    from app.services import notification_push as service

    client, db = setup_client
    choose(client)
    token, notification = pending(db)
    monkeypatch.setenv("EXPO_PUSH_ENABLED", "true")
    get_settings.cache_clear()
    calls = []

    def post(path, payload):
        calls.append((path, payload))
        if path == "/send":
            return {"data": {"status": "ok", "id": "ticket-1"}}
        return {"data": {"ticket-1": {"status": "ok"}}}

    monkeypatch.setattr(service, "_post", post)
    factory = sessionmaker(bind=db.get_bind())
    assert service.dispatch_pending_pushes(factory, limit=1) == 1
    db.expire_all()
    job = db.scalar(select(NotificationPushDelivery))
    assert job.status == "submitted" and job.ticket_id == "ticket-1"
    assert calls[0][1]["to"] == token.token
    assert calls[0][1]["data"]["notificationId"] == str(notification.id)
    assert notification.body not in str(calls[0][1]) and notification.title not in str(calls[0][1])
    job.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()
    assert service.dispatch_pending_pushes(factory, limit=1) == 1
    db.expire_all()
    assert job.status == "delivered"


def test_retry_and_invalid_receipt_deactivate_device_without_losing_notification(setup_client, monkeypatch):
    from app.services import notification_push as service

    client, db = setup_client
    choose(client)
    token, notification = pending(db)
    monkeypatch.setenv("EXPO_PUSH_ENABLED", "true")
    get_settings.cache_clear()

    def fail(path, payload):
        raise service.PushServiceError("network_error", retryable=True)

    monkeypatch.setattr(service, "_post", fail)
    factory = sessionmaker(bind=db.get_bind())
    service.dispatch_pending_pushes(factory, limit=1)
    db.expire_all()
    job = db.scalar(select(NotificationPushDelivery))
    assert job.status == "pending" and job.attempts == 1
    assert db.get(Notification, notification.id) is not None
    job.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()
    monkeypatch.setattr(
        service,
        "_post",
        lambda path, payload: (
            {"data": {"status": "ok", "id": "invalid-device"}}
            if path == "/send"
            else {"data": {"invalid-device": {"status": "error", "details": {"error": "DeviceNotRegistered"}}}}
        ),
    )
    service.dispatch_pending_pushes(factory, limit=1)
    db.expire_all()
    job.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()
    service.dispatch_pending_pushes(factory, limit=1)
    db.expire_all()
    assert job.status == "failed" and not token.is_active


def test_switched_or_revoked_device_never_receives_previous_accounts_notification(setup_client, monkeypatch):
    from app.services import notification_push as service

    client, db = setup_client
    choose(client)
    token, _ = pending(db)
    token.user_id = 10
    db.commit()
    monkeypatch.setenv("EXPO_PUSH_ENABLED", "true")
    get_settings.cache_clear()

    def must_not_send(*args):
        raise AssertionError("다른 계정의 기기로 발송하면 안 돼요")

    monkeypatch.setattr(service, "_post", must_not_send)
    service.dispatch_pending_pushes(sessionmaker(bind=db.get_bind()), limit=1)
    db.expire_all()
    assert db.scalar(select(NotificationPushDelivery)).status == "cancelled"
