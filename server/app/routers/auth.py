"""관리자 계정의 로그인·회원가입 API예요."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    ReapplicationSession,
    ReapplyRequest,
    RegisterRequest,
    RegisterResponse,
)
from app.services.auth import login_user, profile_for_user, reapplication_session, reapply_user, register_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse, summary="관리자 로그인")
def login(body: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    return login_user(db, body)


@router.post(
    "/register", response_model=RegisterResponse, status_code=201, summary="담당 공원을 포함한 관리자 회원가입 신청"
)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> RegisterResponse:
    user = register_user(db, body)
    return RegisterResponse(id=str(user.id), **profile_for_user(db, user).model_dump())


@router.post("/reapplication-session", response_model=ReapplicationSession)
def prepare_reapplication(body: LoginRequest, db: Session = Depends(get_db)):
    return reapplication_session(db, body)


@router.post("/reapply", response_model=RegisterResponse)
def reapply(body: ReapplyRequest, db: Session = Depends(get_db)):
    user = reapply_user(db, body)
    return RegisterResponse(id=str(user.id), **profile_for_user(db, user).model_dump())
