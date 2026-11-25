import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from app.models import Base


def test_telemetry_tables_are_registered():
    assert {"detections", "robot_tasks", "notifications", "push_tokens"} <= Base.metadata.tables.keys()


@pytest.mark.parametrize(
    "values",
    [
        "'patrol', NULL, 'schedule', NULL, NULL",
        "'patrol', 1, NULL, NULL, NULL",
        "'station_move', 1, NULL, NULL, NULL",
        "'station_move', NULL, NULL, NULL, 'success'",
        "'station_move', NULL, NULL, '2020-01-01', 'success'",
    ],
)
def test_invalid_task_metadata_is_rejected(values):
    engine = create_engine("sqlite://")
    try:
        Base.metadata.create_all(engine)
        with engine.begin() as connection, pytest.raises(IntegrityError):
            connection.execute(
                text(
                    "INSERT INTO robot_tasks (park_id, robot_id, task_type, route_id, trigger, ended_at, result) "
                    f"VALUES (1, 1, {values})"
                )
            )
    finally:
        engine.dispose()


def test_push_token_is_unique_across_users_and_platforms():
    engine = create_engine("sqlite://")
    try:
        Base.metadata.create_all(engine)
        with engine.begin() as connection:
            connection.execute(text("INSERT INTO push_tokens (user_id, token, platform) VALUES (1, 'device', 'ios')"))
            with pytest.raises(IntegrityError):
                connection.execute(
                    text("INSERT INTO push_tokens (user_id, token, platform) VALUES (2, 'device', 'android')")
                )
    finally:
        engine.dispose()
