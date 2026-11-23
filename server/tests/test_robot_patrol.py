"""로봇별 경로 격리와 공용 분리수거장 변경의 원자성을 검증해요."""

from datetime import UTC, datetime

from sqlalchemy import select

from app.models import Park, Robot
from app.models.patrol import PatrolPoint, Route
from tests import patrol_fixtures
from tests.patrol_fixtures import choose, config

setup_client = patrol_fixtures.setup_client


def assign(db, park_id, *ids):
    for robot_id in ids:
        db.add(
            Robot(
                id=robot_id,
                name=f"로봇 {robot_id}",
                serial_no=f"robot-{robot_id}",
                park_id=park_id,
                assigned_at=datetime.now(UTC),
            )
        )
    db.commit()


def prepare(client, db):
    park = choose(client)
    assign(db, int(park["id"]), 1, 2)
    return park


def save(client, robot_id, body=None):
    path = f"/route?robotId={robot_id}" if robot_id else "/route"
    response = client.put(path, json=body or config())
    assert response.status_code == 200, response.text
    return response.json()


def test_robot_save_preserves_other_robot_points_and_schedules(setup_client):
    client, db = setup_client
    prepare(client, db)
    a = save(client, 1)
    a_ids = [int(p["id"]) for p in a["points"]]
    b_body = config()
    b_body["points"][0]["name"] = "B 지점"
    b_body["schedule"][0]["time"] = "11:00"
    save(client, 2, b_body)
    assert client.get("/route?robotId=1").json() == a
    assert all(db.get(PatrolPoint, point_id).deleted_at is None for point_id in a_ids)
    assert client.put("/schedules?robotId=2", json=[]).status_code == 200
    assert client.get("/route?robotId=1").json() == a
    assert db.scalar(select(Park)).route_setup_done
    save(client, 1)
    assert all(db.get(PatrolPoint, point_id).deleted_at is not None for point_id in a_ids)
    assert client.get("/routes?robotId=2").json()["points"][0]["name"] == "B 지점"


def test_multiple_robots_require_explicit_selection(setup_client):
    client, db = setup_client
    prepare(client, db)
    for path in ["/route", "/routes", "/schedules"]:
        response = client.get(path)
        assert response.status_code == 422, response.text
        assert response.json()["code"] == "robot_required"
    assert client.put("/route", json=config()).status_code == 422


def test_robot_scope_rejects_unassigned_foreign_missing_and_invalid_ids(setup_client):
    client, db = setup_client
    prepare(client, db)
    db.add(Robot(id=3, name="미배정", serial_no="unassigned"))
    other = Park(user_id=2, catalog_id=2)
    db.add(other)
    db.flush()
    assign(db, other.id, 4)
    db.commit()
    for robot_id in ["3", "4", "999", "0", "-1", "abc", "999999999999999999999999"]:
        for method, path, body in [("get", "/route", None), ("put", "/route", config()), ("put", "/schedules", [])]:
            kwargs = {"json": body} if method == "put" else {}
            response = getattr(client, method)(f"{path}?robotId={robot_id}", **kwargs)
            assert response.status_code in (404, 422), response.text
    assert client.get("/routes?robotId=1").json()["points"] == []


def test_station_move_versions_all_robots_and_preserves_old_history(setup_client):
    client, db = setup_client
    prepare(client, db)
    save(client, 1)
    save(client, 2)
    old_routes = list(db.scalars(select(Route).where(Route.is_active.is_(True))))
    old_points = list(db.scalars(select(PatrolPoint)))
    moved = {"latitude": 37.499, "longitude": 127}
    assert client.put("/station", json=moved).status_code == 200
    assert all(not db.get(Route, r.id).is_active for r in old_routes)
    assert all(r.default_station_id is not None for r in old_routes)
    assert old_points
    assert all(p.deleted_at is not None for p in old_points)
    for robot_id in (1, 2):
        result = client.get(f"/routes?robotId={robot_id}").json()
        assert result["robotId"] == str(robot_id)
        assert result["start"] == result["end"] == moved


def test_config_station_change_also_versions_other_robot(setup_client):
    client, db = setup_client
    prepare(client, db)
    save(client, 1)
    save(client, 2)
    old_b = client.get("/routes?robotId=2").json()
    body = config()
    body["station"]["latitude"] = 37.499
    save(client, 1, body)
    new_b = client.get("/routes?robotId=2").json()
    assert new_b["id"] != old_b["id"]
    assert new_b["start"] == body["station"]
    assert [p["name"] for p in new_b["points"]] == [p["name"] for p in old_b["points"]]


def test_station_move_rolls_back_if_any_robot_route_becomes_disconnected(setup_client):
    client, db = setup_client
    prepare(client, db)
    save(client, 1)
    b = config()
    b["points"] = [{"name": "남쪽", "position": {"latitude": 37.492, "longitude": 127}}]
    save(client, 2, b)
    before = [client.get(f"/routes?robotId={i}").json() for i in (1, 2)]
    response = client.put("/station", json={"latitude": 37.505, "longitude": 127})
    assert response.status_code == 422, response.text
    assert [client.get(f"/routes?robotId={i}").json() for i in (1, 2)] == before
    assert len(list(db.scalars(select(Route)))) == 2


def test_consumed_draft_cannot_block_assigned_robot_station_replacement(setup_client):
    from app.core.security import create_access_token

    client, db = setup_client
    choose(client)
    save(client, "")
    park = db.scalar(select(Park))
    park.status, park.reviewed_by, park.reviewed_at = "pending", None, None
    db.add(Robot(id=1, name="A", serial_no="A"))
    db.commit()
    token, _ = create_access_token(10)
    assert (
        client.post(
            "/admin/registrations/1/approve", headers={"Authorization": f"Bearer {token}"}, json={"robotIds": ["1"]}
        ).status_code
        == 200
    )
    body = config()
    body["station"]["latitude"] = 37.52
    body["points"] = [{"name": "북쪽", "position": {"latitude": 37.521, "longitude": 127}}]
    result = save(client, 1, body)
    assert result["station"] == body["station"]
    assert db.scalar(select(Route).where(Route.robot_id.is_(None), Route.is_active.is_(True))) is None


def test_station_move_ignores_robot_no_longer_assigned_to_park(setup_client):
    client, db = setup_client
    prepare(client, db)
    save(client, 1)
    b = config()
    b["points"] = [{"name": "남쪽", "position": {"latitude": 37.492, "longitude": 127}}]
    save(client, 2, b)
    robot = db.get(Robot, 2)
    robot.park_id, robot.assigned_at = None, None
    db.commit()
    moved = {"latitude": 37.505, "longitude": 127}
    response = client.put("/station", json=moved)
    assert response.status_code == 200, response.text
    assert client.get("/routes?robotId=1").json()["start"] == moved


def test_first_robot_approval_inherits_unassigned_draft(setup_client):
    from app.core.security import create_access_token

    client, db = setup_client
    choose(client)
    draft = save(client, "", config())
    admin_token, _ = create_access_token(10)
    headers = {"Authorization": f"Bearer {admin_token}"}
    assert client.post("/admin/registrations/1/revoke", headers=headers, json={"reason": "재배정"}).status_code == 200
    park = db.scalar(select(Park))
    park.status = "pending"
    park.reject_reason = None
    park.reviewed_by = park.reviewed_at = None
    db.commit()
    db.add(Robot(id=1, name="A", serial_no="A"))
    db.add(Robot(id=2, name="B", serial_no="B"))
    db.commit()
    response = client.post("/admin/registrations/1/approve", headers=headers, json={"robotIds": ["1", "2"]})
    assert response.status_code == 200, response.text
    for robot_id in (1, 2):
        result = client.get(f"/route?robotId={robot_id}").json()
        assert result["robotId"] == str(robot_id)
        assert [p["name"] for p in result["points"]] == [p["name"] for p in draft["points"]]
        assert result["schedule"][0]["time"] == "10:00"
    assert client.get("/route?robotId=1").json()["points"] != client.get("/route?robotId=2").json()["points"]
