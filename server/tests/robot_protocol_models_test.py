"""새 로봇 DB 설계의 상태 분리와 기록 제약을 검증해요."""

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Base, Robot


def test_robot_state_is_created_and_persisted_separately():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        robot = Robot(name="A", serial_no="protocol-a", status="returning", slam_x=2.5)
        db.add(robot)
        db.commit()
        robot_id = robot.id
        db.expire_all()
        assert db.get(Robot, robot_id).status == "returning"
        assert db.execute(text("SELECT status, slam_x FROM robot_states")).one() == ("returning", 2.5)
        assert "status" not in Robot.__table__.columns
        db.add(Robot(name="B", serial_no="protocol-b"))
        db.commit()
        assert (
            db.execute(text("SELECT status FROM robot_states WHERE robot_id != :id"), {"id": robot_id}).scalar()
            == "offline"
        )
    engine.dispose()


def test_protocol_tables_and_detection_fields_exist():
    assert {
        "robot_states",
        "robot_task_points",
        "robot_errors",
        "robot_message_receipts",
    } <= Base.metadata.tables.keys()
    assert {"task_id", "client_detection_id", "confidence", "pickup_fail_reason"} <= set(
        Base.metadata.tables["detections"].columns.keys()
    )


def test_pickup_failure_reason_requires_a_failed_result():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with engine.begin() as c, pytest.raises(IntegrityError):
        c.execute(
            text(
                "INSERT INTO detections (park_id,robot_id,task_id,client_detection_id,confidence,material,slam_x,slam_y,lat,lng,image_path,pickup_fail_reason) VALUES (1,1,1,'0123456789abcdef0123456789abcdef',0.9,'can',0,0,37,127,'test.jpg','blocked')"
            )
        )
    engine.dispose()


@pytest.mark.parametrize("result", ["completed", "stopped", "aborted", "missed"])
def test_new_task_results_are_accepted(result):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with engine.begin() as c:
        c.execute(
            text(
                "INSERT INTO robot_tasks (park_id,robot_id,task_type,started_at,ended_at,result) VALUES (1,1,'station_move','2026-11-20','2026-11-20',:result)"
            ),
            {"result": result},
        )
        with pytest.raises(IntegrityError), c.begin_nested():
            c.execute(text("UPDATE robot_tasks SET result='success'"))
    engine.dispose()
