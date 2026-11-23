"""로봇 토큰을 한 번만 발급하고 해시만 보관해요."""

import hashlib
import secrets
from datetime import UTC, datetime

from app.models import Robot


def issue_token(robot: Robot) -> str:
    token = secrets.token_urlsafe(48)
    robot.auth_token_hash = hashlib.sha256(token.encode()).hexdigest()
    robot.token_issued_at = datetime.now(UTC)
    return token


def token_matches(robot: Robot, token: str) -> bool:
    return bool(robot.auth_token_hash) and secrets.compare_digest(
        robot.auth_token_hash, hashlib.sha256(token.encode()).hexdigest()
    )
