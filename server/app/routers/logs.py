"""판단 로그 API예요 (A-08 판단 로그 · A-09 상세 · 홈 "에이전트가 방금 한 일")."""

from typing import Annotated, Literal

from fastapi import APIRouter, Path, Query

from app.routers.patrol import DB, Admin
from app.schemas.logs import DecisionDetail, DecisionItem, DecisionType
from app.services import logs

router = APIRouter(tags=["logs"])


@router.get("/logs", response_model=list[DecisionItem], summary="판단 로그 목록 (날짜 · 종류 · 정렬)")
def list_logs(
    db: DB,
    user: Admin,
    type: DecisionType | None = None,
    date: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}-\d{2}$", description="한국 날짜 YYYY-MM-DD")] = None,
    order: Literal["desc", "asc"] = "desc",
    limit: int = Query(100, ge=1, le=200),
):
    return logs.list_logs(db, user, type, date, order, limit)


@router.get("/logs/{log_id}", response_model=DecisionDetail, summary="판단 로그 상세")
def get_log(log_id: Annotated[int, Path(ge=1, le=9223372036854775807)], db: DB, user: Admin):
    return logs.get_log(db, user, log_id)
