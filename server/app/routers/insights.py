"""기간 보고(A-10)와 지도 현황(A-02 · A-03) API예요."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.routers.patrol import DB, Admin
from app.schemas.insights import MapOverview, PeriodReport
from app.services import insights

router = APIRouter()
Day = Annotated[str, Query(pattern=r"^\d{4}-\d{2}-\d{2}$", description="한국 날짜 YYYY-MM-DD (포함)")]


@router.get("/reports", response_model=PeriodReport, tags=["reports"], summary="기간 보고 (최대 92일)")
def period_report(
    db: DB, user: Admin, from_: Annotated[str, Query(alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$")], to: Day
):
    return insights.period_report(db, user, from_, to)


@router.get("/map/overview", response_model=MapOverview, tags=["map"], summary="지도 현황 (마커 · 경로 · 히트맵)")
def map_overview(db: DB, user: Admin):
    return insights.map_overview(db, user)
