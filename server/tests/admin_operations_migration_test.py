"""실제 PostgreSQL의 새 운영 테이블·중복 신청 제약을 롤백 환경에서 검증해요."""

import importlib.util
import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from app.core.db import Base


@pytest.mark.skipif(os.environ.get("JUBJUB_MIGRATION_TEST") != "1", reason="Explicit PostgreSQL rollback test only")
def test_admin_operations_migration_preserves_existing_and_guards_pending():
    from app.core.config import get_settings

    path = Path(__file__).parents[1] / "alembic/versions/20261117_0007_admin_operations.py"
    spec = importlib.util.spec_from_file_location("admin_operations_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    engine = create_engine(get_settings().database_url, connect_args={"connect_timeout": 10, "prepare_threshold": None})
    schema = "operations_test_" + uuid4().hex
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                connection.execute(text(f"CREATE SCHEMA {schema}"))
                connection.execute(text(f"SET LOCAL search_path TO {schema}"))
                for table in ["users", "parks", "park_catalog_entries"]:
                    connection.execute(text(f"CREATE TABLE {table} (id bigint PRIMARY KEY)"))
                    connection.execute(text(f"INSERT INTO {table} VALUES (1),(2)"))
                context = MigrationContext.configure(connection, opts={"target_metadata": Base.metadata})
                with Operations.context(context):
                    module.upgrade()
                query = "INSERT INTO park_change_requests (park_id,user_id,from_catalog_id,to_catalog_id,reason) VALUES (1,1,1,2,'change')"
                connection.execute(text(query))
                with pytest.raises(IntegrityError), connection.begin_nested():
                    connection.execute(text(query))
                connection.execute(text("UPDATE park_change_requests SET status='cancelled'"))
                connection.execute(text(query))
                connection.execute(
                    text(
                        "INSERT INTO daily_reports (park_id,catalog_id,date,summary) VALUES (1,1,'2026-11-17','report')"
                    )
                )
                assert connection.execute(text("SELECT payload FROM daily_reports")).scalar() == {}
                assert connection.execute(
                    text("SELECT relrowsecurity FROM pg_class WHERE oid='park_change_requests'::regclass")
                ).scalar()
                assert connection.execute(
                    text("SELECT relrowsecurity FROM pg_class WHERE oid='daily_reports'::regclass")
                ).scalar()
                with Operations.context(context):
                    module.downgrade()
                assert connection.execute(text("SELECT count(*) FROM parks")).scalar() == 2
                assert connection.execute(text("SELECT count(*) FROM users")).scalar() == 2
            finally:
                transaction.rollback()
    finally:
        engine.dispose()
