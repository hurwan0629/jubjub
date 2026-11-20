"""실제 SQLite ORM과 HTTP로 판단 로그 목록 · 상세를 검증해요."""

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.models import AgentRun, AgentStep, Park
from tests.robots_test import _approved_manager

pytest_plugins = ["tests.registration_approval_test"]


def _step(run_id: int, step_type: str, title: str, at: datetime, output: dict | None = None, **kwargs) -> AgentStep:
    return AgentStep(
        run_id=run_id,
        step_type=step_type,
        title=title,
        details=kwargs.get("details", []),
        input={},
        output=output or {},
        decision=kwargs.get("decision", ""),
        reason=kwargs.get("reason", ""),
        tool="",
        created_at=at,
    )


def test_logs_list_filter_order_and_detail(registration_client):
    client, engine = registration_client
    headers, _ = _approved_manager(client, [])
    now = datetime.now(UTC)
    with Session(engine) as db:
        park_id = db.query(Park).one().id
        run = AgentRun(park_id=park_id, trigger="patrol", status="done", plan="", result="", started_at=now)
        db.add(run)
        db.flush()
        db.add_all(
            [
                _step(
                    run.id,
                    "pick",
                    "쓰레기 탐지 및 줍기",
                    now - timedelta(minutes=10),
                    {"summary": "페트(확신도 98%)", "photoUrl": "/photos/pet.jpg", "tag": "줍기 완료"},
                    details=["확신도 98%로 페트라고 판단했어요."],
                    decision="페트를 집어 수거했어요",
                    reason="확신도가 높아요",
                ),
                _step(
                    run.id,
                    "recapture",
                    "다시 촬영",
                    now - timedelta(minutes=5),
                    {
                        "heading": "각도를 바꿔 다시 촬영했어요",
                        "kicker": {"text": "재촬영", "tone": "brand"},
                        "shots": [{"caption": "첫 촬영 · 확신도 62%"}, {"caption": "재촬영 · 94%", "highlight": True}],
                        "reason": "처음에는 확신도가 낮았어요.",
                        "facts": [],
                    },
                    details=["확신도가 낮아 각도를 바꿨어요"],
                ),
                _step(run.id, "unknown_kind", "계획 세움", now - timedelta(days=2)),
            ]
        )
        db.commit()

    logs = client.get("/logs", headers=headers).json()
    # 맨 위는 관리자 경로 저장(PUT /route)이 남긴 기록이에요
    assert [log["title"] for log in logs] == ["관리자 경로 수정", "다시 촬영", "쓰레기 탐지 및 줍기", "계획 세움"]
    assert logs[3]["type"] == "plan"
    route_log, recapture_log, pick_log = logs[0], logs[1], logs[2]
    assert pick_log["summary"] == "페트(확신도 98%)" and pick_log["photoUrl"] == "/photos/pet.jpg"

    kst_today = (datetime.now(UTC) + timedelta(hours=9)).strftime("%Y-%m-%d")
    by_day = client.get("/logs", params={"date": kst_today, "order": "asc"}, headers=headers).json()
    assert [log["title"] for log in by_day] == ["쓰레기 탐지 및 줍기", "다시 촬영", "관리자 경로 수정"]
    assert len(client.get("/logs", params={"type": "pick"}, headers=headers).json()) == 1
    assert client.get("/logs", params={"date": "2026-13-99"}, headers=headers).json()["code"] == "invalid_date"

    route = client.get(f"/logs/{route_log['id']}", headers=headers).json()
    assert route["heading"] == "순찰 경로를 변경했어요" and route["facts"] == []
    assert route["cards"][0]["lines"] == ["1 · 정문", "2 · 잔디광장"]
    assert [b["title"] for b in route["boxes"]] == ["바꾼 주체", "적용 시점"]

    pick = client.get(f"/logs/{pick_log['id']}", headers=headers).json()
    assert pick["tag"] == "줍기 완료" and pick["photoSlot"] is True
    assert pick["facts"] == [
        {"label": "고른 행동", "value": "페트를 집어 수거했어요"},
        {"label": "이유", "value": "확신도가 높아요"},
    ]
    recapture = client.get(f"/logs/{recapture_log['id']}", headers=headers).json()
    assert recapture["heading"] == "각도를 바꿔 다시 촬영했어요"
    assert recapture["shots"][1] == {"photoUrl": None, "caption": "재촬영 · 94%", "highlight": True}
    assert recapture["facts"] == [] and recapture["reason"] == "처음에는 확신도가 낮았어요."
    assert client.get("/logs/9999", headers=headers).status_code == 404
