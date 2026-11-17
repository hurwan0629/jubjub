"""담당 로봇의 이름 변경 권한과 설정 보존을 검증해요."""

from datetime import UTC, datetime

import pytest

from app.models import Park, Robot
from tests import patrol_fixtures
from tests.patrol_fixtures import choose, config

setup_client = patrol_fixtures.setup_client


def robot_pair(client, db):
    park = choose(client)
    now = datetime.now(UTC)
    for rid in (1, 2):
        db.add(Robot(id=rid, name=f"로봇 {rid}", serial_no=f"rename-{rid}", park_id=int(park["id"]), assigned_at=now))
    db.commit()


def test_rename_changes_only_selected_robot_and_keeps_route(setup_client):
    client, db = setup_client
    robot_pair(client, db)
    saved = client.put("/route?robotId=1", json=config()).json()
    response = client.patch("/robots/1", json={"name": "  주비 1호  "})
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "주비 1호"
    assert client.get("/robots/1").json()["name"] == "주비 1호"
    assert client.get("/robots/2").json()["name"] == "로봇 2"
    assert client.get("/route?robotId=1").json() == saved


@pytest.mark.parametrize("name", ["", "   ", "A" * 101])
def test_invalid_robot_name_is_rejected(setup_client, name):
    client, db = setup_client
    robot_pair(client, db)
    assert client.patch("/robots/1", json={"name": name}).status_code == 422
    assert db.get(Robot, 1).name == "로봇 1"


def test_cannot_read_or_rename_foreign_or_unassigned_robot(setup_client):
    client, db = setup_client
    robot_pair(client, db)
    other = Park(user_id=2, catalog_id=2)
    db.add(other)
    db.flush()
    db.add(Robot(id=3, name="다른 공원", serial_no="foreign", park_id=other.id, assigned_at=datetime.now(UTC)))
    db.add(Robot(id=4, name="미배정", serial_no="unassigned"))
    db.commit()
    for rid in (3, 4, 999):
        assert client.get(f"/robots/{rid}").status_code == 404
        assert client.patch(f"/robots/{rid}", json={"name": "변경"}).status_code == 404
    assert db.get(Robot, 3).name == "다른 공원"


def test_rename_requires_authentication(client):
    assert client.patch("/robots/1", json={"name": "변경"}).status_code == 401
