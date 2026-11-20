"""실제 SQLite ORM과 HTTP로 공원 변경 요청 · 알림 · 운영 설정 · 알림 설정을 검증해요."""

from sqlalchemy.orm import Session

from app.models import Park, ParkCatalogEntry, Route
from app.services.manager import create_notification
from tests.registration_approval_test import BODY
from tests.robots_test import _approved_manager

pytest_plugins = ["tests.registration_approval_test"]

AREA = {
    "outer": [
        {"latitude": 37.09, "longitude": 127.09},
        {"latitude": 37.11, "longitude": 127.09},
        {"latitude": 37.11, "longitude": 127.11},
        {"latitude": 37.09, "longitude": 127.11},
    ]
}


def _add_catalog(engine, id: int, name: str):
    with Session(engine) as db:
        db.add(
            ParkCatalogEntry(
                id=id,
                source_key=f"test-{id}",
                dataset="test",
                name=name,
                address="서울 마포구",
                center_lat=37.1,
                center_lng=127.1,
                bounds={
                    "southWest": {"latitude": 37.09, "longitude": 127.09},
                    "northEast": {"latitude": 37.11, "longitude": 127.11},
                },
                area=AREA,
                source_url="test",
                source_license="test",
            )
        )
        db.commit()


def test_park_change_reject_creates_notification(registration_client):
    client, engine = registration_client
    headers, admin_headers = _approved_manager(client, [])
    _add_catalog(engine, 2, "난지한강공원")

    # 공원 검색: 지금 공원은 담당 관리자가 있다고 보여요
    found = client.get("/parks", params={"query": "공원"}).json()
    assert {p["name"]: p["hasManager"] for p in found} == {"테스트 공원": True, "난지한강공원": False}

    assert client.post("/park-change-requests", headers=headers, json={"catalogId": "1"}).json()["code"] == "same_park"
    created = client.post("/park-change-requests", headers=headers, json={"catalogId": "2", "memo": "12월부터"})
    assert created.status_code == 201, created.text
    assert created.json()["fromPark"] == "테스트 공원" and created.json()["toPark"] == "난지한강공원"
    again = client.post("/park-change-requests", headers=headers, json={"catalogId": "2"})
    assert again.json()["code"] == "park_change_exists"
    assert client.get("/park-change-requests/current", headers=headers).json()["status"] == "pending"

    request_id = created.json()["id"]
    assert client.get("/admin/park-change-requests", headers=admin_headers).json()[0]["applicantName"] == "관리자"
    rejected = client.post(
        f"/admin/park-change-requests/{request_id}/reject",
        headers=admin_headers,
        json={"reasonKind": "이미 담당 관리자가 있는 공원이에요", "reason": "다른 공원으로 다시 요청해 주세요."},
    )
    assert rejected.status_code == 200, rejected.text
    assert client.get("/park-change-requests/current", headers=headers).json() is None

    # 반려 알림이 생겨요
    items = client.get("/notifications", headers=headers).json()
    assert items[0]["type"] == "parkChange" and items[0]["status"] == "new" and items[0]["time"] == "방금"
    detail = client.get(f"/notifications/{items[0]['id']}", headers=headers).json()
    assert detail["parkChange"]["result"] == "rejected"
    assert detail["parkChange"]["requestedPark"] == "난지한강공원"
    assert detail["parkChange"]["reasonKind"] == "이미 담당 관리자가 있는 공원이에요"
    assert client.post(f"/notifications/{items[0]['id']}/ack", headers=headers).json()["status"] == "acked"


def test_park_change_approve_moves_park_and_resets_route(registration_client):
    client, engine = registration_client
    headers, admin_headers = _approved_manager(client, [])
    _add_catalog(engine, 2, "난지한강공원")
    request_id = client.post("/park-change-requests", headers=headers, json={"catalogId": "2"}).json()["id"]

    approved = client.post(f"/admin/park-change-requests/{request_id}/approve", headers=admin_headers)
    assert approved.status_code == 200, approved.text
    assert client.get("/park", headers=headers).json()["name"] == "난지한강공원"
    with Session(engine) as db:
        park = db.query(Park).one()
        assert park.route_setup_done is False
        assert db.query(Route).filter(Route.park_id == park.id, Route.is_active.is_(True)).count() == 0
    login = client.post("/auth/login", json={"loginId": BODY["loginId"], "password": BODY["password"]}).json()
    assert login["isFirstLogin"] is True
    assert client.get("/notifications", headers=headers).json()[0]["title"] == "공원 변경이 승인됐어요"


def test_unpickable_resolve_and_recheck(registration_client):
    client, engine = registration_client
    headers, _ = _approved_manager(client, [])
    with Session(engine) as db:
        park_id = db.query(Park).one().id
        first = create_notification(
            db,
            park_id,
            "unpickable",
            "깨진 유리를 발견했어요",
            "벤치 쉼터",
            note="직접 처리가 필요해요",
            payload={"photoUrl": "/photos/1.jpg", "detection": {"label": "유리", "confidence": 91}},
        )
        second = create_notification(db, park_id, "unpickable", "캔을 발견했어요", "정문")
        error = create_notification(db, park_id, "robotError", "로봇이 움직이지 못하고 있어요", "벤치 쉼터 근처")
        db.commit()
        first_id, second_id, error_id = first.id, second.id, error.id

    assert len(client.get("/notifications", params={"type": "unpickable"}, headers=headers).json()) == 2
    detail = client.get(f"/notifications/{first_id}", headers=headers).json()
    assert detail["detection"] == {"label": "유리", "confidence": 91} and detail["photoUrl"] == "/photos/1.jpg"
    assert detail["happenedAt"].startswith("오늘") or detail["happenedAt"] == "방금"

    rechecked = client.post(f"/notifications/{first_id}/recheck", headers=headers).json()
    assert rechecked["status"] == "acked" and rechecked["recheck"]["queuePosition"] == 1
    resolved = client.post(f"/notifications/{second_id}/resolve", headers=headers).json()
    assert resolved["status"] == "resolved" and resolved["recheck"]["queuePosition"] == 2
    assert client.post(f"/notifications/{error_id}/recheck", headers=headers).json()["code"] == "recheck_not_supported"
    assert client.get("/notifications/9999", headers=headers).status_code == 404


def test_operation_and_notification_settings(registration_client):
    client, _ = registration_client
    headers, _ = _approved_manager(client, [])
    assert client.get("/settings/operation", headers=headers).json() == {
        "chargeAt": 20,
        "emptyAt": 80,
        "agentPaused": False,
    }
    saved = client.put(
        "/settings/operation", headers=headers, json={"chargeAt": 25, "emptyAt": 70, "agentPaused": True}
    )
    assert saved.json()["agentPaused"] is True
    assert (
        client.put(
            "/settings/operation", headers=headers, json={"chargeAt": 120, "emptyAt": 70, "agentPaused": True}
        ).status_code
        == 422
    )
    assert client.get("/settings/operation", headers=headers).json()["chargeAt"] == 25

    assert client.get("/settings/notifications", headers=headers).json() == {"unpickable": True, "dailyReport": True}
    patched = client.patch("/settings/notifications", headers=headers, json={"dailyReport": False})
    assert patched.json() == {"unpickable": True, "dailyReport": False}
