"""승인된 공원의 일일 보고 예시를 넣어요. 같은 날짜의 기존 보고는 보존해요."""

import argparse
from datetime import date

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.core.db import SessionLocal
from app.models import DailyReport, Park
from app.schemas.operations import AdminReportResponse


def seed(report_date: date):
    inserted = []
    skipped = []
    with SessionLocal() as db, db.begin():
        parks = list(db.scalars(select(Park).where(Park.status == "approved").order_by(Park.id)))
        for index, park in enumerate(parks):
            # 재질별·시간대별 합계가 총 수거량과 일치하도록 만들어요.
            extra = index * 6
            total = 24 + extra
            payload = {
                "source": "demo_daily_reports",
                "isDemo": True,
                "pickups": total,
                "stationVisits": 3 + index,
                "patrolsDone": 4,
                "patrolsPlanned": 4,
                "materials": [
                    {"material": "플라스틱", "count": 10 + extra},
                    {"material": "캔", "count": 6},
                    {"material": "유리", "count": 3},
                    {"material": "일반 쓰레기", "count": 5},
                ],
                "hourly": [
                    {"hour": "09", "count": 3},
                    {"hour": "10", "count": 5 + extra},
                    {"hour": "11", "count": 4},
                    {"hour": "12", "count": 2},
                    {"hour": "13", "count": 5},
                    {"hour": "14", "count": 5},
                ],
                "insights": [
                    "[예시] 오전 10시대에 수거가 집중됐어요. 해당 시간대의 순찰 간격을 확인해 주세요.",
                    "[예시] 플라스틱 수거 비중이 높아요. 적재함 상태를 확인해 주세요.",
                    "이 보고는 화면 확인용 예시이며 실제 로봇 운행·수거 기록이 아니에요.",
                ],
                "events": [
                    {
                        "time": "09:00",
                        "title": "예시 · 오전 순찰 시작",
                        "detail": "등록된 순찰 지점을 순서대로 확인했어요.",
                    },
                    {"time": "11:30", "title": "예시 · 분리수거장 방문", "detail": "수거한 쓰레기를 분리 배출했어요."},
                    {
                        "time": "14:20",
                        "title": "예시 · 순찰 완료",
                        "detail": "마지막 지점을 확인하고 분리수거장으로 복귀했어요.",
                    },
                ],
            }
            assert sum(item["count"] for item in payload["materials"]) == total
            assert sum(item["count"] for item in payload["hourly"]) == total
            summary = (
                f"[화면 확인용 예시] {park.catalog.name}에서 순찰 4회를 완료하고 쓰레기 {total}개를 수거했어요. "
                f"분리수거장에 {3 + index}회 방문했어요. 실제 로봇 운행 데이터가 아니에요."
            )
            statement = (
                insert(DailyReport)
                .values(park_id=park.id, catalog_id=park.catalog_id, date=report_date, summary=summary, payload=payload)
                .on_conflict_do_nothing(index_elements=["catalog_id", "date"])
                .returning(DailyReport.id)
            )
            report_id = db.scalar(statement)
            if report_id is None:
                skipped.append(park.id)
            else:
                # 응답 계약으로도 읽힐 수 있는지 확인한 다음 커밋해요.
                row = db.get(DailyReport, report_id)
                fields = {key: value for key, value in payload.items() if key not in ("source", "isDemo")}
                AdminReportResponse(
                    id=str(row.id),
                    park_id=str(park.id),
                    date=row.date,
                    summary=row.summary,
                    created_at=row.created_at,
                    **fields,
                )
                inserted.append({"parkId": park.id, "reportId": report_id, "pickups": total})
    return {"date": report_date.isoformat(), "inserted": inserted, "skippedParkIds": skipped}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", type=date.fromisoformat, required=True)
    args = parser.parse_args()
    print(seed(args.date))
