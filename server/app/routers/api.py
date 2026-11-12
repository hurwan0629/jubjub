"""인증이 필요한 업무 API를 여기에 등록해요."""

from fastapi import APIRouter, Depends

from app.models import User
from app.schemas.auth import ProfileResponse
from app.services.auth import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/me", response_model=ProfileResponse, tags=["account"], summary="로그인한 관리자 조회")
def me(user: User = Depends(get_current_user)) -> ProfileResponse:
    return ProfileResponse(name=user.name, email=user.email)


# 이후 업무 라우터는 router.include_router(...)로 추가하면 Bearer 인증이 적용돼요.
