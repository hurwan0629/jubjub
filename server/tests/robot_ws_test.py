"""로봇 WebSocket 연결(/ws/robot): 인증, hello·status, 끊김, 교체, 끊김 감시를 확인해요."""

import asyncio
import time
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.websockets import WebSocketDisconnect

from app.core.db import Base
from app.main import app
from app.models import Robot, RobotState
from app.routers.robot_ws import get_session_factory
from app.services import robot_auth, robot_link
from app.services.robot_connections import CLOSE_REPLACED, RobotConnectionManager, manager

TOKEN = "test-robot-token"


@pytest.fixture
def factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(engine, expire_on_commit=False)
    with session_factory() as db:
        db.add(Robot(id=1, name="시뮬레이터", serial_no="SIM-1", auth_token_hash=robot_auth.hash_token(TOKEN)))
        db.add(Robot(id=2, name="토큰 없음", serial_no="SIM-2"))
        db.commit()
    app.dependency_overrides[get_session_factory] = lambda: session_factory
    yield session_factory
    app.dependency_overrides.clear()
    for robot_id in list(manager.connected_ids()):
        manager.unregister(manager.get(robot_id))


@pytest.fixture
def client(factory):
    return TestClient(app)


def headers(robot_id=1, token=TOKEN):
    return {"X-Robot-Id": str(robot_id), "Authorization": f"Bearer {token}"}


def message(type_, data, message_id="r-1"):
    return {"type": type_, "message_id": message_id, "occurred_at": "2026-12-01T10:00:00+09:00", "data": data}


STATUS = {"state": "idle", "patrol_id": None, "position": {"x": 1.25, "y": -0.8, "yaw": 1.57}, "battery_voltage": 11.4}


def state(factory, robot_id=1) -> RobotState:
    with factory() as db:
        return db.get(RobotState, robot_id)


@pytest.mark.parametrize(
    "hdrs",
    [
        headers(token="wrong-token"),
        headers(robot_id=2, token=TOKEN),  # 토큰을 발급하지 않은 로봇
        headers(robot_id=999),
        {"X-Robot-Id": "1"},  # 토큰 없음
        {"Authorization": f"Bearer {TOKEN}"},  # 로봇 id 없음
    ],
)
def test_rejects_bad_credentials(client, hdrs):
    with pytest.raises(WebSocketDisconnect) as exc, client.websocket_connect("/ws/robot", headers=hdrs):
        pass
    assert exc.value.code == 1008
    assert manager.connected_ids() == set()


def test_hello_updates_state_and_gets_ack(client, factory):
    with client.websocket_connect("/ws/robot", headers=headers()) as ws:
        ws.send_json(message("hello", {**STATUS, "state": "working", "patrol_id": 7, "pending_count": 3}))
        reply = ws.receive_json()
        assert reply["type"] == "ack"
        assert reply["request_id"] == "r-1"
        assert reply["data"] == {"result": "ok"}
        assert reply["occurred_at"].endswith("+09:00")
        assert manager.connected_ids() == {1}

        saved = state(factory)
        assert saved.status == "working"
        assert (saved.slam_x, saved.slam_y, saved.slam_yaw) == (1.25, -0.8, 1.57)
        assert saved.battery_voltage == pytest.approx(11.4)
        assert saved.last_seen_at is not None


def test_status_updates_state_without_ack_and_disconnect_sets_offline(client, factory):
    with client.websocket_connect("/ws/robot", headers=headers()) as ws:
        ws.send_json(message("hello", STATUS, "r-1"))
        ws.receive_json()
        ws.send_json(message("status", {**STATUS, "position": {"x": 4.6, "y": 0.9, "yaw": -0.42}}, "r-2"))
        # status에는 ack가 없어요. 다음 hello의 ack가 바로 오는지로 확인해요
        ws.send_json(message("hello", {**STATUS, "position": {"x": 4.6, "y": 0.9, "yaw": -0.42}}, "r-3"))
        assert ws.receive_json()["request_id"] == "r-3"
        assert state(factory).slam_x == 4.6

    assert state(factory).status == "offline"
    assert manager.connected_ids() == set()


def test_invalid_messages_are_ignored(client, factory):
    with client.websocket_connect("/ws/robot", headers=headers()) as ws:
        ws.send_text("이건 JSON이 아니에요")
        ws.send_json(message("status", {"state": "flying", "position": {"x": 0, "y": 0, "yaw": 0}}))
        ws.send_json(message("detection", {"detection_id": "x"}))  # 아직 처리 안 함 → ack 없음
        ws.send_json(message("hello", STATUS, "r-9"))
        assert ws.receive_json()["request_id"] == "r-9"
        assert state(factory).status == "idle"


def test_reconnect_replaces_previous_connection(client, factory):
    with client.websocket_connect("/ws/robot", headers=headers()) as first:
        first.send_json(message("hello", STATUS, "r-1"))
        first.receive_json()
        with client.websocket_connect("/ws/robot", headers=headers()) as second:
            with pytest.raises(WebSocketDisconnect) as exc:
                first.receive_json()
            assert exc.value.code == CLOSE_REPLACED
            second.send_json(message("hello", STATUS, "r-2"))
            assert second.receive_json()["request_id"] == "r-2"
            # 이전 연결이 끊겨도 새 연결이 살아 있으니 offline이 되면 안 돼요
            assert state(factory).status == "idle"
            assert manager.connected_ids() == {1}


def test_mark_stale_offline_skips_connected_and_recent(factory):
    old = datetime.now(UTC) - timedelta(seconds=60)
    with factory() as db:
        db.add(Robot(id=3, name="최근", serial_no="SIM-3"))
        db.add(Robot(id=4, name="연결됨", serial_no="SIM-4"))
        db.flush()
        for robot_id, status, seen in [(1, "working", old), (3, "idle", datetime.now(UTC)), (4, "idle", old)]:
            row = db.get(RobotState, robot_id)
            row.status, row.last_seen_at = status, seen
        db.commit()

    cutoff = datetime.now(UTC) - timedelta(seconds=10)
    assert robot_link.mark_stale_offline(factory, cutoff, connected_ids={4}) == 1
    assert state(factory, 1).status == "offline"
    assert state(factory, 3).status == "idle"
    assert state(factory, 4).status == "idle"


class FakeSocket:
    def __init__(self):
        self.closed_with = None

    async def close(self, code, reason=""):
        self.closed_with = code


def test_sweep_closes_silent_connection(factory):
    async def scenario():
        connections = RobotConnectionManager()
        socket = FakeSocket()
        connection = await connections.register(1, socket)
        with factory() as db:
            db.get(RobotState, 1).status = "working"
            db.get(RobotState, 1).last_seen_at = datetime.now(UTC)
            db.commit()
        connection.last_seen = time.monotonic() - 30
        await robot_link.sweep(factory, connections, offline_after=10)
        await asyncio.sleep(0)  # 닫기 작업이 돌 시간을 줘요
        return connections, socket

    connections, socket = asyncio.run(scenario())
    assert connections.connected_ids() == set()
    assert socket.closed_with == 4001
    assert state(factory).status == "offline"


def test_issue_token_replaces_previous(factory):
    with Session(factory.kw["bind"]) as db:
        robot = db.get(Robot, 1)
        new_token = robot_auth.issue_token(db, robot)
    assert new_token != TOKEN
    assert robot_auth.authenticate(factory, 1, new_token)
    assert not robot_auth.authenticate(factory, 1, TOKEN)
