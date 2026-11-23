"""여러 분리수거장과 로봇별 선택·경로 이력 보존을 검증해요."""

from sqlalchemy import select

from app.models import Park, PatrolPoint, RecyclingStation, Robot, Route
from tests import patrol_fixtures
from tests.patrol_fixtures import choose, config
from tests.test_robot_patrol import assign

setup_client = patrol_fixtures.setup_client


def test_revoke_releases_station_references_but_keeps_route_history(setup_client):
    from tests.admin_operations_test import admin

    client, db = setup_client
    park = choose(client)
    assign(db, int(park["id"]), 1)
    item = station(client, "A")
    save(client, 1, item["id"])
    old_id = int(client.get("/routes?robotId=1").json()["id"])
    result = client.post("/admin/registrations/1/revoke", headers=admin(), json={"reason": "reassign"})
    assert result.status_code == 200, result.text
    assert db.get(Robot, 1).park_id is None
    assert not db.get(Route, old_id).is_active
    assert db.get(RecyclingStation, db.get(Route, old_id).default_station_id) is not None


def test_consumed_draft_default_does_not_block_station_deletion(setup_client):
    from tests.admin_operations_test import admin

    client, db = setup_client
    choose(client)
    a, b = station(client, "A"), station(client, "B", 37.501)
    save(client, None, a["id"])
    park = db.scalar(select(Park))
    park.status, park.reviewed_by, park.reviewed_at = "pending", None, None
    db.add(Robot(id=1, name="A", serial_no="A"))
    db.commit()
    assert client.post("/admin/registrations/1/approve", headers=admin(), json={"robotIds": ["1"]}).status_code == 200
    assert client.get("/route?robotId=1").json()["defaultStationId"] == a["id"]
    save(client, 1, b["id"])
    assert client.delete(f"/stations/{a['id']}").status_code == 204


def station(client, name, lat=37.5):
    response = client.post(
        "/stations", json={"name": name, "position": {"latitude": lat, "longitude": 127}, "catalogId": "1"}
    )
    assert response.status_code == 201, response.text
    return response.json()


def save(client, robot_id, station_id):
    body = config()
    del body["station"]
    body["defaultStationId"] = station_id
    body["catalogId"] = "1"
    response = client.put("/route" + (f"?robotId={robot_id}" if robot_id else ""), json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_multiple_stations_are_selected_per_robot_and_moving_one_preserves_other_route(setup_client):
    client, db = setup_client
    park = choose(client)
    assign(db, int(park["id"]), 1, 2)
    a, b = station(client, "남문"), station(client, "북문", 37.501)
    first, second = save(client, 1, a["id"]), save(client, 2, b["id"])
    assert first["defaultStationId"] == a["id"]
    assert second["defaultStationId"] == b["id"]
    assert len(first["stations"]) == 2
    before = client.get("/routes?robotId=1").json()
    old = db.get(Route, int(before["id"]))
    old_point_ids = [p.id for p in db.scalars(select(PatrolPoint))]
    moved = {"latitude": 37.499, "longitude": 127}
    response = client.patch(f"/stations/{a['id']}", json={"name": "남문 수정", "position": moved, "catalogId": "1"})
    assert response.status_code == 200, response.text
    assert response.json()["id"] == a["id"]
    assert client.get("/routes?robotId=1").json()["start"] == moved
    assert client.get("/routes?robotId=2").json()["start"] == b["position"]
    assert old.default_station_id == int(a["id"])
    assert all(db.get(PatrolPoint, pid).deleted_at is not None for pid in old_point_ids[:2])
    assert not db.get(Route, int(before["id"])).is_active


def test_selection_is_saved_only_with_route_and_in_use_station_cannot_be_deleted(setup_client):
    client, db = setup_client
    park = choose(client)
    assign(db, int(park["id"]), 1)
    a, b = station(client, "A"), station(client, "B", 37.501)
    before = client.get("/route?robotId=1")
    assert before.status_code == 200
    assert before.json()["defaultStationId"] is None
    assert before.json()["station"] is None
    assert client.get("/routes?robotId=1").json()["start"] is None
    assert client.get("/station?robotId=1").json() is None
    assert client.put("/robots/1/default-station", json={"stationId": a["id"]}).status_code == 404
    save(client, 1, a["id"])
    assert client.delete(f"/stations/{a['id']}?catalogId=1").status_code == 409
    save(client, 1, b["id"])
    assert client.get("/routes?robotId=1").json()["start"] == b["position"]
    assert client.get("/station?robotId=1").json() == b["position"]
    assert client.delete(f"/stations/{a['id']}?catalogId=1").status_code == 204
    assert [item["id"] for item in client.get("/stations").json()] == [b["id"]]
    assert "station_selections" not in db.get_bind().dialect.get_table_names(db.connection())


def test_single_registered_station_is_not_selected_until_route_saved(setup_client):
    client, _ = setup_client
    choose(client)
    a = station(client, "A")
    response = client.get("/route")
    assert response.status_code == 200
    assert response.json()["stations"] == [a]
    assert response.json()["station"] is None
    assert response.json()["defaultStationId"] is None
    assert client.get("/station").json() is None
    assert client.delete(f"/stations/{a['id']}").status_code == 204


def test_legacy_coordinate_api_is_rejected_when_multiple_stations_exist(setup_client):
    client, _ = setup_client
    choose(client)
    station(client, "A")
    station(client, "B", 37.501)
    assert client.put("/route", json=config()).status_code == 409
    assert client.put("/station", json=config()["station"]).status_code == 409
    assert len(client.get("/stations").json()) == 2


def test_station_scope_validation_and_atomic_route_validation(setup_client):
    client, db = setup_client
    park = choose(client)
    assign(db, int(park["id"]), 1)
    a = station(client, "A")
    save(client, 1, a["id"])
    before = client.get("/route?robotId=1").json()
    assert client.post("/stations", json={"name": "重複", "position": a["position"]}).status_code == 409
    assert (
        client.post("/stations", json={"name": "외부", "position": {"latitude": 0, "longitude": 0}}).status_code == 422
    )
    assert (
        client.post(
            "/stations", json={"name": "stale", "position": {"latitude": 37.502, "longitude": 127}, "catalogId": "2"}
        ).status_code
        == 409
    )
    response = client.patch(
        f"/stations/{a['id']}", json={"name": "멀리", "position": {"latitude": 37.59, "longitude": 127}}
    )
    assert response.status_code == 422
    assert client.get("/route?robotId=1").json() == before
    assert client.put("/robots/999/default-station", json={"stationId": a["id"]}).status_code == 404
    assert len(list(db.scalars(select(Route)))) == 1
