"""DB 연결. 라우터에서는 `db: Session = Depends(get_db)` 로 세션을 받아요."""

from collections.abc import Iterator

from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings

# 제약 조건 이름 규칙. Alembic이 마이그레이션을 만들 때 이름이 매번 같게 나와요.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """모든 SQLAlchemy 모델의 부모 클래스 (app/models/)."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


engine = create_engine(
    get_settings().database_url,
    # 끊긴 연결을 쓰기 전에 확인해요 (Supabase는 오래 쉬면 연결을 끊어요)
    pool_pre_ping=True,
    connect_args={
        # Supabase transaction pooler(6543)는 prepared statement를 지원하지 않아서 꺼 둬요
        "prepare_threshold": None,
        # 네트워크가 막혀 있어도 /health가 오래 멈추지 않게 5초 안에 포기해요
        "connect_timeout": 5,
    },
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """요청마다 세션을 하나 열고, 끝나면 닫아요."""
    with SessionLocal() as session:
        yield session
