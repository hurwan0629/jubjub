"""관리자 계정의 로그인·회원가입 API예요."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.auth import LoginRequest, LoginResponse, RegisterRequest, RegisterResponse
from app.services.auth import login_user, register_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse, summary="관리자 로그인")
def login(body: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    return login_user(db, body)


@router.post("/register", response_model=RegisterResponse, status_code=201, summary="관리자 회원가입")
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> RegisterResponse:
    user = register_user(db, body)
    return RegisterResponse(id=str(user.id), name=user.name, email=user.email)
