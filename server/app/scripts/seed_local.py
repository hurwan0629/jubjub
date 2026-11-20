"""로컬 개발용 SQLite DB를 처음부터 만들고 화면 확인용 데이터를 넣어요. 공유 Supabase는 건드리지 않아요.

실행 (server 폴더에서):
    $env:DATABASE_URL = "sqlite:///./local.db"; python -m app.scripts.seed_local

만드는 것:
  - 서울 공원 목록 전체 (data/seoul_parks.json)
  - 총관리자 admin / admin1234, 관리자 manager01 / password123 (여의도한강공원, 승인 · 경로 설정 끝)
  - 분리수거장 2곳, 순찰 지점 3곳, 시간표 3개, 로봇 2대 (순찰 중 · 충전 중)
  - 알림 4개, 에이전트 판단 기록 (판단 로그 · 보고 · 히트맵에 보여요)
"""

import json
import random
from datetime import UTC, datetime, timedelta
from pathlib import Path

from shapely.geometry import Point, Polygon
from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import AgentRun, AgentStep, Park, ParkCatalogEntry, PatrolPoint, Robot, User
from app.schemas.parks import LatLng
from app.schemas.patrol import ConfigInput
from app.services.manager import create_notification
from app.services.park_import import import_catalog
from app.services.patrol import save_config

SERVER_DIR = Path(__file__).resolve().parents[2]
PARK_NAME = "여의도한강공원"
MANAGER = ("manager01", "password123")
ADMIN = ("admin", "admin1234")
SLOT_NAME = {"pet": "페트", "can": "캔", "paper": "종이", "general": "일반"}


def _inside_points(area: dict, count: int, seed: int = 7) -> list[LatLng]:
    """공원 경계 안쪽에서 서로 가까운 점을 골라요 (순찰 지점은 서로 1km 안에 있어야 해요)."""
    polygon = Polygon(
        [(p["longitude"], p["latitude"]) for p in area["outer"]],
        [[(p["longitude"], p["latitude"]) for p in ring] for ring in area.get("holes", [])],
    )
    center = polygon.representative_point()
    rng = random.Random(seed)
    found: list[LatLng] = [LatLng(latitude=center.y, longitude=center.x)]
    while len(found) < count:
        # 대표점에서 약 500m 안쪽
        x = center.x + rng.uniform(-0.005, 0.005)
        y = center.y + rng.uniform(-0.004, 0.004)
        if polygon.covers(Point(x, y)):
            found.append(LatLng(latitude=y, longitude=x))
    return found


def main() -> None:
    url = get_settings().database_url
    if not url.startswith("sqlite"):
        raise SystemExit(
            "공유 DB를 지우지 않도록 SQLite 주소에서만 실행해요. DATABASE_URL=sqlite:///./local.db 로 실행해 주세요."
        )

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    document = json.loads((SERVER_DIR / "data" / "seoul_parks.json").read_text(encoding="utf-8"))

    with SessionLocal() as db:
        import_catalog(db, document)
        catalog = db.scalar(select(ParkCatalogEntry).where(ParkCatalogEntry.name == PARK_NAME).limit(1))
        if catalog is None:
            raise SystemExit(f"{PARK_NAME}을 공원 목록에서 찾지 못했어요")

        now = datetime.now(UTC)
        admin = User(
            login_id=ADMIN[0],
            password_hash=hash_password(ADMIN[1]),
            name="총관리자",
            phone="",
            email="admin@jubjub.local",
            role="super_admin",
        )
        manager = User(
            login_id=MANAGER[0],
            password_hash=hash_password(MANAGER[1]),
            name="공원 관리자",
            phone="01012345678",
            email="manager@jubjub.local",
            role="manager",
        )
        db.add_all([admin, manager])
        db.flush()
        park = Park(
            user_id=manager.id,
            catalog_id=catalog.id,
            status="approved",
            approved_by=admin.id,
            approved_at=now,
            route_setup_done=False,
        )
        db.add(park)
        db.commit()

        station, lawn, stage, bench, north = _inside_points(catalog.area, 5)
        save_config(
            db,
            manager,
            ConfigInput(
                station=station,
                points=[
                    {"name": "잔디광장", "position": lawn},
                    {"name": "공연장 앞", "position": stage},
                    {"name": "벤치 쉼터", "position": bench},
                ],
                schedule=[
                    {"time": "10:00", "label": "오전 순찰", "on": True, "repeat": "daily"},
                    {"time": "14:00", "label": "점심 뒤 순찰", "on": True, "repeat": "daily"},
                    {"time": "17:00", "label": "저녁 순찰", "on": True, "repeat": "daily"},
                ],
            ),
        )
        main_station = db.scalar(select(PatrolPoint).where(PatrolPoint.type == "station"))
        main_station.name = "남문 분리수거장"
        north_station = PatrolPoint(
            park_id=park.id, name="북문 분리수거장", type="station", lat=north.latitude, lng=north.longitude
        )
        db.add(north_station)
        db.flush()

        jubi1 = Robot(
            name="Jubi 1",
            serial_no="LOCAL-001",
            park_id=park.id,
            status="working",
            assigned_at=now,
            patrol_state="patrolling",
            battery=72,
            near_point="잔디광장",
            next_point="공연장 앞",
            remaining_points=2,
        )
        jubi2 = Robot(
            name="Jubi 2",
            serial_no="LOCAL-002",
            park_id=park.id,
            status="charging",
            assigned_at=now,
            battery=40,
            station_id=north_station.id,
        )
        db.add_all([jubi1, jubi2])
        db.flush()

        def pos(p: LatLng) -> dict:
            return {"latitude": p.latitude, "longitude": p.longitude}

        create_notification(
            db,
            park.id,
            "robotError",
            "로봇이 움직이지 못하고 있어요",
            "벤치 쉼터 근처",
            note="현장 확인이 필요해요",
            pinned=True,
            payload={"robotIssue": {"kind": "뒤집힘", "since": "11:02", "lastPlace": "벤치 쉼터 근처", "battery": 72}},
        )
        create_notification(
            db,
            park.id,
            "unpickable",
            "깨진 유리를 발견했어요",
            "벤치 쉼터",
            note="직접 처리가 필요해요",
            payload={"position": pos(bench), "detection": {"label": "유리", "confidence": 91}},
        )
        battery = create_notification(
            db,
            park.id,
            "lowBattery",
            "배터리가 부족해 멈춰 있어요",
            "벤치 쉼터 가는 길",
            payload={
                "robotIssue": {
                    "kind": "배터리 부족",
                    "since": "14:02",
                    "lastPlace": "벤치 쉼터 가는 길",
                    "battery": 15,
                    "chargerDistanceM": 320,
                }
            },
        )
        battery.status = "acked"
        report = create_notification(
            db, park.id, "dailyReport", "어제 보고서가 작성됐어요", "하루 동안의 수거 기록을 확인해 보세요"
        )
        report.status = "acked"
        report.created_at = now - timedelta(days=1)

        # 에이전트 판단 기록: 오늘 · 어제 줍기, 재촬영, 분리수거장 비우기, 집기 불가 알림
        run = AgentRun(
            park_id=park.id,
            robot_id=jubi1.id,
            trigger="patrol",
            status="done",
            plan="정기 순찰",
            result="순찰 완료",
            started_at=now - timedelta(hours=3),
        )
        old_run = AgentRun(
            park_id=park.id,
            robot_id=jubi1.id,
            trigger="patrol",
            status="done",
            plan="정기 순찰",
            result="순찰 완료",
            started_at=now - timedelta(days=1, hours=3),
        )
        db.add_all([run, old_run])
        db.flush()

        def step(r, kind, title, minutes_ago, output=None, details=None, decision="", reason=""):
            db.add(
                AgentStep(
                    run_id=r.id,
                    step_type=kind,
                    title=title,
                    details=details or [],
                    input={},
                    output=output or {},
                    decision=decision,
                    reason=reason,
                    tool="",
                    created_at=now - timedelta(minutes=minutes_ago),
                )
            )

        picks = [
            ("pet", "공연장 앞", stage),
            ("pet", "공연장 앞", stage),
            ("can", "잔디광장", lawn),
            ("paper", "공연장 앞", stage),
            ("general", "벤치 쉼터", bench),
            ("can", "공연장 앞", stage),
        ]
        for i, (slot, point, where) in enumerate(picks):
            step(
                run,
                "pick",
                "쓰레기 탐지 및 줍기",
                170 - i * 20,
                {
                    "slot": slot,
                    "point": point,
                    "position": pos(where),
                    "summary": f"{SLOT_NAME[slot]}(확신도 {90 + i}%)",
                    "tag": "줍기 완료",
                },
                details=[f"{point}에서 수거했어요."],
                decision="집어 수거했어요",
                reason="확신도가 높고 줍기 대상이에요.",
            )
        for i in range(3):
            step(
                old_run,
                "pick",
                "쓰레기 탐지 및 줍기",
                1440 + i * 30,
                {"slot": "pet", "point": "잔디광장", "position": pos(lawn)},
            )
        step(
            run,
            "recapture",
            "다시 촬영",
            60,
            {
                "heading": "각도를 바꿔 다시 촬영했어요",
                "kicker": {"text": "재촬영", "tone": "brand"},
                "shots": [
                    {"caption": "첫 촬영 · 확신도 62%"},
                    {"caption": "재촬영 · 페트 · 확신도 94%", "highlight": True},
                ],
                "facts": [],
                "reason": "처음에는 확신도가 낮아 각도를 바꿔 다시 찍었어요.",
            },
            details=["확신도가 낮아 각도를 바꿨어요"],
        )
        step(run, "empty", "분리수거장 이동 시작", 40, details=["페트 칸 80%"])
        step(
            run,
            "notify",
            "집기 불가 알림",
            30,
            details=["유리 · 벤치 쉼터"],
            decision="알림을 보냈어요",
            reason="유리라서 집지 않았어요.",
        )
        db.commit()

    print(f"로컬 DB를 만들었어요: {url}")
    print(f"  관리자 {MANAGER[0]} / {MANAGER[1]}  ·  총관리자 {ADMIN[0]} / {ADMIN[1]}  ·  공원 {PARK_NAME}")


if __name__ == "__main__":
    main()
