"""배정 요청 마이그레이션과 실제 PostgreSQL 제약을 검증해요."""

import importlib.util
import os
from io import StringIO
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from app.core.db import Base


def migration():
    path = Path(__file__).parents[1] / "alembic/versions/20261118_0010_robot_assignment_requests.py"
    spec = importlib.util.spec_from_file_location("robot_assignment_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_assignment_migration_sql():
    output = StringIO()
    context = MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})
    with Operations.context(context):
        migration().upgrade()
    sql = output.getvalue()
    assert "CREATE UNIQUE INDEX uq_robot_assignment_requests_pending" in sql
    assert "WHERE status = 'pending'" in sql
    assert sql.count("ENABLE ROW LEVEL SECURITY") == 2
    assert "FOREIGN KEY(robot_id) REFERENCES robots (id)" in sql


@pytest.mark.skipif(os.environ.get("JUBJUB_MIGRATION_TEST") != "1", reason="Explicit PostgreSQL rollback test only")
def test_assignment_migration_guards_pending_and_review_metadata():
    from app.core.config import get_settings

    engine = create_engine(get_settings().database_url, connect_args={"connect_timeout": 10, "prepare_threshold": None})
    schema = "assignment_test_" + uuid4().hex
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                connection.execute(text(f"CREATE SCHEMA {schema}"))
                connection.execute(text(f"SET LOCAL search_path TO {schema}"))
                for name in ("users", "parks", "park_catalog_entries", "robots"):
                    connection.execute(text(f"CREATE TABLE {name} (id bigint PRIMARY KEY)"))
                    connection.execute(text(f"INSERT INTO {name} VALUES (1), (2)"))
                context = MigrationContext.configure(connection, opts={"target_metadata": Base.metadata})
                with Operations.context(context):
                    migration().upgrade()
                query = (
                    "INSERT INTO robot_assignment_requests (user_id,park_id,catalog_id,robot_count) VALUES (1,1,1,1)"
                )
                connection.execute(text(query))
                with pytest.raises(IntegrityError), connection.begin_nested():
                    connection.execute(text(query))
                for invalid in (
                    "UPDATE robot_assignment_requests SET robot_count=0",
                    "UPDATE robot_assignment_requests SET status='approved'",
                    "UPDATE robot_assignment_requests SET status='rejected',reviewed_by=2,reviewed_at=now()",
                    "INSERT INTO robot_assignment_request_robots VALUES (1,999)",
                ):
                    with pytest.raises(IntegrityError), connection.begin_nested():
                        connection.execute(text(invalid))
                connection.execute(
                    text("UPDATE robot_assignment_requests SET status='approved',reviewed_by=2,reviewed_at=now()")
                )
                connection.execute(text("INSERT INTO robot_assignment_request_robots VALUES (1,1)"))
                connection.execute(text(query))
                for name in ("robot_assignment_requests", "robot_assignment_request_robots"):
                    assert connection.execute(
                        text("SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass(:name)"), {"name": name}
                    ).scalar()
                with Operations.context(context):
                    migration().downgrade()
                assert connection.execute(text("SELECT to_regclass('robot_assignment_requests')")).scalar() is None
                assert connection.execute(text("SELECT count(*) FROM robots")).scalar() == 2
            finally:
                transaction.rollback()
    finally:
        engine.dispose()
