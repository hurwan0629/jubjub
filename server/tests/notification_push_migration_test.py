"""푸시 대기열과 기존 토큰 보존을 PostgreSQL 롤백으로 검증해요."""

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
    path = Path(__file__).parents[1] / "alembic/versions/20261118_0011_notification_pushes.py"
    spec = importlib.util.spec_from_file_location("notification_push_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_push_migration_sql():
    output = StringIO()
    context = MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})
    with Operations.context(context):
        migration().upgrade()
    sql = output.getvalue()
    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "UNIQUE (notification_id, push_token_id)" in sql
    assert "ADD COLUMN is_active BOOLEAN DEFAULT true NOT NULL" in sql


@pytest.mark.skipif(os.environ.get("JUBJUB_MIGRATION_TEST") != "1", reason="Explicit PostgreSQL rollback test only")
def test_push_migration_preserves_tokens_and_guards_delivery_metadata():
    from app.core.config import get_settings

    engine = create_engine(get_settings().database_url, connect_args={"connect_timeout": 10, "prepare_threshold": None})
    schema = "notification_push_test_" + uuid4().hex
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                connection.execute(text(f"CREATE SCHEMA {schema}"))
                connection.execute(text(f"SET LOCAL search_path TO {schema}"))
                for name in ("notifications", "push_tokens"):
                    connection.execute(text(f"CREATE TABLE {name} (id bigint PRIMARY KEY)"))
                    connection.execute(text(f"INSERT INTO {name} VALUES (1), (2)"))
                context = MigrationContext.configure(connection, opts={"target_metadata": Base.metadata})
                with Operations.context(context):
                    migration().upgrade()
                assert connection.execute(text("SELECT bool_and(is_active) FROM push_tokens")).scalar()
                query = "INSERT INTO notification_push_deliveries (notification_id,push_token_id) VALUES (1,1)"
                connection.execute(text(query))
                for invalid in (
                    query,
                    "UPDATE notification_push_deliveries SET status='submitted'",
                    "UPDATE notification_push_deliveries SET attempts=-1",
                    "INSERT INTO notification_push_deliveries (notification_id,push_token_id) VALUES (999,1)",
                ):
                    with pytest.raises(IntegrityError), connection.begin_nested():
                        connection.execute(text(invalid))
                connection.execute(
                    text(
                        "UPDATE notification_push_deliveries SET status='submitted',ticket_id='ticket',submitted_at=now()"
                    )
                )
                assert connection.execute(
                    text("SELECT relrowsecurity FROM pg_class WHERE oid='notification_push_deliveries'::regclass")
                ).scalar()
                with Operations.context(context):
                    migration().downgrade()
                assert connection.execute(text("SELECT count(*) FROM push_tokens")).scalar() == 2
                assert connection.execute(text("SELECT to_regclass('notification_push_deliveries')")).scalar() is None
            finally:
                transaction.rollback()
    finally:
        engine.dispose()
