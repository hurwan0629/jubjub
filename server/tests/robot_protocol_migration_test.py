"""공용 테이블을 바꾸지 않고 격리 스키마에서 이관과 복구를 검증해요."""

import importlib.util
import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from app.models import Base, Robot


def migration():
    path = Path(__file__).parents[1] / "alembic/versions/20261123_0015_robot_protocol.py"
    spec = importlib.util.spec_from_file_location("robot_protocol_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.skipif(os.environ.get("JUBJUB_MIGRATION_TEST") != "1", reason="Explicit isolated PostgreSQL test only")
def test_postgres_protocol_migration_preserves_states_and_roundtrips():
    from app.core.config import get_settings

    engine = create_engine(get_settings().database_url, connect_args={"connect_timeout": 5, "prepare_threshold": None})
    schema = "protocol_test_" + uuid4().hex
    try:
        with engine.connect() as c, c.begin() as transaction:
            c.execute(text(f'CREATE SCHEMA "{schema}"'))
            c.execute(text(f'SET LOCAL search_path TO "{schema}"'))
            tables = inspect(c).get_table_names(schema="public")
            for table in tables:
                c.execute(text(f'CREATE TABLE "{table}" (LIKE public."{table}" INCLUDING ALL)'))
                c.execute(text(f'INSERT INTO "{table}" OVERRIDING SYSTEM VALUE SELECT * FROM public."{table}"'))
            # 복사본의 외부 키도 복사본만 참조하게 해요. public은 수정하지 않아요.
            quote = c.dialect.identifier_preparer.quote
            for table in tables:
                # LIKE가 자동으로 바꾸는 UNIQUE 이름을 원본과 맞춰요.
                copied_unique = inspect(c).get_unique_constraints(table)
                for constraint in inspect(c).get_unique_constraints(table, schema="public"):
                    copied = next(item for item in copied_unique if item["column_names"] == constraint["column_names"])
                    if copied["name"] != constraint["name"]:
                        c.execute(
                            text(
                                f"ALTER TABLE {quote(table)} RENAME CONSTRAINT {quote(copied['name'])} TO {quote(constraint['name'])}"
                            )
                        )
                for fk in inspect(c).get_foreign_keys(table, schema="public"):
                    columns = ",".join(quote(name) for name in fk["constrained_columns"])
                    targets = ",".join(quote(name) for name in fk["referred_columns"])
                    ddl = (
                        f"ALTER TABLE {quote(table)} ADD CONSTRAINT {quote(fk['name'])} "
                        f"FOREIGN KEY ({columns}) REFERENCES {quote(fk['referred_table'])} ({targets})"
                    )
                    if fk["options"].get("ondelete"):
                        ddl += " ON DELETE " + fk["options"]["ondelete"]
                    c.execute(text(ddl))
            if "robot_states" in tables:
                # 운영 DB에 적용된 뒤에도 기존 스키마를 재현해 검증할 수 있어요.
                task_index = next(
                    item
                    for item in inspect(c).get_indexes("detections")
                    if item["column_names"] == ["task_id"] and not item["unique"]
                )
                c.execute(
                    text(f"ALTER INDEX {quote(schema)}.{quote(task_index['name'])} RENAME TO ix_detections_task_id")
                )
                with Operations.context(MigrationContext.configure(c)):
                    migration().downgrade()
            before = c.execute(
                text("SELECT id,status,slam_x,slam_y,lat,lng,battery_voltage,last_seen_at FROM robots ORDER BY id")
            ).all()
            context = MigrationContext.configure(c, opts={"target_metadata": Base.metadata})
            with Operations.context(context):
                migration().upgrade()
            after = c.execute(
                text(
                    "SELECT robot_id,status,slam_x,slam_y,lat,lng,battery_voltage,last_seen_at FROM robot_states ORDER BY robot_id"
                )
            ).all()
            assert before == after
            assert "status" not in {column["name"] for column in inspect(c).get_columns("robots")}
            with Session(c) as db:
                robots = list(db.scalars(select(Robot)))
                assert len(robots) == len(before)
                assert all(robot.state is not None for robot in robots)
            # Alembic 버전 테이블은 자동 비교에서 제외돼요.
            diffs = compare_metadata(context, Base.metadata)
            assert not [d for d in diffs if isinstance(d, list)]
            assert (
                c.execute(
                    text(
                        "SELECT count(*) FROM pg_class WHERE relnamespace=current_schema()::regnamespace AND relname IN ('robot_states','robot_errors','robot_task_points','robot_message_receipts') AND relrowsecurity"
                    )
                ).scalar()
                == 4
            )
            robot_id = before[0][0]
            c.execute(
                text(
                    "INSERT INTO robot_message_receipts (robot_id,message_id,message_type) VALUES (:id,'one','hello')"
                ),
                {"id": robot_id},
            )
            with pytest.raises(DBAPIError, match="Cannot downgrade"), c.begin_nested(), Operations.context(context):
                migration().downgrade()
            with pytest.raises(IntegrityError), c.begin_nested():
                c.execute(
                    text(
                        "INSERT INTO robot_message_receipts (robot_id,message_id,message_type) VALUES (:id,'one','hello')"
                    ),
                    {"id": robot_id},
                )
            c.execute(text("DELETE FROM robot_message_receipts"))
            with Operations.context(context):
                migration().downgrade()
            assert (
                c.execute(
                    text("SELECT id,status,slam_x,slam_y,lat,lng,battery_voltage,last_seen_at FROM robots ORDER BY id")
                ).all()
                == before
            )
            transaction.rollback()
    finally:
        engine.dispose()
