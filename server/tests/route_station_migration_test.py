"""중복 선택 제거와 경로 참조 보존을 검증해요."""

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
    path = Path(__file__).parents[1] / "alembic/versions/20261120_0014_route_station_source.py"
    spec = importlib.util.spec_from_file_location("route_station_source", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_upgrade_checks_selections_before_dropping_table():
    output = StringIO()
    with Operations.context(
        MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})
    ):
        migration().upgrade()
    sql = output.getvalue()
    assert "LOCK TABLE" in sql
    assert "IS NOT DISTINCT FROM" in sql
    assert sql.index("RAISE EXCEPTION") < sql.index("DROP TABLE station_selections")
    assert "DROP TABLE routes" not in sql
    assert "UPDATE routes" not in sql


@pytest.mark.skipif(os.environ.get("JUBJUB_MIGRATION_TEST") != "1", reason="Explicit PostgreSQL rollback test only")
@pytest.mark.parametrize("conflict", [None, "different", "without_route", "deleted"])
def test_postgres_migration_preserves_routes_and_rejects_unmapped_selections(conflict):
    from app.core.config import get_settings

    engine = create_engine(get_settings().database_url, connect_args={"connect_timeout": 10, "prepare_threshold": None})
    schema = "route_station_test_" + uuid4().hex
    try:
        with engine.connect() as c, c.begin() as transaction:
            c.execute(text(f"CREATE SCHEMA {schema}"))
            c.execute(text(f"SET LOCAL search_path TO {schema}"))
            for statement in [
                "CREATE TABLE parks (id bigint PRIMARY KEY)",
                "CREATE TABLE robots (id bigint PRIMARY KEY)",
                "INSERT INTO parks VALUES (1)",
                "INSERT INTO robots VALUES (2)",
                "CREATE TABLE recycling_stations (id bigint PRIMARY KEY, park_id bigint, deleted_at timestamptz)",
                "INSERT INTO recycling_stations VALUES (10,1,NULL),(11,1,NULL)",
                "CREATE TABLE routes (id bigint PRIMARY KEY, park_id bigint, robot_id bigint, default_station_id bigint, is_active boolean)",
                "INSERT INTO routes VALUES (1,1,2,10,true),(2,1,NULL,11,true),(3,1,2,11,false)",
                "CREATE TABLE station_selections (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, park_id bigint REFERENCES parks(id), robot_id bigint REFERENCES robots(id), station_id bigint REFERENCES recycling_stations(id))",
                "INSERT INTO station_selections (park_id, robot_id, station_id) VALUES (1,2,10),(1,NULL,11)",
            ]:
                c.execute(text(statement))
            if conflict == "different":
                c.execute(text("UPDATE station_selections SET station_id=11 WHERE robot_id=2"))
            elif conflict == "without_route":
                c.execute(text("DELETE FROM routes WHERE robot_id IS NULL"))
            elif conflict == "deleted":
                c.execute(text("UPDATE recycling_stations SET deleted_at=now() WHERE id=10"))
            before = c.execute(text("SELECT * FROM routes ORDER BY id")).all()
            if conflict:
                with (
                    pytest.raises(Exception, match="Resolve station selections"),
                    c.begin_nested(),
                    Operations.context(MigrationContext.configure(c)),
                ):
                    migration().upgrade()
                assert c.execute(text("SELECT count(*) FROM station_selections")).scalar() == 2
            else:
                with Operations.context(MigrationContext.configure(c)):
                    migration().upgrade()
                assert c.execute(text("SELECT to_regclass('station_selections')")).scalar() is None
                with Operations.context(MigrationContext.configure(c)):
                    migration().downgrade()
                assert c.execute(
                    text("SELECT station_id FROM station_selections ORDER BY station_id")
                ).scalars().all() == [10, 11]
            assert c.execute(text("SELECT * FROM routes ORDER BY id")).all() == before
            transaction.rollback()
    finally:
        engine.dispose()
