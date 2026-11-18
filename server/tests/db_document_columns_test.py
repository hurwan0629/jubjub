"""현재 DB 문서에 명시된 공원 기준점과 로봇 측정 컬럼을 검증해요."""

import importlib.util
import os
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, select, text

from app.core.db import Base
from app.models import Park, Robot
from tests import patrol_fixtures
from tests.patrol_fixtures import choose

setup_client = patrol_fixtures.setup_client


def test_document_columns_store_anchors_and_nullable_robot_telemetry(setup_client):
    client, db = setup_client
    park = choose(client)
    anchors = [{"name": "분리수거장", "lat": 37.5, "lng": 127, "slam_x": 0.0, "slam_y": 0.0}]
    record = db.get(Park, int(park["id"]))
    record.anchor_points = anchors
    now = datetime.now(UTC)
    db.add(
        Robot(
            id=1,
            name="A",
            serial_no="doc-A",
            park_id=record.id,
            assigned_at=now,
            status="emptying",
            slam_x=12.5,
            slam_y=-3.0,
            lat=37.501,
            lng=127.001,
            battery_voltage=11.8,
            last_seen_at=now,
        )
    )
    db.add(Robot(id=2, name="B", serial_no="doc-B"))
    db.commit()
    db.expire_all()
    assert db.get(Park, record.id).anchor_points == anchors
    assert client.get("/park").json()["anchorPoints"] == anchors
    result = client.get("/robots").json()[0]
    assert result["status"] == "emptying"
    assert result["slamX"] == 12.5
    assert result["slamY"] == -3.0
    assert result["lat"] == 37.501
    assert result["lng"] == 127.001
    assert abs(result["batteryVoltage"] - 11.8) < 0.001
    assert result["lastSeenAt"] is not None
    unassigned = db.get(Robot, 2)
    assert unassigned.battery_voltage is None
    assert unassigned.last_seen_at is None
    assert unassigned.lat is None


def test_existing_park_defaults_to_empty_anchor_list(setup_client):
    client, db = setup_client
    choose(client)
    assert db.scalar(select(Park)).anchor_points == []
    assert client.get("/park").json()["anchorPoints"] == []


def test_changing_park_clears_only_previous_park_anchors(setup_client):
    from app.models import User
    from app.schemas.patrol import ParkSelection
    from app.services.patrol import select_park

    _, db = setup_client
    park = db.scalar(select(Park))
    anchors = [{"name": "A", "lat": 37.5, "lng": 127, "slam_x": 1, "slam_y": 2}]
    park.anchor_points = anchors
    db.commit()
    user = db.get(User, 1)
    unchanged = select_park(db, user, ParkSelection(catalog_id="1"))
    assert unchanged.anchor_points == anchors
    changed = select_park(db, user, ParkSelection(catalog_id="2"))
    assert changed.anchor_points == []
    assert db.get(Park, park.id).anchor_points == []


@pytest.mark.skipif(os.environ.get("JUBJUB_MIGRATION_TEST") != "1", reason="Explicit PostgreSQL rollback test only")
def test_document_migration_on_postgresql():
    from app.core.config import get_settings

    path = Path(__file__).parents[1] / "alembic/versions/20261117_0006_document_columns.py"
    spec = importlib.util.spec_from_file_location("document_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    engine = create_engine(get_settings().database_url, connect_args={"connect_timeout": 10, "prepare_threshold": None})
    schema = "document_test_" + uuid4().hex
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                connection.execute(text(f"CREATE SCHEMA {schema}"))
                connection.execute(text(f"SET LOCAL search_path TO {schema}"))
                connection.execute(text("CREATE TABLE parks (id bigint PRIMARY KEY)"))
                connection.execute(
                    text(
                        "CREATE TABLE robots (id bigint PRIMARY KEY, status text, CONSTRAINT ck_robots_robot_status CHECK (status IN ('idle','working','charging','offline','error')))"
                    )
                )
                connection.execute(text("INSERT INTO parks VALUES (1)"))
                connection.execute(text("INSERT INTO robots VALUES (1, 'idle')"))
                context = MigrationContext.configure(connection, opts={"target_metadata": Base.metadata})
                with Operations.context(context):
                    module.upgrade()
                assert connection.execute(text("SELECT anchor_points FROM parks")).scalar() == []
                assert connection.execute(text("SELECT battery_voltage FROM robots")).scalar() is None
                connection.execute(text("UPDATE robots SET status='emptying', slam_x=2.5, battery_voltage=11.8"))
                assert connection.execute(text("SELECT slam_x FROM robots")).scalar() == 2.5
                with (
                    pytest.raises(Exception, match="Cannot downgrade while"),
                    connection.begin_nested(),
                    Operations.context(context),
                ):
                    module.downgrade()
                connection.execute(text("UPDATE robots SET status='idle'"))
                with Operations.context(context):
                    module.downgrade()
                assert connection.execute(text("SELECT * FROM parks")).all() == [(1,)]
                assert connection.execute(text("SELECT * FROM robots")).all() == [(1, "idle")]
            finally:
                transaction.rollback()
    finally:
        engine.dispose()
