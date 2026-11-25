"""순찰 설정의 저장·검증·계정 분리와 이력 보존을 검증해요."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.core.db import Base, get_db
from app.core.security import create_access_token
from app.main import app
from app.models import ParkCatalogEntry, User


@pytest.fixture
def setup_client(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "patrol-test-secret-at-least-thirty-two-bytes")
    get_settings.cache_clear()
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        for i in (1, 2):
            db.add(
                ParkCatalogEntry(
                    id=i,
                    source_key=f"test:{i}",
                    dataset="test",
                    name=f"공원{i}",
                    address="서울",
                    center_lat=37.5,
                    center_lng=127,
                    bounds={
                        "southWest": {"latitude": 37.4, "longitude": 126.9},
                        "northEast": {"latitude": 37.6, "longitude": 127.1},
                    },
                    area={
                        "outer": [
                            {"latitude": a, "longitude": b}
                            for a, b in [(37.4, 126.9), (37.4, 127.1), (37.6, 127.1), (37.6, 126.9), (37.4, 126.9)]
                        ],
                        "holes": [
                            [
                                {"latitude": a, "longitude": b}
                                for a, b in [
                                    (37.54, 127.04),
                                    (37.54, 127.05),
                                    (37.55, 127.05),
                                    (37.55, 127.04),
                                    (37.54, 127.04),
                                ]
                            ]
                        ],
                    },
                    source_url="https://www.openstreetmap.org/",
                    source_license="ODbL-1.0",
                    is_active=True,
                )
            )
        db.commit()
        app.dependency_overrides[get_db] = lambda: db
        with TestClient(app) as client:
            response = client.post("/auth/register", json=registration())
            assert response.status_code == 201, response.text
            assert response.json()["id"] == "1"
            db.add(
                User(
                    id=2,
                    login_id="admin2",
                    password_hash="unused",
                    name="Other manager",
                    phone="01012345678",
                    email="2@example.com",
                )
            )
            db.add(
                User(
                    id=10,
                    login_id="superadmin",
                    password_hash="unused",
                    name="Super admin",
                    phone="01012345678",
                    email="super@example.com",
                    role="super_admin",
                )
            )
            db.commit()
            token, _ = create_access_token(1)
            client.headers["Authorization"] = f"Bearer {token}"
            yield client, db
    app.dependency_overrides.clear()
    engine.dispose()
    get_settings.cache_clear()


def config():
    return {
        "station": {"latitude": 37.5, "longitude": 127},
        "points": [
            {"id": "local-1", "name": " 잔디광장 ", "position": {"latitude": 37.501, "longitude": 127.001}},
            {"id": "local-2", "name": "벤치", "position": {"latitude": 37.502, "longitude": 127.002}},
        ],
        "schedule": [{"id": "local-1", "time": "10:00", "label": "오전 순찰", "on": True, "repeat": "weekdays"}],
    }


def registration(catalog="1", login="admin1"):
    return {
        "loginId": login,
        "password": "ExamplePass123!",
        "name": "Manager",
        "phone": "01012345678",
        "email": f"{login}@example.com",
        "catalogId": catalog,
    }


def choose(client, catalog="1"):
    token, _ = create_access_token(10)
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post("/admin/registrations/1/approve", headers=headers, json={})
    assert response.status_code == 200, response.text
    response = client.get("/park")
    assert response.status_code == 200, response.text
    assert response.json()["catalogId"] == catalog
    return response.json()
