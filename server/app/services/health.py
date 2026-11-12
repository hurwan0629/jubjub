"""서버·DB 상태 확인. 비즈니스 로직은 이렇게 services/ 에 두고 라우터는 얇게 유지해요."""

import logging

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.errors import AppError

logger = logging.getLogger(__name__)


def check_db(db: Session) -> None:
    """DB에 SELECT 1 을 보내 보고, 안 되면 503을 던져요."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        logger.warning("DB 연결 확인 실패: %s", exc)
        raise AppError(
            503, "DB에 연결하지 못했어요. .env 의 DATABASE_URL을 확인해 주세요", code="db_unavailable"
        ) from exc
