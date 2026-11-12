"""라우터 예시: 요청을 받고 → services 호출 → schemas 모양으로 응답해요."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.health import HealthResponse
from app.services.health import check_db

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse, summary="서버·DB 상태 확인")
def health(db: Session = Depends(get_db)) -> HealthResponse:
    check_db(db)
    return HealthResponse(status="ok", db="ok")
