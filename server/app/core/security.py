"""Argon2 비밀번호 해시와 JWT 서명·검증을 담당해요."""

import re
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError

from app.core.config import get_settings
from app.core.errors import AppError

password_hasher = PasswordHash.recommended()
# 없는 계정도 해시 검증을 수행해서 빠른 응답으로 계정 존재 여부가 드러나지 않게 해요.
DUMMY_HASH = password_hasher.hash("dummy-account-password")


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    try:
        return password_hasher.verify(password, encoded)
    except (UnknownHashError, ValueError):
        return False


def signing_key() -> str:
    key = get_settings().jwt_secret
    if len(key.encode("utf-8")) < 32 or key.strip() != key:
        raise AppError(503, "서버의 JWT_SECRET 설정을 확인해 주세요", code="auth_not_configured")
    return key


def create_access_token(user_id: int) -> tuple[str, int]:
    now = datetime.now(UTC)
    expires_in = get_settings().jwt_access_token_minutes * 60
    token = jwt.encode(
        {"sub": str(user_id), "iat": now, "exp": now + timedelta(seconds=expires_in)},
        signing_key(),
        algorithm="HS256",
    )
    return token, expires_in


def unauthorized() -> AppError:
    return AppError(
        401,
        "로그인이 필요하거나 인증이 만료됐어요. 다시 로그인해 주세요",
        code="invalid_token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def decode_user_id(token: str) -> int:
    key = signing_key()
    try:
        claims = jwt.decode(token, key, algorithms=["HS256"], options={"require": ["sub", "iat", "exp"]})
        subject = claims["sub"]
        if not re.fullmatch(r"[1-9][0-9]{0,18}", subject) or int(subject) > 2**63 - 1:
            raise ValueError("잘못된 사용자 번호예요")
        if type(claims["exp"]) is not int or type(claims["iat"]) is not int:
            raise ValueError("잘못된 토큰 시각이에요")
        return int(subject)
    except (jwt.InvalidTokenError, ValueError, TypeError, OverflowError) as exc:
        raise unauthorized() from exc
