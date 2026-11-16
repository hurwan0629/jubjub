"""실제 SQLite ORM과 HTTP로 가입 신청부터 총관리자 승인·로그인을 검증해요."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.core.db import Base, get_db
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models import Park, User
from app.models.park_catalog import ParkCatalogEntry


@pytest.fixture
def registration_client(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "registration-test-secret-at-least-32-characters")
    get_settings.cache_clear()
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(
            ParkCatalogEntry(
                id=1,
                source_key="test",
                dataset="test",
                name="테스트 공원",
                address="서울",
                center_lat=37,
                center_lng=127,
                bounds={
                    "southWest": {"latitude": 36.99, "longitude": 126.99},
                    "northEast": {"latitude": 37.01, "longitude": 127.01},
                },
                area={
                    "outer": [
                        {"latitude": 36.99, "longitude": 126.99},
                        {"latitude": 37.01, "longitude": 126.99},
                        {"latitude": 37.01, "longitude": 127.01},
                        {"latitude": 36.99, "longitude": 127.01},
                    ]
                },
                source_url="test",
                source_license="test",
            )
        )
        db.add(
            User(
                id=1,
                login_id="superadmin",
                password_hash=hash_password("password123"),
                name="총관리자",
                phone="",
                email="super@example.com",
                role="super_admin",
            )
        )
        db.commit()

    def database():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = database
    with TestClient(app) as client:
        yield client, engine
    app.dependency_overrides.clear()
    engine.dispose()
    get_settings.cache_clear()


BODY = {
    "loginId": "manager01",
    "password": "password123",
    "name": "관리자",
    "phone": "01012345678",
    "email": "manager@example.com",
    "catalogId": "1",
}


def test_registration_search_and_atomic_submission(registration_client):
    client, engine = registration_client
    assert client.get("/parks", params={"query": "테스트"}).status_code == 200
    result = client.post("/auth/register", json=BODY)
    assert result.status_code == 201, result.text
    assert result.json()["registrationStatus"] == "pending"
    assert "accessToken" not in result.json()
    with Session(engine) as db:
        user = db.scalar(select(User).where(User.login_id == BODY["loginId"]))
        assert user.password_hash != BODY["password"]
        park = db.scalar(select(Park).where(Park.user_id == user.id))
        assert park.catalog_id == 1 and park.status == "pending"
    login = client.post("/auth/login", json=BODY | {})
    assert login.status_code == 403
    assert login.json()["code"] == "registration_pending"
    assert "accessToken" not in login.json()


def test_invalid_park_creates_no_account(registration_client):
    client, engine = registration_client
    assert client.post("/auth/register", json=BODY | {"catalogId": "999"}).status_code == 404
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(User).where(User.login_id == BODY["loginId"])) == 0
        assert db.scalar(select(func.count()).select_from(Park)) == 0
    assert client.post("/auth/register", json=BODY).status_code == 201
    assert client.post("/auth/register", json=BODY).status_code == 409


def test_superadmin_approves_membership_and_login_without_robot(registration_client):
    client, engine = registration_client
    created = client.post("/auth/register", json=BODY)
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]
    token = client.post("/auth/login", json={"loginId": "superadmin", "password": "password123"}).json()["accessToken"]
    headers = {"Authorization": f"Bearer {token}"}
    requests = client.get("/admin/registrations", headers=headers)
    assert requests.status_code == 200, requests.text
    assert requests.json()[0]["applicantEmail"] == BODY["email"]
    assert requests.json()[0]["name"] == "테스트 공원"
    approved = client.post(f"/admin/registrations/{user_id}/approve", headers=headers, json={})
    assert approved.status_code == 200, approved.text
    login = client.post("/auth/login", json={"loginId": BODY["loginId"], "password": BODY["password"]})
    assert login.status_code == 200, login.text
    assert login.json()["registrationStatus"] == "approved"
    assert login.json()["isFirstLogin"] is True
    manager_headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    assert client.get("/admin/registrations", headers=manager_headers).status_code == 403
    assert client.post(f"/admin/registrations/{user_id}/approve", headers=manager_headers, json={}).status_code == 403
    config = {
        "station": {"latitude": 37, "longitude": 127},
        "points": [{"name": "정문", "position": {"latitude": 37.0001, "longitude": 127}}],
        "schedule": [{"time": "10:00", "label": "매일 순찰", "on": True, "repeat": "daily"}],
    }
    saved = client.put("/route", json=config, headers=manager_headers)
    assert saved.status_code == 200, saved.text
    relogin = client.post("/auth/login", json={"loginId": BODY["loginId"], "password": BODY["password"]})
    assert relogin.json()["isFirstLogin"] is False
    assert client.get("/route", headers=manager_headers).json()["points"][0]["name"] == "정문"


def test_rejected_or_pending_users_cannot_use_existing_tokens(registration_client):
    client, engine = registration_client
    created = client.post("/auth/register", json=BODY)
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]
    token, _ = create_access_token(int(user_id))
    assert client.get("/me", headers={"Authorization": f"Bearer {token}"}).status_code == 403
    admin_token, _ = create_access_token(1)
    rejected = client.post(
        f"/admin/registrations/{user_id}/reject",
        json={"reason": "담당자 확인 필요"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert rejected.status_code == 200, rejected.text
    login = client.post("/auth/login", json={"loginId": BODY["loginId"], "password": BODY["password"]})
    assert login.status_code == 403
    assert login.json()["code"] == "registration_rejected"
    wrong_password = client.post("/auth/login", json={"loginId": BODY["loginId"], "password": "wrong"})
    assert wrong_password.status_code == 401
