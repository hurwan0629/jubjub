"""공원 변경 승인과 총관리자 운영 화면의 실제 데이터 흐름을 검증해요."""

from datetime import UTC, date, datetime

from sqlalchemy import select

from app.core.security import create_access_token
from app.models import Park, Robot
from app.models.patrol import Route, Schedule
from tests import patrol_fixtures
from tests.patrol_fixtures import choose, config

setup_client = patrol_fixtures.setup_client


def admin():
    token, _ = create_access_token(10)
    return {"Authorization": f"Bearer {token}"}


def request_change(client):
    response = client.post("/park-change-requests", json={"catalogId": "2", "reason": "담당 지역 변경"})
    assert response.status_code == 201, response.text
    return response.json()


def test_pending_change_preserves_current_park_then_approval_resets_geometry(setup_client):
    client, db = setup_client
    park = choose(client)
    old = client.put("/route", json=config()).json()
    row = db.get(Park, int(park["id"]))
    row.anchor_points = [{"name": "old"}]
    db.commit()
    change = request_change(client)
    assert client.get("/park").json()["catalogId"] == "1"
    assert client.get("/route").json() == old
    assert client.post("/park-change-requests", json={"catalogId": "2", "reason": "다시"}).status_code == 409
    pending = client.get("/admin/park-change-requests", headers=admin()).json()
    assert pending[0]["id"] == change["id"]
    assert pending[0]["currentParkName"] == "공원1"
    response = client.post(f"/admin/park-change-requests/{change['id']}/approve", headers=admin(), json={})
    assert response.status_code == 200, response.text
    result = client.get("/park").json()
    assert result["catalogId"] == "2"
    assert result["status"] == "approved"
    assert result["routeSetupDone"] is False
    assert result["anchorPoints"] == []
    assert client.get("/routes").json()["points"] == []
    assert client.get("/station").json() is None
    assert client.get("/schedules").json() == []
    assert db.scalar(select(Route)).is_active is False
    assert client.get("/park-change-requests").json()[0]["status"] == "approved"


def test_reject_and_cancel_leave_current_configuration_untouched(setup_client):
    client, _ = setup_client
    choose(client)
    old = client.put("/route", json=config()).json()
    first = request_change(client)
    assert (
        client.post(
            f"/admin/park-change-requests/{first['id']}/reject", headers=admin(), json={"reason": " "}
        ).status_code
        == 422
    )
    response = client.post(
        f"/admin/park-change-requests/{first['id']}/reject",
        headers=admin(),
        json={"reason": "다른 공원을 선택해 주세요"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "rejected"
    assert client.get("/route").json() == old
    second = request_change(client)
    assert client.post(f"/park-change-requests/{second['id']}/cancel").status_code == 200
    assert client.get("/route").json() == old
    assert (
        client.post(f"/admin/park-change-requests/{second['id']}/approve", headers=admin(), json={}).status_code == 409
    )


def test_conflict_and_working_robot_block_approval_without_changes(setup_client):
    client, db = setup_client
    park = choose(client)
    req = request_change(client)
    other = Park(user_id=2, catalog_id=2, status="approved", approved_by=10, approved_at=datetime.now(UTC))
    db.add(other)
    db.commit()
    response = client.post(f"/admin/park-change-requests/{req['id']}/approve", headers=admin(), json={})
    assert response.status_code == 409
    assert client.get("/park").json()["catalogId"] == "1"
    assert client.get("/admin/park-change-requests", headers=admin()).json()[0]["conflictingManagerName"] is not None
    other.status, other.approved_by, other.approved_at = "pending", None, None
    db.add(
        Robot(
            name="작업 중",
            serial_no="busy-change",
            park_id=int(park["id"]),
            assigned_at=datetime.now(UTC),
            status="working",
        )
    )
    db.commit()
    assert client.post(f"/admin/park-change-requests/{req['id']}/approve", headers=admin(), json={}).status_code == 409
    assert client.get("/park-change-requests").json()[0]["status"] == "pending"


def test_admin_robot_assignment_keeps_other_robot_route_and_blocks_busy(setup_client):
    client, db = setup_client
    park = choose(client)
    now = datetime.now(UTC)
    for rid in (1, 2):
        db.add(Robot(id=rid, name=f"로봇 {rid}", serial_no=f"ops-{rid}", park_id=int(park["id"]), assigned_at=now))
    target = Park(user_id=2, catalog_id=2, status="approved", approved_by=10, approved_at=now)
    db.add(target)
    db.commit()
    assert client.put("/route?robotId=1", json=config()).status_code == 200
    other_config = client.put("/route?robotId=2", json=config()).json()
    rid = client.get("/routes?robotId=1").json()["id"]
    response = client.patch("/admin/robots/1/assignment", headers=admin(), json={"parkId": str(target.id)})
    assert response.status_code == 200, response.text
    assert response.json()["parkId"] == str(target.id)
    assert db.get(Route, int(rid)).is_active is False
    assert client.get("/route?robotId=2").json() == other_config
    assert db.scalar(select(Schedule).where(Schedule.robot_id == 1)) is None
    assert client.get("/robots/1").status_code == 404
    db.get(Robot, 1).status = "working"
    db.commit()
    assert client.patch("/admin/robots/1/assignment", headers=admin(), json={"parkId": None}).status_code == 409


def test_reports_and_admin_data_are_authorized_and_filter_by_physical_park(setup_client):
    from app.models.operations import DailyReport

    client, db = setup_client
    park = choose(client)
    db.add(
        DailyReport(
            park_id=int(park["id"]),
            catalog_id=1,
            date=date(2026, 11, 17),
            summary="기록된 일일 보고",
            payload={"pickups": 4, "materials": [{"material": "can", "count": 4}]},
        )
    )
    db.commit()
    assert client.get("/admin/parks").status_code == 403
    assert client.get("/admin/park-change-requests").status_code == 403
    assert client.patch("/admin/robots/999/assignment", json={"parkId": None}).status_code == 403
    parks = client.get("/admin/parks", headers=admin()).json()
    assert parks[0]["managerId"] == "1"
    report_path = f"/admin/parks/{park['id']}/reports"
    result = client.get(report_path, headers=admin(), params={"date": "2026-11-17"}).json()
    assert result[0]["pickups"] == 4
    assert result[0]["summary"] == "기록된 일일 보고"
    assert client.get(report_path, headers=admin(), params={"date": "2026-11-16"}).json() == []
    req = request_change(client)
    assert client.post(f"/admin/park-change-requests/{req['id']}/approve", headers=admin(), json={}).status_code == 200
    assert client.get(report_path, headers=admin(), params={"date": "2026-11-17"}).json() == []


def test_pre_approval_editor_and_report_identity_cannot_cross_park_change(setup_client):
    client, _ = setup_client
    park = choose(client)
    previous = client.put("/route", json=config()).json()
    request = request_change(client)
    assert (
        client.post(f"/admin/park-change-requests/{request['id']}/approve", headers=admin(), json={}).status_code == 200
    )
    stale = config() | {"catalogId": "1"}
    response = client.put("/route", json=stale)
    assert response.status_code == 409, response.text
    assert response.json()["code"] == "park_changed"
    assert client.put("/route", json=config()).status_code == 409
    assert client.put("/schedules?catalogId=1", json=previous["schedule"]).status_code == 409
    assert client.put("/station?catalogId=1", json=config()["station"]).status_code == 409
    assert client.get(f"/admin/parks/{park['id']}/reports?catalogId=1", headers=admin()).status_code == 409
    assert client.put("/route", json=config() | {"catalogId": "2"}).status_code == 200


def test_change_validation_and_request_ownership(setup_client):
    client, db = setup_client
    choose(client)
    for body in (
        {"catalogId": "1", "reason": "동일"},
        {"catalogId": "2", "reason": " "},
        {"catalogId": "2", "reason": "A" * 201},
        {"catalogId": "9223372036854775808", "reason": "범위"},
    ):
        assert client.post("/park-change-requests", json=body).status_code == 422
    request = request_change(client)
    other = Park(user_id=2, catalog_id=2, status="approved", approved_by=10, approved_at=datetime.now(UTC))
    db.add(other)
    db.commit()
    token, _ = create_access_token(2)
    other_headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/park-change-requests", headers=other_headers).json() == []
    assert client.post(f"/park-change-requests/{request['id']}/cancel", headers=other_headers).status_code == 404
    assert client.post(f"/admin/park-change-requests/{request['id']}/approve", json={}).status_code == 403
    assert client.get("/park-change-requests").json()[0]["status"] == "pending"


def test_change_approval_preserves_all_assigned_robots(setup_client):
    client, db = setup_client
    park = choose(client)
    for rid in (1, 2):
        db.add(
            Robot(
                id=rid, name=f"A{rid}", serial_no=f"keep-{rid}", park_id=int(park["id"]), assigned_at=datetime.now(UTC)
            )
        )
    db.commit()
    for rid in (1, 2):
        assert client.put(f"/route?robotId={rid}", json=config()).status_code == 200
    request = request_change(client)
    response = client.post(f"/admin/park-change-requests/{request['id']}/approve", headers=admin(), json={})
    assert response.status_code == 200, response.text
    assert [r["id"] for r in client.get("/robots").json()] == ["1", "2"]
    for rid in (1, 2):
        assert client.get(f"/routes?robotId={rid}").json()["points"] == []
        assert client.get(f"/schedules?robotId={rid}").json() == []
