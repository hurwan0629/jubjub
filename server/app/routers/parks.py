"""C-03 공원 검색 API예요. 인증된 공통 업무 라우터에 등록해요."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.parks import ParkResponse
from app.services.parks import search_parks

router = APIRouter(tags=["parks"])


@router.get("/parks", response_model=list[ParkResponse], summary="이름·주소로 서울 공원 검색")
def parks(
    query: str = Query(default="", max_length=100),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10000),
    db: Session = Depends(get_db),
) -> list[ParkResponse]:
    return search_parks(db, query, limit, offset)
