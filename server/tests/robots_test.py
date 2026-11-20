"""실제 SQLite ORM과 HTTP로 로봇 목록·이름 변경·순찰 멈춤/다시 시작·로봇 배정 요청을 검증해요."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Robot
from tests.registration_approval_test import BODY

# registration_approval_test의 registration_client 픽스처를 그대로 써요 (테스트 공원 + 총관리자)
pytest_plugins = ["tests.registration_approval_test"]

CONFIG = {
    "station": {"latitude": 37, "longitude": 127},
    "points": [
        {"name": "정문", "position": {"latitude": 37.0001, "longitude": 127}},
        {"name": "잔디광장", "position": {"latitude": 37.0002, "longitude": 127}},
    ],
    "schedule": [{"time": "10:00", "label": "매일 순찰", "on": True, "repeat": "daily"}],
}


def _approved_manager(client, robot_ids: list[str]):
    """관리자를 가입·승인하고 (관리자 헤더, 총관리자 헤더)를 돌려줘요."""
    user_id = client.post("/auth/register", json=BODY).json()["id"]
    admin = client.post("/auth/login", json={"loginId": "superadmin", "password": "password123"}).json()
    admin_headers = {"Authorization": f"Bearer {admin['accessToken']}"}
    approved = client.post(
        f"/admin/registrations/{user_id}/approve", headers=admin_headers, json={"robotIds": robot_ids}
    )
    assert approved.status_code == 200, approved.text
    login = client.post("/auth/login", json={"loginId": BODY["loginId"], "password": BODY["password"]}).json()
    headers = {"Authorization": f"Bearer {login['accessToken']}"}
    assert client.put("/route", json=CONFIG, headers=headers).status_code == 200
    return headers, admin_headers


def _register_robots(client, admin_headers, names: list[str]) -> list[str]:
    ids = []
    for index, name in enumerate(names):
        created = client.post("/admin/robots", headers=admin_headers, json={"name": name, "serialNo": f"SN-{index}"})
        assert created.status_code == 201, created.text
        ids.append(created.json()["id"])
    return ids


def _admin_headers(client):
    admin = client.post("/auth/login", json={"loginId": "superadmin", "password": "password123"}).json()
    return {"Authorization": f"Bearer {admin['accessToken']}"}


def test_robot_list_rename_and_patrol_control(registration_client):
    client, engine = registration_client
    ids = _register_robots(client, _admin_headers(client), ["Jubi 1", "Jubi 2"])
    headers, _ = _approved_manager(client, ids)

    # 로봇 1은 순찰 중, 로봇 2는 분리수거장에서 대기 중이라고 가정해요 (로봇 브리지가 채우는 값)
    with Session(engine) as db:
        first, second = db.scalars(select(Robot).order_by(Robot.id)).all()
        first.status, first.patrol_state, first.battery, first.next_point = "working", "patrolling", 72, "공연장 앞"
        second.status, second.battery = "idle", 40
        db.commit()

    listed = client.get("/robots", headers=headers)
    assert listed.status_code == 200, listed.text
    robots = listed.json()
    assert [r["state"] for r in robots] == ["patrolling", "idle"]
    assert robots[0]["battery"] == 72 and robots[0]["nextPoint"] == "공연장 앞"
    assert robots[0]["routePointCount"] == 2 and robots[0]["patrolsPerDay"] == 1
    assert robots[0]["nextPatrolAt"] == "10:00"

    # 이름 변경: 10자 이내 · 공원 안에서 겹치지 않게
    assert client.patch(f"/robots/{ids[0]}", headers=headers, json={"name": "Jubi 2"}).json()["code"] == (
        "robot_name_taken"
    )
    assert (
        client.patch(f"/robots/{ids[0]}", headers=headers, json={"name": "열한글자가넘는로봇이름"}).status_code == 422
    )
    renamed = client.patch(f"/robots/{ids[0]}", headers=headers, json={"name": "줍줍이"})
    assert renamed.status_code == 200 and renamed.json()["name"] == "줍줍이"

    # 그 자리에서 멈추기 → 다시 시작
    paused = client.post(f"/robots/{ids[0]}/pause", headers=headers, json={"mode": "stay"})
    assert paused.status_code == 200, paused.text
    assert paused.json()["state"] == "paused" and paused.json()["pausedAt"]
    again = client.post(f"/robots/{ids[0]}/pause", headers=headers, json={"mode": "stay"})
    assert again.json()["code"] == "robot_not_patrolling"
    resumed = client.post(f"/robots/{ids[0]}/resume", headers=headers)
    assert resumed.json()["state"] == "patrolling" and resumed.json()["pausedAt"] is None

    # 이번 순찰 끝내고 돌아가기 → 가는 길에 그 자리에서 멈추기
    returning = client.post(f"/robots/{ids[0]}/pause", headers=headers, json={"mode": "return"})
    assert returning.json()["state"] == "returning"
    assert client.post(f"/robots/{ids[0]}/pause", headers=headers, json={"mode": "stay"}).json()["state"] == "paused"

    # 대기 중인 로봇은 지금 바로 순찰을 시작해요
    started = client.post(f"/robots/{ids[1]}/resume", headers=headers)
    assert started.json()["state"] == "patrolling"

    # 다른 공원 로봇은 건드릴 수 없어요
    assert client.post("/robots/999/resume", headers=headers).status_code == 404


def test_robot_request_lifecycle(registration_client):
    client, _ = registration_client
    headers, admin_headers = _approved_manager(client, [])
    assert client.get("/robots", headers=headers).json() == []
    assert client.get("/robot-requests/current", headers=headers).json() is None

    assert client.post("/robot-requests", headers=headers, json={"count": 6}).status_code == 422
    created = client.post("/robot-requests", headers=headers, json={"count": 1, "memo": "입구가 두 군데예요"})
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "pending" and created.json()["memo"] == "입구가 두 군데예요"
    assert client.post("/robot-requests", headers=headers, json={"count": 2}).json()["code"] == "robot_request_exists"
    assert client.get("/robot-requests/current", headers=headers).json()["id"] == created.json()["id"]

    listed = client.get("/admin/robot-requests", headers=admin_headers)
    assert listed.status_code == 200 and listed.json()[0]["parkName"] == "테스트 공원"
    assert client.get("/admin/robot-requests", headers=headers).status_code == 403

    canceled = client.post(f"/robot-requests/{created.json()['id']}/cancel", headers=headers)
    assert canceled.json()["status"] == "canceled"
    assert client.get("/robot-requests/current", headers=headers).json() is None
    # 취소한 뒤에는 다시 요청할 수 있어요
    assert client.post("/robot-requests", headers=headers, json={"count": 2}).status_code == 201
