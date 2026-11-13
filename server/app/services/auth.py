"""관리자 가입·로그인과 인증된 사용자 조회를 처리해요."""

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AppError
from app.core.security import (
    DUMMY_HASH,
    create_access_token,
    decode_user_id,
    hash_password,
    unauthorized,
    verify_password,
)
from app.models import Park, User
from app.schemas.auth import LoginRequest, LoginResponse, ProfileResponse, RegisterRequest

bearer = HTTPBearer(auto_error=False)


def register_user(db: Session, body: RegisterRequest) -> User:
    user = User(
        login_id=body.login_id,
        password_hash=hash_password(body.password.get_secret_value()),
        name=body.name,
        phone=body.phone,
        email=str(body.email),
        role="manager",
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # 사전 조회만으로는 동시 가입을 막을 수 없어서 DB 유일 제약으로 판단해요.
        if getattr(exc.orig, "sqlstate", None) == "23505" or getattr(exc.orig, "sqlite_errorcode", None) == 2067:
            raise AppError(409, "이미 사용 중인 아이디 또는 이메일이에요", code="account_exists") from exc
        raise
    db.refresh(user)
    return user


def login_user(db: Session, body: LoginRequest) -> LoginResponse:
    user = db.scalar(select(User).where(User.login_id == body.login_id))
    valid = verify_password(body.password.get_secret_value(), user.password_hash if user else DUMMY_HASH)
    if user is None or not valid:
        raise AppError(
            401,
            "아이디 또는 비밀번호를 확인해 주세요",
            code="invalid_credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token, expires_in = create_access_token(user.id)
    profile = profile_for_user(db, user)
    return LoginResponse(
        access_token=token,
        expires_in=expires_in,
        is_first_login=user.role == "manager" and not (profile.park_status == "approved" and profile.route_setup_done),
        role=profile.role,
        park_status=profile.park_status,
        route_setup_done=profile.route_setup_done,
    )


def profile_for_user(db: Session, user: User) -> ProfileResponse:
    park = db.scalar(select(Park).where(Park.user_id == user.id)) if user.role == "manager" else None
    return ProfileResponse(
        name=user.name,
        email=user.email,
        role=user.role,
        park_status=park.status if park else None,
        route_setup_done=park.route_setup_done if park else False,
    )


def require_super_admin(user: User):
    if user.role != "super_admin":
        raise AppError(403, "총관리자만 사용할 수 있어요", code="super_admin_required")


def require_manager(user: User):
    if user.role != "manager":
        raise AppError(403, "하위관리자 계정으로 공원을 신청해 주세요", code="manager_required")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise unauthorized()
    user_id = decode_user_id(credentials.credentials)
    user = db.get(User, user_id)
    if user is None:
        raise unauthorized()
    return user
