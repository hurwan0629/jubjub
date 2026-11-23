"""로봇 접속 토큰 발급·확인.

- 토큰은 총관리자가 로봇을 등록할 때 발급하고, 원문은 한 번만 보여줘요 (지금은 scripts/robot_token.py로 발급).
- DB(robots.auth_token_hash)에는 SHA-256 해시만 저장해요. 토큰이 충분히 긴 난수라서
  비밀번호처럼 느린 해시(Argon2)를 쓰지 않아도 되고, 접속할 때마다 빠르게 확인할 수 있어요.
"""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime

from sqlalchemy.orm import Session, sessionmaker

from app.models import Robot


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_token(db: Session, robot: Robot) -> str:
    """새 토큰을 만들어 해시를 저장하고 원문을 돌려줘요. 이전 토큰은 더 이상 쓸 수 없어요."""
    token = generate_token()
    robot.auth_token_hash = hash_token(token)
    robot.token_issued_at = datetime.now(UTC)
    db.commit()
    return token


def authenticate(session_factory: sessionmaker, robot_id: int, token: str) -> bool:
    """로봇 id와 토큰이 맞는지 확인해요. 토큰이 없거나 발급되지 않은 로봇은 거절해요."""
    if not token:
        return False
    with session_factory() as db:
        robot = db.get(Robot, robot_id)
        if robot is None or not robot.auth_token_hash:
            return False
        return hmac.compare_digest(robot.auth_token_hash, hash_token(token))
