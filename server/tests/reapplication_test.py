from datetime import UTC, datetime, time, timedelta

import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, signing_key
from app.models import Park, ParkCatalogEntry, ParkChangeRequest, RecyclingStation, Route, Schedule, User
from tests import registration_approval_test

BODY = registration_approval_test.BODY
registration_client = registration_approval_test.registration_client


def reject(client, engine):
    created = client.post("/auth/register", json=BODY).json()
    with Session(engine) as db:
        park = db.scalar(select(Park).where(Park.user_id == int(created["id"])))
        park.status = "rejected"
        park.reject_reason = "담당자 정보를 확인해 주세요"
        db.commit()
    return created


def test_reapplication_keeps_identity_and_requires_new_approval(registration_client):
    client, engine = registration_client
    created = reject(client, engine)
    credentials = {"loginId": BODY["loginId"], "password": BODY["password"]}
    session = client.post("/auth/reapplication-session", json=credentials)
    assert session.status_code == 200, session.text
    data = session.json()
    assert data["loginId"] == BODY["loginId"]
    assert data["park"]["id"] == BODY["catalogId"]
    assert data["rejectReason"] == "담당자 정보를 확인해 주세요"
    assert "password" not in data
    token = data["reapplicationToken"]
    assert client.get("/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    body = {k: v for k, v in BODY.items() if k != "loginId"}
    body.update(name="수정한 관리자", password="newpassword123", reapplicationToken=token)
    response = client.post("/auth/reapply", json=body)
    assert response.status_code == 200, response.text
    assert response.json()["id"] == created["id"]
    assert response.json()["registrationStatus"] == "pending"
    assert client.post("/auth/reapply", json=body).status_code == 409
    assert client.post("/auth/login", json=credentials).status_code == 401
    assert (
        client.post("/auth/login", json=credentials | {"password": "newpassword123"}).json()["code"]
        == "registration_pending"
    )
    with Session(engine) as db:
        park = db.scalar(select(Park).where(Park.user_id == int(created["id"])))
        assert park.reject_reason is None
        assert db.get(User, int(created["id"])).name == "수정한 관리자"
        park.status = "rejected"
        park.reject_reason = "재검토 필요"
        db.commit()
    assert client.post("/auth/reapply", json=body).status_code == 401


def test_reapplication_does_not_disclose_data_for_wrong_password_or_pending_account(registration_client):
    client, engine = registration_client
    reject(client, engine)
    response = client.post("/auth/reapplication-session", json={"loginId": BODY["loginId"], "password": "wrong"})
    assert response.status_code == 401
    assert "email" not in response.json()
    assert client.post("/auth/reapply", json={k: v for k, v in BODY.items() if k != "loginId"}).status_code == 422


def test_expired_wrong_scope_and_duplicate_email_leave_rejected_account_unchanged(registration_client):
    client, engine = registration_client
    created = reject(client, engine)
    session = client.post(
        "/auth/reapplication-session", json={"loginId": BODY["loginId"], "password": BODY["password"]}
    ).json()
    token = session["reapplicationToken"]
    body = {k: v for k, v in BODY.items() if k != "loginId"} | {"reapplicationToken": token}
    claims = jwt.decode(token, signing_key(), algorithms=["HS256"])
    claims["exp"] = datetime.now(UTC) - timedelta(seconds=1)
    expired = jwt.encode(claims, signing_key(), algorithm="HS256")
    assert client.post("/auth/reapply", json=body | {"reapplicationToken": expired}).status_code == 401
    access, _ = create_access_token(int(created["id"]))
    assert client.post("/auth/reapply", json=body | {"reapplicationToken": access}).status_code == 401
    assert client.post("/auth/reapply", json=body | {"loginId": "changed"}).status_code == 422
    assert client.post("/auth/reapply", json=body | {"catalogId": "9999999999999999999"}).status_code == 404
    assert client.post("/auth/reapply", json=body | {"email": "super@example.com"}).status_code == 409
    with Session(engine) as db:
        assert db.scalar(select(Park).where(Park.user_id == int(created["id"]))).status == "rejected"
        assert db.get(User, int(created["id"])).email == BODY["email"]
    assert client.post("/auth/reapply", json=body).status_code == 200
    assert (
        client.post(
            "/auth/reapplication-session", json={"loginId": BODY["loginId"], "password": BODY["password"]}
        ).status_code
        == 409
    )
    admin_token, _ = create_access_token(1)
    headers = {"Authorization": f"Bearer {admin_token}"}
    assert client.post(f"/admin/registrations/{created['id']}/approve", headers=headers, json={}).status_code == 200
    assert (
        client.post("/auth/login", json={"loginId": BODY["loginId"], "password": BODY["password"]}).status_code == 200
    )


def test_reapplication_to_different_park_clears_old_configuration(registration_client):
    client, engine = registration_client
    created = reject(client, engine)
    with Session(engine) as db:
        original = db.get(ParkCatalogEntry, 1)
        values = {column.name: getattr(original, column.name) for column in ParkCatalogEntry.__table__.columns}
        values.update(id=2, source_key="another", name="다른 공원")
        db.add(ParkCatalogEntry(**values))
        park = db.scalar(select(Park).where(Park.user_id == int(created["id"])))
        park.anchor_points = [{"lat": 37, "lng": 127}]
        station = RecyclingStation(park_id=park.id, name="이전 분리수거장", lat=37, lng=127)
        db.add(station)
        db.flush()
        route = Route(park_id=park.id, default_station_id=station.id, is_active=True)
        db.add(route)
        db.add(Schedule(park_id=park.id, run_at=time(10), label="이전 일정", repeat="daily"))
        change = ParkChangeRequest(
            park_id=park.id, user_id=int(created["id"]), from_catalog_id=1, to_catalog_id=2, reason="변경"
        )
        db.add(change)
        db.commit()
        park_id, route_id, station_id, change_id = park.id, route.id, station.id, change.id
    info = client.post(
        "/auth/reapplication-session", json={"loginId": BODY["loginId"], "password": BODY["password"]}
    ).json()
    body = {k: v for k, v in BODY.items() if k != "loginId"} | {
        "catalogId": "2",
        "reapplicationToken": info["reapplicationToken"],
    }
    response = client.post("/auth/reapply", json=body)
    assert response.status_code == 200, response.text
    with Session(engine) as db:
        assert db.get(Park, park_id).catalog_id == 2
        assert db.get(Park, park_id).anchor_points == []
        assert not db.get(Route, route_id).is_active
        assert db.get(RecyclingStation, station_id).deleted_at is not None
        assert db.scalar(select(Schedule).where(Schedule.park_id == park_id)) is None
        assert db.get(ParkChangeRequest, change_id).status == "cancelled"
