"""확정된 DB 변경의 API 동작과 데이터 제약을 검증해요."""

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import Park, PatrolPoint, Robot, Route, RoutePoint
from tests import patrol_fixtures
from tests.admin_operations_test import admin
from tests.patrol_fixtures import choose, config

setup_client = patrol_fixtures.setup_client


def test_route_save_stores_only_patrol_points_and_station_reference(setup_client):
    client, db = setup_client
    choose(client)
    first = client.put("/route", json=config())
    assert first.status_code == 200, first.text
    assert len(list(db.scalars(select(PatrolPoint)))) == 2
    old = db.scalar(select(Route))
    old_ids = list(db.scalars(select(RoutePoint.point_id).where(RoutePoint.route_id == old.id)))
    second = client.put("/route", json=config())
    assert second.status_code == 200, second.text
    assert len(list(db.scalars(select(PatrolPoint)))) == 4
    assert all(db.get(PatrolPoint, value).deleted_at is not None for value in old_ids)
    assert not old.is_active
    assert second.json()["defaultStationId"] == first.json()["defaultStationId"]
    assert "type" not in PatrolPoint.__table__.columns
    assert "station_id" not in Route.__table__.columns


@pytest.mark.parametrize("action", ["approve", "reject"])
def test_park_review_response_and_storage_use_reviewed_metadata(setup_client, action):
    client, db = setup_client
    body = {} if action == "approve" else {"reason": "보완이 필요해요"}
    response = client.post(f"/admin/registrations/1/{action}", headers=admin(), json=body)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["reviewedBy"] == "10"
    assert result["reviewedAt"]
    assert "approvedBy" not in result
    assert "approvedAt" not in result
    park = db.scalar(select(Park))
    assert park.reviewed_by == 10
    assert park.reviewed_at is not None


def test_revocation_records_its_reviewer(setup_client):
    client, db = setup_client
    choose(client)
    response = client.post("/admin/registrations/1/revoke", headers=admin(), json={"reason": "승인을 취소해요"})
    assert response.status_code == 200, response.text
    assert response.json()["reviewedBy"] == "10"
    assert response.json()["reviewedAt"]
    assert db.scalar(select(Park)).reviewed_by == 10


def test_charging_is_rejected_by_database_and_api_contract(setup_client):
    from app.main import app

    _, db = setup_client
    db.add(Robot(name="A", serial_no="no-charging", status="charging"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    statuses = app.openapi()["components"]["schemas"]["RobotResponse"]["properties"]["status"]["enum"]
    # returning은 로봇이 중지·오류로 분리수거장에 돌아갈 때 보내요 (로봇-서버 통신 문서)
    assert set(statuses) == {"working", "returning", "emptying", "idle", "error", "offline"}
