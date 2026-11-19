"""배정 요청과 승인·실제 배정의 원자성을 HTTP로 검증해요."""

import pytest
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.core.security import create_access_token
from app.models import Notification, Park, Robot, RobotAssignmentRequestRobot
from tests import patrol_fixtures
from tests.patrol_fixtures import choose, config

setup_client = patrol_fixtures.setup_client


@pytest.mark.parametrize(
    "body",
    [
        {"robotCount": 1},
        {"robotCount": 1, "reason": ""},
        {"robotCount": 1, "reason": " \t\n "},
        {"robotCount": 1, "reason": "\u3000"},
        {"robotCount": 1, "reason": None},
    ],
)
def test_assignment_reason_is_required_and_cannot_be_blank(setup_client, body):
    client, _ = setup_client
    choose(client)
    response = client.post("/robot-assignment-requests", json=body)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "validation_error"
    assert any(item["field"] == "body.reason" for item in response.json()["details"])
    assert client.get("/robot-assignment-requests").json() == []


def test_assignment_reason_is_trimmed_and_accepts_maximum_length(setup_client):
    client, _ = setup_client
    choose(client)
    response = client.post("/robot-assignment-requests", json={"robotCount": 1, "reason": "  " + "가" * 1000 + "  "})
    assert response.status_code == 201, response.text
    assert response.json()["reason"] == "가" * 1000


def test_failure_after_assignment_rolls_back_links_status_and_notification(setup_client, monkeypatch):
    from app.services import robot_assignment

    client, db = setup_client
    choose(client)
    item = robot(db, "rollback-test")
    request = request_robot(client)

    def fail(*args):
        raise SQLAlchemyError("simulated draft copy failure")

    monkeypatch.setattr(robot_assignment, "inherit_draft", fail)
    result = client.post(
        f"/admin/robot-assignment-requests/{request['id']}/approve", headers=admin(), json={"robotIds": [str(item.id)]}
    )
    assert result.status_code == 503, result.text
    assert client.get("/robot-assignment-requests").json()[0]["status"] == "pending"
    db.expire_all()
    assert db.get(Robot, item.id).park_id is None
    assert db.scalar(select(RobotAssignmentRequestRobot)) is None
    assert db.scalar(select(Notification)) is None


def test_other_manager_cannot_see_or_cancel_and_stale_park_cannot_be_approved(setup_client):
    client, db = setup_client
    choose(client)
    request = request_robot(client)
    from datetime import UTC, datetime

    db.add(Park(user_id=2, catalog_id=2, status="approved", reviewed_by=10, reviewed_at=datetime.now(UTC)))
    db.commit()
    token, _ = create_access_token(2)
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/robot-assignment-requests", headers=headers).json() == []
    assert client.post(f"/robot-assignment-requests/{request['id']}/cancel", headers=headers).status_code == 404
    park = db.scalar(select(Park).where(Park.user_id == 1))
    park.status = "rejected"
    park.reviewed_at = park.reviewed_by = None
    park.reject_reason = "승인 취소"
    db.commit()
    assert client.post("/robot-assignment-requests", json={"robotCount": 1, "reason": "요청 사유"}).status_code == 403
    item = robot(db, "stale-test")
    result = client.post(
        f"/admin/robot-assignment-requests/{request['id']}/approve", headers=admin(), json={"robotIds": [str(item.id)]}
    )
    assert result.status_code == 409, result.text
    assert result.json()["code"] == "robot_assignment_request_stale"
    assert db.get(Robot, item.id).park_id is None


def test_additional_assignment_preserves_existing_configuration_and_history(setup_client):
    client, db = setup_client
    park = choose(client)
    first, second = robot(db, "existing-robot"), robot(db, "extra-robot")
    assert (
        client.patch(f"/admin/robots/{first.id}/assignment", headers=admin(), json={"parkId": park["id"]}).status_code
        == 200
    )
    assert client.put(f"/route?robotId={first.id}", json=config()).status_code == 200
    before = client.get(f"/route?robotId={first.id}").json()
    request = request_robot(client)
    result = client.post(
        f"/admin/robot-assignment-requests/{request['id']}/approve", headers=admin(), json={"robotIds": [str(first.id)]}
    )
    assert result.status_code == 409
    assert (
        client.post(
            f"/admin/robot-assignment-requests/{request['id']}/approve",
            headers=admin(),
            json={"robotIds": [str(second.id)]},
        ).status_code
        == 200
    )
    assert client.get(f"/route?robotId={first.id}").json() == before
    assert (
        client.patch(f"/admin/robots/{second.id}/assignment", headers=admin(), json={"parkId": None}).status_code == 200
    )
    assert client.get("/robot-assignment-requests").json()[0]["assignedRobotIds"] == [str(second.id)]


@pytest.mark.parametrize("ids", [[], ["1", "1"], ["9223372036854775808"]])
def test_invalid_approval_ids_are_rejected(setup_client, ids):
    client, _ = setup_client
    choose(client)
    request = request_robot(client)
    assert (
        client.post(
            f"/admin/robot-assignment-requests/{request['id']}/approve", headers=admin(), json={"robotIds": ids}
        ).status_code
        == 422
    )


def admin():
    token, _ = create_access_token(10)
    return {"Authorization": f"Bearer {token}"}


def request_robot(client, count=1):
    result = client.post("/robot-assignment-requests", json={"robotCount": count, "reason": "추가 순찰이 필요해요"})
    assert result.status_code == 201, result.text
    return result.json()


def robot(db, serial, **values):
    item = Robot(name=serial, serial_no=serial, status="offline", **values)
    db.add(item)
    db.commit()
    return item


def test_first_assignment_is_atomic_and_copies_draft_to_every_robot(setup_client):
    client, db = setup_client
    park = choose(client)
    assert client.put("/route", json=config()).status_code == 200
    first, second = robot(db, "request-a"), robot(db, "request-b")
    request = request_robot(client, 2)
    assert request["parkId"] == park["id"]
    assert request["catalogId"] == park["catalogId"]
    assert request["userId"] == "1" and request["status"] == "pending"
    assert client.get("/robots").json() == []
    assert client.get("/admin/robot-assignment-requests", headers=admin()).json()[0]["id"] == request["id"]
    response = client.post(
        f"/admin/robot-assignment-requests/{request['id']}/approve",
        headers=admin(),
        json={"robotIds": [str(first.id), str(second.id)]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "approved"
    assert set(response.json()["assignedRobotIds"]) == {str(first.id), str(second.id)}
    assert response.json()["reviewedBy"] == "10"
    assert len(client.get("/robots").json()) == 2
    assert (
        db.scalar(select(Notification).where(Notification.notification_type == "robotAssignmentApproved")).user_id == 1
    )
    a = client.get(f"/route?robotId={first.id}").json()
    b = client.get(f"/route?robotId={second.id}").json()
    assert a["points"] and b["points"]
    assert a["points"][0]["id"] != b["points"][0]["id"]
    assert (
        client.post(
            f"/admin/robot-assignment-requests/{request['id']}/approve",
            headers=admin(),
            json={"robotIds": [str(first.id), str(second.id)]},
        ).status_code
        == 409
    )


def test_failed_approval_leaves_request_and_all_robots_unchanged(setup_client):
    client, db = setup_client
    choose(client)
    first, second = robot(db, "atomic-a"), robot(db, "atomic-b")
    second.status = "working"
    db.commit()
    request = request_robot(client, 2)
    url = f"/admin/robot-assignment-requests/{request['id']}/approve"
    assert client.post(url, headers=admin(), json={"robotIds": [str(first.id)]}).status_code == 422
    assert client.post(url, headers=admin(), json={"robotIds": [str(first.id), str(second.id)]}).status_code == 409
    assert client.get("/robot-assignment-requests").json()[0]["status"] == "pending"
    db.expire_all()
    assert db.get(Robot, first.id).park_id is None
    assert db.get(Robot, second.id).park_id is None
    second.status = "offline"
    db.commit()
    assert client.post(url, headers=admin(), json={"robotIds": [str(first.id), str(second.id)]}).status_code == 200


def test_cancel_reject_and_duplicate_requests_preserve_assignment(setup_client):
    client, db = setup_client
    choose(client)
    request = request_robot(client)
    assert client.post("/robot-assignment-requests", json={"robotCount": 1, "reason": "추가 요청"}).status_code == 409
    assert client.post(f"/robot-assignment-requests/{request['id']}/cancel").status_code == 200
    request = request_robot(client)
    rejected = client.post(
        f"/admin/robot-assignment-requests/{request['id']}/reject",
        headers=admin(),
        json={"reason": "가용 로봇이 없어요"},
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["rejectReason"] == "가용 로봇이 없어요"
    assert client.post(f"/robot-assignment-requests/{request['id']}/cancel").status_code == 409
    assert client.get("/robots").json() == []
    assert db.scalar(select(Robot)) is None
    assert client.post("/robot-assignment-requests", json={"robotCount": 1, "reason": "다시 요청"}).status_code == 201


@pytest.mark.parametrize(
    "body",
    [
        {"robotCount": 0, "reason": "요청 사유"},
        {"robotCount": 101, "reason": "요청 사유"},
        {"robotCount": True, "reason": "요청 사유"},
        {"robotCount": 1, "userId": "2", "reason": "요청 사유"},
        {"robotCount": 1, "parkId": "2", "reason": "요청 사유"},
        {"robotCount": 1, "reason": "x" * 1001},
    ],
)
def test_request_validation_and_no_client_selected_owner(setup_client, body):
    client, _ = setup_client
    choose(client)
    assert client.post("/robot-assignment-requests", json=body).status_code == 422


def test_manager_cannot_approve_and_cannot_cancel_another_users_request(setup_client):
    client, _ = setup_client
    choose(client)
    request = request_robot(client)
    assert client.get("/admin/robot-assignment-requests").status_code == 403
    assert (
        client.post(f"/admin/robot-assignment-requests/{request['id']}/approve", json={"robotIds": ["1"]}).status_code
        == 403
    )
    assert (
        client.post(
            "/robot-assignment-requests", headers=admin(), json={"robotCount": 1, "reason": "요청 사유"}
        ).status_code
        == 403
    )
    # 총관리자도 하위관리자의 취소 API를 대신 사용할 수 없어요.
    assert client.post(f"/robot-assignment-requests/{request['id']}/cancel", headers=admin()).status_code == 403
