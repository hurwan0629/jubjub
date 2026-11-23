"""새 DB 계약과 로봇 통신의 실제 API 연결을 검증해요."""

import asyncio
import base64
import hashlib
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from io import BytesIO
from uuid import uuid4

import pytest
from PIL import Image
from sqlalchemy import select
from starlette.websockets import WebSocketDisconnect

from app.core.security import create_access_token
from app.models import (
    Detection,
    Notification,
    Park,
    Robot,
    RobotError,
    RobotMessageReceipt,
    RobotTask,
    RobotTaskPoint,
    User,
)
from tests import patrol_fixtures
from tests.patrol_fixtures import choose, config

setup_client = patrol_fixtures.setup_client


def prepare(client, db):
    park = choose(client)
    record = db.get(Park, int(park["id"]))
    record.anchor_points = [
        {"lat": 37.5, "lng": 127.0, "slam_x": 0.0, "slam_y": 0.0},
        {"lat": 37.501, "lng": 127.0, "slam_x": 0.0, "slam_y": 111.195},
    ]
    robot = Robot(name="A", serial_no="api-a", park_id=record.id, assigned_at=datetime.now(UTC))
    robot.auth_token_hash = hashlib.sha256(b"robot-test-token").hexdigest()
    db.add(robot)
    db.commit()
    response = client.put(f"/route?robotId={robot.id}", json=config())
    assert response.status_code == 200, response.text
    return robot


def message(kind, data):
    return {"type": kind, "message_id": str(uuid4()), "occurred_at": datetime.now(UTC).isoformat(), "data": data}


def test_returning_and_direction_are_exposed(setup_client):
    client, db = setup_client
    robot = prepare(client, db)
    robot.status = "returning"
    robot.state.slam_yaw = 1.25
    db.commit()
    response = client.get(f"/robots/{robot.id}")
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "returning"
    assert response.json()["slamYaw"] == 1.25


def test_registration_and_rotation_only_reveal_token_once(setup_client):
    client, db = setup_client
    token, _ = create_access_token(10)
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post("/admin/robots", json={"name": "A", "serialNo": "token-a"}, headers=headers)
    assert response.status_code == 201, response.text
    issued = response.json()
    assert len(issued["authToken"]) >= 32
    robot = db.get(Robot, int(issued["id"]))
    assert robot.auth_token_hash == hashlib.sha256(issued["authToken"].encode()).hexdigest()
    assert "authToken" not in client.get("/admin/robots", headers=headers).json()[0]
    assert client.post(f"/admin/robots/{robot.id}/token").status_code == 403
    rotated = client.post(f"/admin/robots/{robot.id}/token", headers=headers)
    assert rotated.status_code == 200, rotated.text
    assert rotated.json()["authToken"] != issued["authToken"]


def test_robot_websocket_hello_and_disconnect(setup_client):
    client, db = setup_client
    robot = prepare(client, db)
    with client.websocket_connect(
        "/ws/robots", headers={"X-Robot-Id": str(robot.id), "Authorization": "Bearer robot-test-token"}
    ) as ws:
        ws.send_json(
            message(
                "hello",
                {
                    "state": "idle",
                    "patrol_id": None,
                    "position": {"x": 1.0, "y": 2.0, "yaw": 0.5},
                    "battery_voltage": 11.4,
                    "pending_count": 0,
                },
            )
        )
        ack = ws.receive_json()
        assert ack["type"] == "ack" and ack["data"]["result"] == "ok"
        db.expire_all()
        assert db.get(Robot, robot.id).status == "idle"
        assert db.get(Robot, robot.id).state.slam_yaw == 0.5
    db.expire_all()
    assert db.scalar(select(Robot)).status == "offline"


def test_patrol_command_ack_progress_error_and_replay(setup_client):
    client, db = setup_client
    robot = prepare(client, db)
    with client.websocket_connect(
        "/ws/robots", headers={"X-Robot-Id": str(robot.id), "Authorization": "Bearer robot-test-token"}
    ) as ws:
        ws.send_json(
            message(
                "hello",
                {"state": "idle", "position": {"x": 0, "y": 0, "yaw": 0}, "battery_voltage": 11.4, "pending_count": 0},
            )
        )
        ws.receive_json()
        with ThreadPoolExecutor() as executor:
            future = executor.submit(client.post, f"/robots/{robot.id}/patrol/start")
            command = ws.receive_json()
            assert command["type"] == "patrol_start"
            assert len(command["data"]["points"]) == 2
            reply = message("ack", {"result": "accepted"})
            reply["request_id"] = command["message_id"]
            ws.send_json(reply)
            response = future.result(timeout=10)
        assert response.status_code == 200, response.text
        assert response.json()["accepted"] is True
        task_id = command["data"]["patrol_id"]
        point = message("point_arrived", {"patrol_id": task_id, "seq": 0, "result": "arrived"})
        for _ in range(2):
            ws.send_json(point)
            assert ws.receive_json()["data"]["result"] == "ok"
        assert len(list(db.scalars(select(RobotTaskPoint)))) == 1
        error = message(
            "error",
            {
                "patrol_id": task_id,
                "code": "device_failure",
                "action": "stopped",
                "position": {"x": 0, "y": 0},
                "detail": "camera",
            },
        )
        for _ in range(2):
            ws.send_json(error)
            assert ws.receive_json()["data"]["result"] == "ok"
        db.expire_all()
        assert db.get(RobotTask, task_id).result == "aborted"
        assert db.get(Robot, robot.id).status == "error"
        assert len(list(db.scalars(select(RobotError)))) == 1
        assert len(list(db.scalars(select(RobotMessageReceipt)))) == 3
        assert client.get(f"/robots/{robot.id}/tasks/{task_id}/points").json()[0]["seq"] == 0


def test_offline_start_is_missed_and_records_are_scoped(setup_client):
    client, db = setup_client
    robot = prepare(client, db)
    response = client.post(f"/robots/{robot.id}/patrol/start")
    assert response.status_code == 200, response.text
    assert response.json()["result"] == "missed"
    assert client.get(f"/robots/{robot.id}/tasks").json()[0]["result"] == "missed"
    token, _ = create_access_token(2)
    headers = {"Authorization": f"Bearer {token}"}
    for path in ["state", "tasks", "detections", "errors"]:
        assert client.get(f"/robots/{robot.id}/{path}", headers=headers).status_code in (403, 404)


def test_detection_pickup_and_uuid_photo_key(setup_client, monkeypatch):
    from app.models import Route
    from app.schemas.robot_protocol import RobotMessage
    from app.services import photo_storage, robot_protocol

    client, db = setup_client
    robot = prepare(client, db)
    route = db.scalar(select(Route).where(Route.robot_id == robot.id, Route.is_active.is_(True)))
    task = RobotTask(
        park_id=robot.park_id,
        robot_id=robot.id,
        task_type="patrol",
        route_id=route.id,
        trigger="request",
        started_at=datetime.now(UTC),
    )
    db.add(task)
    db.commit()
    objects = {}

    class Store:
        def put(self, key, image, content_type):
            objects[key] = image

        def read_url(self, key):
            return "https://example.invalid/" + key

    monkeypatch.setattr(photo_storage, "get_photo_storage", lambda: Store())
    buffer = BytesIO()
    Image.new("RGB", (2, 2)).save(buffer, format="JPEG")
    detection_id = str(uuid4())
    data = {
        "detection_id": detection_id,
        "patrol_id": task.id,
        "material": "can",
        "confidence": 0.9,
        "position": {"x": 0, "y": 0},
        "image": base64.b64encode(buffer.getvalue()).decode(),
    }
    event = RobotMessage.model_validate(message("detection", data))
    robot_protocol.process_message(db, robot.id, event)
    robot_protocol.process_message(db, robot.id, event)
    assert list(objects) == [f"detections/{detection_id}.jpg"]
    item = db.scalar(select(Detection))
    robot_protocol.process_message(
        db,
        robot.id,
        RobotMessage.model_validate(
            message("pick_result", {"detection_id": detection_id, "patrol_id": task.id, "result": "collected"})
        ),
    )
    assert client.get(f"/detections/{item.id}/photo").status_code == 200
    assert client.get(f"/robots/{robot.id}/detections").json()[0]["pickupResult"] == "collected"


def test_schedule_does_not_duplicate_missed_tasks(setup_client):
    from contextlib import nullcontext

    from app.services.robot_connections import RobotConnections
    from app.services.robot_scheduler import run_due

    client, db = setup_client
    prepare(client, db)
    when = datetime(2026, 11, 23, 1, 0, tzinfo=UTC)
    for _ in range(2):
        asyncio.run(run_due(RobotConnections(), when, lambda: nullcontext(db)))
    assert len(list(db.scalars(select(RobotTask)))) == 1
    assert db.scalar(select(RobotTask)).result == "missed"
    assert len(list(db.scalars(select(Notification).where(Notification.notification_type == "patrol_missed")))) == 1


def test_authentication_and_hello_order(setup_client):
    client, db = setup_client
    robot = prepare(client, db)
    with (
        pytest.raises(WebSocketDisconnect) as error,
        client.websocket_connect("/ws/robots", headers={"X-Robot-Id": str(robot.id), "Authorization": "Bearer wrong"}),
    ):
        pass
    assert error.value.code == 4401
    with client.websocket_connect(
        "/ws/robots", headers={"X-Robot-Id": str(robot.id), "Authorization": "Bearer robot-test-token"}
    ) as ws:
        ws.send_json(
            message("status", {"state": "idle", "position": {"x": 0, "y": 0, "yaw": 0}, "battery_voltage": 11})
        )
        assert ws.receive_json()["code"] == "robot_hello_required"


def test_running_offline_task_cannot_be_reassigned(setup_client):
    from app.models import Route

    client, db = setup_client
    robot = prepare(client, db)
    route = db.scalar(select(Route).where(Route.robot_id == robot.id, Route.is_active.is_(True)))
    db.add(
        RobotTask(park_id=robot.park_id, robot_id=robot.id, task_type="patrol", route_id=route.id, trigger="request")
    )
    db.commit()
    token, _ = create_access_token(10)
    response = client.patch(
        f"/admin/robots/{robot.id}/assignment", headers={"Authorization": f"Bearer {token}"}, json={"parkId": None}
    )
    assert response.status_code == 409, response.text


def test_replayed_hello_restores_state_after_reconnect(setup_client):
    client, db = setup_client
    robot = prepare(client, db)
    hello = message(
        "hello", {"state": "idle", "position": {"x": 0, "y": 0, "yaw": 0}, "battery_voltage": 11, "pending_count": 0}
    )
    headers = {"X-Robot-Id": str(robot.id), "Authorization": "Bearer robot-test-token"}
    for _ in range(2):
        with client.websocket_connect("/ws/robots", headers=headers) as ws:
            ws.send_json(hello)
            assert ws.receive_json()["data"]["result"] == "ok"
            db.expire_all()
            assert db.get(Robot, robot.id).status == "idle"


def test_old_error_replay_preserves_fresh_hello_state(setup_client):
    from datetime import timedelta

    from app.schemas.robot_protocol import RobotMessage
    from app.services.robot_protocol import process_message

    client, db = setup_client
    robot = prepare(client, db)
    process_message(
        db,
        robot.id,
        RobotMessage.model_validate(
            message(
                "hello",
                {"state": "idle", "position": {"x": 0, "y": 0, "yaw": 0}, "battery_voltage": 11, "pending_count": 1},
            )
        ),
    )
    error = message("error", {"code": "device_failure", "action": "stopped", "position": {"x": 0, "y": 0}})
    error["occurred_at"] = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    process_message(db, robot.id, RobotMessage.model_validate(error))
    db.expire_all()
    assert db.get(Robot, robot.id).status == "idle"
    assert len(list(db.scalars(select(RobotError)))) == 1


def test_stop_ack_waits_for_real_patrol_end(setup_client):
    client, db = setup_client
    robot = prepare(client, db)
    headers = {"X-Robot-Id": str(robot.id), "Authorization": "Bearer robot-test-token"}
    with client.websocket_connect("/ws/robots", headers=headers) as ws:
        ws.send_json(
            message(
                "hello",
                {"state": "idle", "position": {"x": 0, "y": 0, "yaw": 0}, "battery_voltage": 11, "pending_count": 0},
            )
        )
        ws.receive_json()
        with ThreadPoolExecutor() as executor:
            future = executor.submit(client.post, f"/robots/{robot.id}/patrol/start")
            start = ws.receive_json()
            reply = message("ack", {"result": "accepted"})
            reply["request_id"] = start["message_id"]
            ws.send_json(reply)
            assert future.result(timeout=10).status_code == 200
            future = executor.submit(client.post, f"/robots/{robot.id}/patrol/stop")
            stop = ws.receive_json()
            assert stop["type"] == "patrol_stop"
            reply = message("ack", {"result": "accepted"})
            reply["request_id"] = stop["message_id"]
            ws.send_json(reply)
            assert future.result(timeout=10).json()["accepted"] is True
        db.expire_all()
        assert db.get(RobotTask, start["data"]["patrol_id"]).result is None
        assert db.get(Robot, robot.id).status == "returning"
        ws.send_json(message("patrol_end", {"patrol_id": start["data"]["patrol_id"], "result": "stopped"}))
        assert ws.receive_json()["data"]["result"] == "ok"
        db.expire_all()
        assert db.get(RobotTask, start["data"]["patrol_id"]).result == "stopped"


def test_command_timeout_preserves_uncertain_task(setup_client):
    from app.core.errors import AppError
    from app.services.robot_commands import start

    client, db = setup_client
    robot = prepare(client, db)
    robot.status = "idle"
    db.commit()

    class TimeoutConnection:
        def connected(self, robot_id):
            return True

        async def command(self, *args):
            raise AppError(504, "응답을 받지 못했어요", code="robot_command_timeout")

    with pytest.raises(AppError, match="응답"):
        asyncio.run(start(db, db.get(User, 1), robot.id, TimeoutConnection()))
    assert db.scalar(select(RobotTask)).result is None


def test_connection_replacement_keeps_new_state(setup_client):
    client, db = setup_client
    robot = prepare(client, db)
    headers = {"X-Robot-Id": str(robot.id), "Authorization": "Bearer robot-test-token"}
    with client.websocket_connect("/ws/robots", headers=headers) as old:
        old.send_json(
            message(
                "hello",
                {"state": "idle", "position": {"x": 0, "y": 0, "yaw": 0}, "battery_voltage": 11, "pending_count": 0},
            )
        )
        old.receive_json()
        with client.websocket_connect("/ws/robots", headers=headers) as new:
            new.send_json(
                message(
                    "hello",
                    {
                        "state": "idle",
                        "position": {"x": 1, "y": 2, "yaw": 0},
                        "battery_voltage": 11,
                        "pending_count": 0,
                    },
                )
            )
            new.receive_json()
            with pytest.raises(WebSocketDisconnect) as error:
                old.receive_json()
            assert error.value.code == 4001
            db.expire_all()
            assert db.get(Robot, robot.id).status == "idle"


def test_heartbeat_disconnects_silent_robot(setup_client, monkeypatch):
    from app.core.config import get_settings

    client, db = setup_client
    robot = prepare(client, db)
    monkeypatch.setattr(get_settings(), "robot_heartbeat_timeout_seconds", 0.05)
    with client.websocket_connect(
        "/ws/robots", headers={"X-Robot-Id": str(robot.id), "Authorization": "Bearer robot-test-token"}
    ) as ws:
        ws.send_json(
            message(
                "hello",
                {"state": "idle", "position": {"x": 0, "y": 0, "yaw": 0}, "battery_voltage": 11, "pending_count": 0},
            )
        )
        ws.receive_json()
        with pytest.raises(WebSocketDisconnect) as error:
            ws.receive_json()
        assert error.value.code == 4000


def test_old_cleanup_does_not_offline_replacement(setup_client, monkeypatch):
    import threading

    from app.main import app

    client, db = setup_client
    robot = prepare(client, db)
    hub = app.state.robot_connections
    original_close = hub._close
    entered, release, cleaned = threading.Event(), threading.Event(), threading.Event()

    async def delayed_close(connection, code):
        if code == 4000 and not release.is_set():
            entered.set()
            await asyncio.to_thread(release.wait, 5)
        await original_close(connection, code)
        if code == 4000:
            cleaned.set()

    monkeypatch.setattr(hub, "_close", delayed_close)
    headers = {"X-Robot-Id": str(robot.id), "Authorization": "Bearer robot-test-token"}
    old_context = client.websocket_connect("/ws/robots", headers=headers)
    old = old_context.__enter__()
    old.send_json(
        message(
            "hello",
            {"state": "idle", "position": {"x": 0, "y": 0, "yaw": 0}, "battery_voltage": 11, "pending_count": 0},
        )
    )
    old.receive_json()
    try:
        old.close()
        assert entered.wait(3)
        with client.websocket_connect("/ws/robots", headers=headers) as new:
            new.send_json(
                message(
                    "hello",
                    {
                        "state": "idle",
                        "position": {"x": 1, "y": 1, "yaw": 0},
                        "battery_voltage": 11,
                        "pending_count": 0,
                    },
                )
            )
            new.receive_json()
            release.set()
            assert cleaned.wait(3)
            assert client.get(f"/robots/{robot.id}").json()["status"] == "idle"
    finally:
        release.set()
        old_context.__exit__(None, None, None)
