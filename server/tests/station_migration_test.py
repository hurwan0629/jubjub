"""Verify existing route coordinates survive the station registry migration."""

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
    path = Path(__file__).parents[1] / "alembic/versions/20261118_0012_recycling_stations.py"
    spec = importlib.util.spec_from_file_location("station_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_station_migration_sql():
    output = StringIO()
    with Operations.context(
        MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})
    ):
        migration().upgrade()
    sql = output.getvalue()
    assert "OVERRIDING SYSTEM VALUE" in sql
    assert "UPDATE routes SET default_station_id = station_id" in sql
    assert sql.count("ENABLE ROW LEVEL SECURITY") == 2


@pytest.mark.skipif(os.environ.get("JUBJUB_MIGRATION_TEST") != "1", reason="Explicit PostgreSQL rollback test only")
def test_station_backfill_preserves_route_snapshots():
    from app.core.config import get_settings

    engine = create_engine(get_settings().database_url, connect_args={"connect_timeout": 10, "prepare_threshold": None})
    schema = "stations_test_" + uuid4().hex
    try:
        with engine.connect() as c:
            transaction = c.begin()
            try:
                c.execute(text(f"CREATE SCHEMA {schema}"))
                c.execute(text(f"SET LOCAL search_path TO {schema}"))
                for name in ("parks", "robots"):
                    c.execute(text(f"CREATE TABLE {name} (id bigint PRIMARY KEY)"))
                    c.execute(text(f"INSERT INTO {name} VALUES (1), (2)"))
                c.execute(
                    text(
                        "CREATE TABLE points (id bigint PRIMARY KEY, park_id bigint, name text, type text, lat float, lng float, created_at timestamptz DEFAULT now(), deleted_at timestamptz)"
                    )
                )
                c.execute(
                    text(
                        "CREATE UNIQUE INDEX uq_points_live_station ON points(park_id) WHERE type='station' AND deleted_at IS NULL"
                    )
                )
                c.execute(
                    text(
                        "INSERT INTO points (id,park_id,name,type,lat,lng,deleted_at) VALUES (5,1,'station','station',37.5,127,NULL),(4,1,'old','station',37.4,127,now())"
                    )
                )
                c.execute(
                    text(
                        "CREATE TABLE routes (id bigint PRIMARY KEY, park_id bigint, robot_id bigint, station_id bigint, is_active bool)"
                    )
                )
                c.execute(text("INSERT INTO routes VALUES (1,1,1,5,true),(2,1,2,5,true),(3,1,1,4,false)"))
                with Operations.context(MigrationContext.configure(c)):
                    migration().upgrade()
                assert c.execute(text("SELECT default_station_id FROM routes ORDER BY id")).scalars().all() == [5, 5, 4]
                assert c.execute(text("SELECT count(*) FROM station_selections")).scalar() == 2
                assert c.execute(text("SELECT lat FROM points ORDER BY id")).scalars().all() == [37.4, 37.5]
                with Operations.context(MigrationContext.configure(c)):
                    migration().downgrade()
                assert c.execute(text("SELECT station_id FROM routes ORDER BY id")).scalars().all() == [5, 5, 4]
            finally:
                transaction.rollback()
    finally:
        engine.dispose()
