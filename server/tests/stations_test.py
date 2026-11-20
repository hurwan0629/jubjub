"""실제 SQLite ORM과 HTTP로 분리수거장 여러 곳 관리 · 로봇별 분리수거장을 검증해요."""

from tests.robots_test import _admin_headers, _approved_manager, _register_robots

pytest_plugins = ["tests.registration_approval_test"]


def test_multi_station_management(registration_client):
    client, _ = registration_client
    ids = _register_robots(client, _admin_headers(client), ["Jubi 1", "Jubi 2"])
    headers, _ = _approved_manager(client, ids)

    # 처음 설정한 분리수거장이 기본이고, 로봇 둘 다 기본을 써요
    listed = client.get("/stations", headers=headers).json()
    assert len(listed) == 1 and listed[0]["primary"] is True
    assert [r["name"] for r in listed[0]["robots"]] == ["Jubi 1", "Jubi 2"]
    main_id = listed[0]["id"]

    assert (
        client.post(
            "/stations", headers=headers, json={"name": "밖", "position": {"latitude": 38, "longitude": 128}}
        ).json()["code"]
        == "point_outside_park"
    )
    north = client.post(
        "/stations",
        headers=headers,
        json={"name": "북문 분리수거장", "position": {"latitude": 37.0005, "longitude": 127}},
    )
    assert north.status_code == 201, north.text
    assert north.json()["primary"] is False and north.json()["robots"] == []
    north_id = north.json()["id"]

    renamed = client.patch(f"/stations/{north_id}", headers=headers, json={"name": "북문"})
    assert renamed.json()["name"] == "북문"
    moved = client.patch(
        f"/stations/{north_id}", headers=headers, json={"position": {"latitude": 37.0006, "longitude": 127.0001}}
    )
    assert moved.json()["position"] == {"latitude": 37.0006, "longitude": 127.0001}

    # 쓰는 로봇이 있으면 지울 수 없어요
    blocked = client.delete(f"/stations/{main_id}", headers=headers)
    assert blocked.status_code == 409 and blocked.json()["code"] == "station_in_use"
    assert [r["name"] for r in blocked.json()["details"]] == ["Jubi 1", "Jubi 2"]

    # 로봇 둘 다 북문으로 옮기면 기본 분리수거장을 지울 수 있고, 북문이 기본이 돼요
    for robot_id in ids:
        assert (
            client.put(f"/robots/{robot_id}/station", headers=headers, json={"stationId": north_id}).status_code == 200
        )
    after = client.delete(f"/stations/{main_id}", headers=headers)
    assert after.status_code == 200, after.text
    assert [(s["name"], s["primary"]) for s in after.json()] == [("북문", True)]
    assert client.get("/route", headers=headers).json()["station"] == {"latitude": 37.0006, "longitude": 127.0001}

    # 마지막 한 곳은 지울 수 없어요
    assert client.delete(f"/stations/{north_id}", headers=headers).json()["code"] == "last_station"
    assert client.put(f"/robots/{ids[0]}/station", headers=headers, json={"stationId": "999"}).status_code == 404


def test_saving_main_station_keeps_extra_stations(registration_client):
    client, _ = registration_client
    headers, _ = _approved_manager(client, [])
    extra = client.post(
        "/stations", headers=headers, json={"name": "동문", "position": {"latitude": 37.0004, "longitude": 127.0002}}
    ).json()
    # 순찰 설정에서 기본 분리수거장 위치를 바꿔도 다른 분리수거장은 남아요
    saved = client.put("/station", headers=headers, json={"latitude": 37.0001, "longitude": 127.0001})
    assert saved.status_code == 200, saved.text
    names = {s["name"]: s["primary"] for s in client.get("/stations", headers=headers).json()}
    assert names == {"분리수거장": True, "동문": False}
    assert extra["id"] in [s["id"] for s in client.get("/stations", headers=headers).json()]
