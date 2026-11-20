"""실제 SQLite ORM과 HTTP로 기간 보고 · 지도 현황을 검증해요."""

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.models import AgentRun, AgentStep, Park
from app.services.manager import create_notification
from tests.robots_test import _approved_manager

pytest_plugins = ["tests.registration_approval_test"]


def _pick(run_id: int, at: datetime, slot: str, point: str, success: bool = True) -> AgentStep:
    return AgentStep(
        run_id=run_id,
        step_type="pick",
        title="쓰레기 탐지 및 줍기",
        details=[],
        input={},
        output={"success": success, "slot": slot, "point": point, "position": {"latitude": 37.0001, "longitude": 127}},
        decision="",
        reason="",
        tool="",
        created_at=at,
    )


def test_period_report_and_map_overview(registration_client):
    client, engine = registration_client
    headers, _ = _approved_manager(client, [])
    now = datetime.now(UTC).replace(tzinfo=None)
    kst_today = (datetime.now(UTC) + timedelta(hours=9)).date()
    with Session(engine) as db:
        park_id = db.query(Park).one().id
        run = AgentRun(park_id=park_id, trigger="patrol", status="done", plan="", result="", started_at=now)
        db.add(run)
        db.flush()
        db.add_all(
            [
                _pick(run.id, now, "pet", "공연장 앞"),
                _pick(run.id, now, "pet", "공연장 앞"),
                _pick(run.id, now, "can", "잔디광장"),
                _pick(run.id, now, "can", "잔디광장", success=False),
                _pick(run.id, now - timedelta(days=1), "pet", "공연장 앞"),
                AgentStep(
                    run_id=run.id,
                    step_type="empty",
                    title="분리수거장 비우기",
                    details=[],
                    input={},
                    output={},
                    decision="",
                    reason="",
                    tool="",
                    created_at=now,
                ),
            ]
        )
        create_notification(
            db,
            park_id,
            "unpickable",
            "깨진 유리를 발견했어요",
            "벤치 쉼터",
            payload={
                "position": {"latitude": 37.0002, "longitude": 127.0001},
                "detection": {"label": "유리", "confidence": 91},
                "photoUrl": "/photos/glass.jpg",
            },
        )
        db.commit()

    day = kst_today.isoformat()
    report = client.get("/reports", params={"from": day, "to": day}, headers=headers)
    assert report.status_code == 200, report.text
    r = report.json()
    assert r["from"] == day and r["pickups"] == 3
    assert r["changePercent"] == 200  # 전날 1개 → 오늘 3개
    assert r["pickSuccessRate"] == 75  # 3 / (3 + 집기 불가 1)
    assert r["patrols"] == 1 and r["stationVisits"] == 1
    assert {m["slot"]: m["count"] for m in r["byMaterial"]} == {"pet": 2, "can": 1, "paper": 0, "general": 0}
    assert r["byPoint"] == [{"name": "공연장 앞", "percent": 67}, {"name": "잔디광장", "percent": 33}]
    assert r["unresolved"][0]["kind"] == "unpickable"

    too_long = client.get("/reports", params={"from": "2026-01-01", "to": "2026-06-01"}, headers=headers)
    assert too_long.json()["code"] == "period_too_long"
    assert (
        client.get("/reports", params={"from": day, "to": "2020-01-01"}, headers=headers).json()["code"]
        == "invalid_period"
    )

    overview = client.get("/map/overview", headers=headers)
    assert overview.status_code == 200, overview.text
    o = overview.json()
    assert o["parkName"] == "테스트 공원"
    types = [m["type"] for m in o["markers"]]
    assert types == ["station", "unpickable"]
    glass = o["markers"][1]
    assert glass["detail"]["material"] == "유리" and glass["detail"]["confidence"] == 91
    assert len(o["route"]) == 3  # 지점 2곳 + 처음으로 돌아오기
    assert o["heat"] == [{"position": {"latitude": 37.0001, "longitude": 127.0}, "weight": 1.0}]
