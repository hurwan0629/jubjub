"""현재 DB 명세 이전 SQL과 PostgreSQL 데이터 보존을 검증해요."""

import importlib.util
import os
from io import StringIO
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text


def migration():
    path = Path(__file__).parents[1] / "alembic/versions/20261119_0013_align_current_db.py"
    spec = importlib.util.spec_from_file_location("current_db_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_current_db_upgrade_sql():
    output = StringIO()
    with Operations.context(
        MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})
    ):
        migration().upgrade()
    sql = output.getvalue()
    assert "RENAME approved_by TO reviewed_by" in sql
    assert "RENAME approved_at TO reviewed_at" in sql
    assert "DROP COLUMN station_id" in sql
    assert "DROP COLUMN type" in sql
    assert "ALTER COLUMN default_station_id SET NOT NULL" in sql
    assert "UPDATE robots SET status = 'idle' WHERE status = 'charging'" in sql


@pytest.mark.skipif(os.environ.get("JUBJUB_MIGRATION_TEST") != "1", reason="Explicit PostgreSQL rollback test only")
def test_current_db_migration_preserves_station_mapping_and_review_history():
    from app.core.config import get_settings

    engine = create_engine(get_settings().database_url, connect_args={"connect_timeout": 10, "prepare_threshold": None})
    schema = "alignment_test_" + uuid4().hex
    try:
        with engine.connect() as c, c.begin() as transaction:
            c.execute(text(f"CREATE SCHEMA {schema}"))
            c.execute(text(f"SET LOCAL search_path TO {schema}"))
            statements = [
                "CREATE TABLE users (id bigint PRIMARY KEY)",
                "INSERT INTO users VALUES (10)",
                "CREATE TABLE parks (id bigint PRIMARY KEY, status text, approved_by bigint REFERENCES users(id), approved_at timestamptz, reject_reason text, CONSTRAINT ck_parks_park_review_metadata CHECK (true))",
                "INSERT INTO parks VALUES (1,'approved',10,'2026-11-18Z',NULL),(2,'rejected',NULL,NULL,'legacy'),(3,'pending',NULL,NULL,NULL)",
                "ALTER TABLE parks RENAME CONSTRAINT parks_approved_by_fkey TO fk_parks_approved_by_users",
                "CREATE TABLE robots (id bigint PRIMARY KEY, status text, CONSTRAINT ck_robots_robot_status CHECK (status IN ('charging','idle','offline')))",
                "INSERT INTO robots VALUES (1,'charging')",
                "CREATE TABLE points (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, park_id bigint REFERENCES parks(id), name text, type text, lat float8, lng float8, created_at timestamptz DEFAULT now(), deleted_at timestamptz, CONSTRAINT ck_points_point_type CHECK (type IN ('patrol','station','charger','bin')))",
                "INSERT INTO points (id,park_id,name,type,lat,lng,deleted_at) OVERRIDING SYSTEM VALUE VALUES (5,1,'live','station',37.5,127,NULL),(6,1,'snapshot','station',37.5,127,NULL),(7,1,'old','station',37.4,127,now()),(8,1,'P','patrol',37.501,127,NULL)",
                "SELECT setval(pg_get_serial_sequence('points','id'),8)",
                "CREATE TABLE recycling_stations (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, park_id bigint REFERENCES parks(id), name text, lat float8, lng float8, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz)",
                "CREATE UNIQUE INDEX uq_recycling_stations_live_position ON recycling_stations(park_id,lat,lng) WHERE deleted_at IS NULL",
                # 같은 ID가 다른 장소일 수 있어 ID만으로 이전하지 않는지 검증해요.
                "INSERT INTO recycling_stations (id,park_id,name,lat,lng) OVERRIDING SYSTEM VALUE VALUES (5,1,'other',37.6,127),(20,1,'registered',37.5,127)",
                "CREATE TABLE routes (id bigint PRIMARY KEY, park_id bigint REFERENCES parks(id), robot_id bigint, station_id bigint NOT NULL, default_station_id bigint REFERENCES recycling_stations(id), is_active bool, CONSTRAINT fk_routes_station_id_points FOREIGN KEY (station_id) REFERENCES points(id))",
                "INSERT INTO routes VALUES (1,1,1,5,NULL,true),(2,1,NULL,6,NULL,true),(3,1,1,7,NULL,false),(4,1,2,6,5,true)",
                "CREATE TABLE route_points (route_id bigint REFERENCES routes(id), point_id bigint REFERENCES points(id))",
                "INSERT INTO route_points VALUES (1,8),(3,8)",
                "CREATE TABLE station_selections (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, park_id bigint REFERENCES parks(id), robot_id bigint, station_id bigint REFERENCES recycling_stations(id))",
                "INSERT INTO station_selections (park_id,robot_id,station_id) VALUES (1,2,5)",
            ]
            for statement in statements:
                c.execute(text(statement))
            with Operations.context(MigrationContext.configure(c)):
                migration().upgrade()
            refs = c.execute(text("SELECT default_station_id FROM routes ORDER BY id")).scalars().all()
            assert refs[:2] == [20, 20]
            assert refs[3] == 5
            assert c.execute(text("SELECT lat FROM recycling_stations WHERE id=:id"), {"id": refs[2]}).scalar() == 37.4
            assert c.execute(
                text("SELECT deleted_at IS NOT NULL FROM recycling_stations WHERE id=:id"), {"id": refs[2]}
            ).scalar()
            assert c.execute(text("SELECT id FROM points")).scalars().all() == [8]
            assert c.execute(text("SELECT count(*) FROM route_points")).scalar() == 2
            assert c.execute(text("SELECT status FROM robots")).scalar() == "idle"
            assert c.execute(text("SELECT reviewed_by FROM parks WHERE id=1")).scalar() == 10
            assert c.execute(text("SELECT reviewed_by FROM parks WHERE id=2")).scalar() is None
            assert c.execute(text("SELECT count(*) FROM station_selections")).scalar() == 3
            c.execute(text("UPDATE parks SET reviewed_by=10,reviewed_at=now() WHERE id=2"))
            with (
                pytest.raises(Exception, match="Cannot downgrade while rejected park review metadata exists"),
                c.begin_nested(),
                Operations.context(MigrationContext.configure(c)),
            ):
                migration().downgrade()
            assert c.execute(text("SELECT reviewed_by FROM parks WHERE id=2")).scalar() == 10
            c.execute(text("UPDATE parks SET reviewed_by=NULL,reviewed_at=NULL WHERE id=2"))
            with Operations.context(MigrationContext.configure(c)):
                migration().downgrade()
            assert c.execute(text("SELECT approved_by FROM parks WHERE id=2")).scalar() is None
            assert (
                c.execute(
                    text("SELECT count(*) FROM routes r JOIN points p ON p.id=r.station_id WHERE p.type='station'")
                ).scalar()
                == 4
            )
            transaction.rollback()
    finally:
        engine.dispose()
