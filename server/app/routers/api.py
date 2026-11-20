"""인증이 필요한 업무 API를 여기에 등록해요."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models import User
from app.routers import approval, insights, logs, manager, patrol, robots, stations
from app.schemas.auth import ProfileResponse
from app.services.auth import get_current_user, profile_for_user

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/me", response_model=ProfileResponse, tags=["account"], summary="로그인한 관리자 조회")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ProfileResponse:
    return profile_for_user(db, user)


# 이후 업무 라우터는 router.include_router(...)로 추가하면 Bearer 인증이 적용돼요.
router.include_router(patrol.router)
router.include_router(approval.router)
router.include_router(robots.router)
router.include_router(manager.router)
router.include_router(logs.router)
router.include_router(insights.router)
router.include_router(stations.router)
