"""알림 소유권과 읽음 처리·기기 토큰 등록을 검증해요."""

from sqlalchemy import select

from app.core.security import create_access_token
from app.models import Notification, NotificationPushDelivery, PushToken
from tests import patrol_fixtures
from tests.patrol_fixtures import choose

setup_client = patrol_fixtures.setup_client
TOKEN = "ExpoPushToken[test-device-token]"


def test_assignment_failure_rolls_back_inbox_and_push_queue(setup_client, monkeypatch):
    from sqlalchemy.exc import SQLAlchemyError

    from app.services import robot_assignment
    from app.services.notifications import enqueue_notification
    from tests.robot_assignment_requests_test import admin, request_robot, robot

    client, db = setup_client
    choose(client)
    assert client.put("/push-tokens", json={"token": TOKEN, "platform": "ios"}).status_code == 200
    item = robot(db, "queue-rollback")
    request = request_robot(client)

    def fail(db, notification):
        enqueue_notification(db, notification)
        raise SQLAlchemyError("simulated commit failure")

    monkeypatch.setattr(robot_assignment, "enqueue_notification", fail)
    response = client.post(
        f"/admin/robot-assignment-requests/{request['id']}/approve", headers=admin(), json={"robotIds": [str(item.id)]}
    )
    assert response.status_code == 503
    assert db.scalar(select(Notification)) is None
    assert db.scalar(select(NotificationPushDelivery)) is None
    assert client.get("/robot-assignment-requests").json()[0]["status"] == "pending"


def headers(user_id):
    token, _ = create_access_token(user_id)
    return {"Authorization": f"Bearer {token}"}


def test_inbox_count_filters_detail_and_idempotent_read_are_scoped_to_owner(setup_client):
    client, db = setup_client
    choose(client)
    first = Notification(
        user_id=1,
        recipient_role="manager",
        notification_type="robotAssignmentApproved",
        title="배정 완료",
        body="로봇 1대 배정",
    )
    other = Notification(
        user_id=10, recipient_role="super_admin", notification_type="admin", title="총관리자 알림", body="관리자용"
    )
    read = Notification(
        user_id=1,
        recipient_role="manager",
        notification_type="robotAssignmentRejected",
        title="반려",
        body="사유",
        is_read=True,
    )
    db.add_all([first, other, read])
    db.commit()
    result = client.get("/notifications")
    assert result.status_code == 200, result.text
    assert {item["id"] for item in result.json()} == {str(first.id), str(read.id)}
    assert client.get("/notifications/unread-count").json() == {"count": 1}
    assert len(client.get("/notifications?isRead=false").json()) == 1
    assert client.get("/notifications?type=robotAssignmentApproved").json()[0]["id"] == str(first.id)
    assert len(client.get("/notifications?limit=1&offset=1").json()) == 1
    assert client.get(f"/notifications/{other.id}").status_code == 404
    assert client.patch(f"/notifications/{other.id}/read").status_code == 404
    response = client.patch(f"/notifications/{first.id}/read")
    assert response.status_code == 200, response.text
    assert response.json()["isRead"] is True
    assert client.patch(f"/notifications/{first.id}/read").json()["occurredAt"] == response.json()["occurredAt"]
    assert client.get("/notifications/unread-count").json() == {"count": 0}
    assert len(client.get("/notifications", headers=headers(10)).json()) == 1


def test_token_upsert_reassigns_device_and_only_current_owner_can_unregister(setup_client):
    client, db = setup_client
    choose(client)
    body = {"token": TOKEN, "platform": "android"}
    first = client.put("/push-tokens", json=body)
    assert first.status_code == 200, first.text
    assert "token" not in first.json()
    again = client.put("/push-tokens", json=body)
    assert again.json()["id"] == first.json()["id"]
    assert again.json()["createdAt"] == first.json()["createdAt"]
    assert client.put("/push-tokens", headers=headers(10), json=body).json()["id"] == first.json()["id"]
    assert client.request("DELETE", "/push-tokens", json={"token": TOKEN}).status_code == 204
    db.expire_all()
    saved = db.scalar(select(PushToken).where(PushToken.token == TOKEN))
    assert saved.user_id == 10 and saved.is_active
    assert client.request("DELETE", "/push-tokens", headers=headers(10), json={"token": TOKEN}).status_code == 204
    db.expire_all()
    assert not saved.is_active
    assert client.put("/push-tokens", json=body).status_code == 200
    db.expire_all()
    assert saved.is_active and saved.user_id == 1
    assert client.put("/push-tokens", json={"token": "native-fcm-token", "platform": "android"}).status_code == 422
    assert client.put("/push-tokens", json=body | {"userId": "10"}).status_code == 422
    assert client.get("/notifications?limit=101").status_code == 422
