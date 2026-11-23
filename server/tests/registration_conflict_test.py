"""가입 승인 전에 공원 담당자 충돌을 알려 주는 계약을 검증해요."""

from sqlalchemy.orm import Session

from app.models import ParkCatalogEntry
from tests import registration_approval_test
from tests.registration_approval_test import BODY

registration_client = registration_approval_test.registration_client


def test_registration_list_explains_occupied_park_without_changing_approval(registration_client):
    client, _ = registration_client
    owner = client.post("/auth/register", json=BODY).json()["id"]
    token = client.post("/auth/login", json={"loginId": "superadmin", "password": "password123"}).json()["accessToken"]
    headers = {"Authorization": f"Bearer {token}"}
    pending = client.get("/admin/registrations", headers=headers).json()[0]
    assert pending["canApprove"] is True
    assert pending["approvalBlockReason"] is None
    assert client.post(f"/admin/registrations/{owner}/approve", headers=headers, json={}).status_code == 200
    applicant = client.post(
        "/auth/register", json={**BODY, "loginId": "manager02", "email": "manager02@example.com"}
    ).json()["id"]
    row = client.get("/admin/registrations", headers=headers).json()[0]
    assert row["userId"] == applicant
    assert row["canApprove"] is False
    assert row["conflictingManagerId"] == owner
    assert row["conflictingManagerLoginId"] == BODY["loginId"]
    assert BODY["loginId"] in row["approvalBlockReason"]
    response = client.post(f"/admin/registrations/{applicant}/approve", headers=headers, json={})
    assert response.status_code == 409
    assert response.json()["code"] == "park_already_approved"
    assert BODY["loginId"] in response.json()["message"]


def test_registration_list_explains_inactive_park(registration_client):
    client, engine = registration_client
    assert client.post("/auth/register", json=BODY).status_code == 201
    with Session(engine) as db:
        db.get(ParkCatalogEntry, 1).is_active = False
        db.commit()
    token = client.post("/auth/login", json={"loginId": "superadmin", "password": "password123"}).json()["accessToken"]
    row = client.get("/admin/registrations", headers={"Authorization": f"Bearer {token}"}).json()[0]
    assert row["canApprove"] is False
    assert row["approvalBlockReason"]
