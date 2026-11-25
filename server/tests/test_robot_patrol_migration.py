"""마이그레이션 SQL 및 실제 PostgreSQL의 기존 데이터 이전을 검증해요."""

import importlib.util
import os
from io import StringIO
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text

from app.core.db import Base


def migration():
    path = Path(__file__).parents[1] / "alembic/versions/20261117_0005_robot_patrol.py"
    spec = importlib.util.spec_from_file_location("robot_patrol_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_robot_migration_sql():
    output = StringIO()
    context = MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})
    with Operations.context(context):
        migration().upgrade()
    sql = output.getvalue()
    assert "uq_routes_active_robot" in sql
    assert "uq_routes_active_draft" in sql
    assert "UNIQUE (park_id, robot_id, run_at, repeat)" in sql
    assert "INSERT INTO points" in sql
    assert "UPDATE schedules" in sql


@pytest.mark.skipif(os.environ.get("JUBJUB_MIGRATION_TEST") != "1", reason="Explicit PostgreSQL rollback test only")
def test_robot_migration_preserves_drafts_and_copies_independent_points():
    from app.core.config import get_settings

    engine = create_engine(get_settings().database_url, connect_args={"connect_timeout": 10, "prepare_threshold": None})
    schema = "patrol_test_" + uuid4().hex
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                connection.execute(text(f"CREATE SCHEMA {schema}"))
                connection.execute(text(f"SET LOCAL search_path TO {schema}"))
                # 실제 사용 중인 이전 스키마와 동일한 제약 이름으로 최소 데이터를 준비해요.
                for statement in [
                    "CREATE TABLE robots (id bigint PRIMARY KEY, park_id bigint)",
                    "CREATE TABLE points (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, park_id bigint, name text, type text, lat float8, lng float8, slam_x float8, slam_y float8, created_at timestamptz, deleted_at timestamptz)",
                    "CREATE TABLE routes (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, park_id bigint, station_id bigint, is_active bool, created_by bigint, created_at timestamptz, applied_at timestamptz)",
                    "CREATE UNIQUE INDEX uq_routes_active_park ON routes (park_id) WHERE is_active",
                    "CREATE TABLE route_points (route_id bigint, seq smallint, point_id bigint)",
                    "CREATE TABLE schedules (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, park_id bigint, run_at time, enabled bool, label text, repeat text, CONSTRAINT uq_schedules_park_id UNIQUE (park_id, run_at, repeat))",
                    "INSERT INTO robots VALUES (1, 1), (2, 1)",
                    "INSERT INTO points (park_id, name, type, lat, lng) VALUES (1, 'station', 'station', 37.5, 127), (1, 'A', 'patrol', 37.501, 127), (2, 'draft', 'patrol', 37.5, 127)",
                    "INSERT INTO routes (park_id, station_id, is_active) VALUES (1, 1, true), (2, 3, true)",
                    "INSERT INTO route_points VALUES (1, 0, 2), (2, 0, 3)",
                    "INSERT INTO schedules (park_id, run_at, enabled, label, repeat) VALUES (1, '10:00', true, 'daily', 'daily'), (2, '11:00', true, 'draft', 'daily')",
                ]:
                    connection.execute(text(statement))
                context = MigrationContext.configure(connection, opts={"target_metadata": Base.metadata})
                with Operations.context(context):
                    migration().upgrade()
                assert connection.execute(
                    text("SELECT robot_id FROM routes WHERE park_id=1 ORDER BY robot_id")
                ).scalars().all() == [1, 2]
                assert connection.execute(text("SELECT robot_id FROM routes WHERE park_id=2")).scalar() is None
                assert connection.execute(
                    text("SELECT robot_id FROM schedules WHERE park_id=1 ORDER BY robot_id")
                ).scalars().all() == [1, 2]
                ids = (
                    connection.execute(
                        text(
                            "SELECT rp.point_id FROM route_points rp JOIN routes r ON r.id=rp.route_id WHERE r.park_id=1"
                        )
                    )
                    .scalars()
                    .all()
                )
                assert len(ids) == len(set(ids)) == 2
                assert connection.execute(text("SELECT count(*) FROM points")).scalar() == 4
                # 여러 로봇의 설정을 잃는 자동 되돌리기는 거부해야 해요.
                with pytest.raises(Exception, match="Cannot downgrade multiple robot"), Operations.context(context):
                    migration().downgrade()
            finally:
                transaction.rollback()
    finally:
        engine.dispose()
