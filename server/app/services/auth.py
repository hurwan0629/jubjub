"""관리자 가입·로그인과 인증된 사용자 조회를 처리해요."""

from datetime import UTC, datetime, timedelta
from hashlib import sha256

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AppError
from app.core.security import (
    DUMMY_HASH,
    create_access_token,
    decode_user_id,
    hash_password,
    signing_key,
    unauthorized,
    verify_password,
)
from app.models import Park, User
from app.models.park_catalog import ParkCatalogEntry
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    ProfileResponse,
    ReapplicationSession,
    ReapplyRequest,
    RegisterRequest,
)
from app.schemas.parks import ParkResponse

bearer = HTTPBearer(auto_error=False)


def register_user(db: Session, body: RegisterRequest) -> User:
    catalog_id = int(body.catalog_id)
    catalog = db.get(ParkCatalogEntry, catalog_id) if catalog_id <= 2**63 - 1 else None
    if catalog is None or not catalog.is_active:
        raise AppError(404, "선택한 공원을 찾을 수 없어요", code="park_not_found")
    user = User(
        login_id=body.login_id,
        password_hash=hash_password(body.password.get_secret_value()),
        name=body.name,
        phone=body.phone,
        email=str(body.email),
        role="manager",
    )
    try:
        # 가입 정보와 담당 공원을 함께 저장해야 불완전한 가입 계정이 남지 않아요.
        db.add(user)
        db.flush()
        db.add(Park(user_id=user.id, catalog_id=catalog.id, status="pending", route_setup_done=False))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # 사전 조회만으로는 동시 가입을 막을 수 없어서 DB 유일 제약으로 판단해요.
        if getattr(exc.orig, "sqlstate", None) == "23505" or getattr(exc.orig, "sqlite_errorcode", None) == 2067:
            raise AppError(409, "이미 사용 중인 아이디 또는 이메일이에요", code="account_exists") from exc
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise AppError(
            503, "가입 신청을 저장하지 못했어요. 다시 시도해 주세요", code="registration_unavailable"
        ) from exc
    db.refresh(user)
    return user


def _authenticate(db: Session, body: LoginRequest) -> User:
    user = db.scalar(select(User).where(User.login_id == body.login_id))
    valid = verify_password(body.password.get_secret_value(), user.password_hash if user else DUMMY_HASH)
    if user is None or not valid:
        raise AppError(
            401,
            "아이디 또는 비밀번호를 확인해 주세요",
            code="invalid_credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def login_user(db: Session, body: LoginRequest) -> LoginResponse:
    user = _authenticate(db, body)
    profile = profile_for_user(db, user)
    require_approved_registration(user, profile)
    token, expires_in = create_access_token(user.id)
    return LoginResponse(
        access_token=token,
        expires_in=expires_in,
        is_first_login=user.role == "manager" and not (profile.park_status == "approved" and profile.route_setup_done),
        role=profile.role,
        park_status=profile.park_status,
        route_setup_done=profile.route_setup_done,
        registration_status=profile.registration_status,
    )


def _reapplication_state(user: User, park: Park) -> str:
    # 새 비밀번호 해시가 발급되면 이전 재신청 토큰은 재사용할 수 없어요.
    return sha256(f"{user.password_hash}:{park.catalog_id}:{park.reject_reason}".encode()).hexdigest()


def reapplication_session(db: Session, body: LoginRequest) -> ReapplicationSession:
    user = _authenticate(db, body)
    park = db.scalar(select(Park).where(Park.user_id == user.id))
    if user.role != "manager" or park is None or park.status != "rejected":
        raise AppError(409, "반려된 가입 신청만 다시 신청할 수 있어요", code="registration_not_rejected")
    now = datetime.now(UTC)
    expires_in = 1800
    token = jwt.encode(
        {
            "sub": str(user.id),
            "purpose": "reapplication",
            "state": _reapplication_state(user, park),
            "iat": now,
            "exp": now + timedelta(seconds=expires_in),
        },
        signing_key(),
        algorithm="HS256",
    )
    return ReapplicationSession(
        reapplication_token=token,
        expires_in=expires_in,
        login_id=user.login_id,
        name=user.name,
        email=user.email,
        phone=user.phone,
        catalog_id=str(park.catalog_id),
        reject_reason=park.reject_reason or "",
        park=ParkResponse(
            id=str(park.catalog.id),
            name=park.catalog.name,
            address=park.catalog.address,
            distance="",
            bounds=park.catalog.bounds,
            area=park.catalog.area,
        )
        if park.catalog.is_active
        else None,
    )


def reapply_user(db: Session, body: ReapplyRequest) -> User:
    key = signing_key()
    try:
        claims = jwt.decode(
            body.reapplication_token.get_secret_value(),
            key,
            algorithms=["HS256"],
            options={"require": ["sub", "iat", "exp", "purpose", "state"]},
        )
        if claims["purpose"] != "reapplication" or not str(claims["sub"]).isdigit():
            raise ValueError
        user_id = int(claims["sub"])
        if not 0 < user_id <= 2**63 - 1:
            raise ValueError
    except (jwt.InvalidTokenError, ValueError, TypeError) as exc:
        raise unauthorized() from exc
    try:
        user = db.scalar(
            select(User).where(User.id == user_id).with_for_update().execution_options(populate_existing=True)
        )
        park = db.scalar(
            select(Park)
            .where(Park.user_id == user_id)
            .with_for_update(of=Park)
            .execution_options(populate_existing=True)
        )
        if user is None or user.role != "manager" or park is None:
            raise unauthorized()
        if park.status != "rejected":
            raise AppError(409, "이미 처리된 가입 신청이에요. 다시 로그인해 주세요", code="registration_not_rejected")
        if claims["state"] != _reapplication_state(user, park):
            raise unauthorized()
        catalog_id = int(body.catalog_id)
        catalog = db.get(ParkCatalogEntry, catalog_id) if catalog_id <= 2**63 - 1 else None
        if catalog is None or not catalog.is_active:
            raise AppError(404, "선택한 공원을 찾을 수 없어요", code="park_not_found")
        if park.catalog_id != catalog.id:
            # 승인 취소 뒤 다른 공원으로 재신청하면 이전 좌표·설정을 새 공원에 적용하지 않아요.
            from app.models import ParkChangeRequest, Schedule
            from app.services.patrol import _deactivate, _hide_points

            _deactivate(db, park)
            _hide_points(db, park)
            db.execute(delete(Schedule).where(Schedule.park_id == park.id))
            for change in db.scalars(
                select(ParkChangeRequest).where(
                    ParkChangeRequest.park_id == park.id, ParkChangeRequest.status == "pending"
                )
            ):
                change.status = "cancelled"
            park.anchor_points = []
        user.name, user.email, user.phone = body.name, str(body.email), body.phone
        user.password_hash = hash_password(body.password.get_secret_value())
        park.catalog_id, park.status, park.route_setup_done = catalog.id, "pending", False
        park.reject_reason = park.reviewed_by = park.reviewed_at = None
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AppError(409, "이미 사용 중인 이메일이에요", code="account_exists") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise AppError(503, "재신청을 저장하지 못했어요. 다시 시도해 주세요", code="registration_unavailable") from exc
    except AppError:
        db.rollback()
        raise
    db.refresh(user)
    return user


def profile_for_user(db: Session, user: User) -> ProfileResponse:
    park = db.scalar(select(Park).where(Park.user_id == user.id)) if user.role == "manager" else None
    return ProfileResponse(
        name=user.name,
        email=user.email,
        role=user.role,
        park_status=park.status if park else None,
        route_setup_done=park.route_setup_done if park else False,
        registration_status=park.status if park else ("approved" if user.role == "super_admin" else None),
    )


def require_approved_registration(user: User, profile: ProfileResponse):
    if user.role == "super_admin" or profile.registration_status == "approved":
        return
    if profile.registration_status == "rejected":
        raise AppError(403, "회원가입 신청이 반려되었어요. 총관리자에게 문의해 주세요", code="registration_rejected")
    if profile.registration_status == "pending":
        raise AppError(
            403, "총관리자의 회원가입 승인을 기다리고 있어요. 승인 후 로그인해 주세요", code="registration_pending"
        )
    raise AppError(
        403, "담당 공원이 포함된 가입 신청이 필요해요. 총관리자에게 문의해 주세요", code="registration_incomplete"
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
    require_approved_registration(user, profile_for_user(db, user))
    return user
