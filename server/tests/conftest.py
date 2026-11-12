"""테스트 공통 준비. 기본 테스트는 실제 DB 없이 돌아가요 (get_db를 가짜 세션으로 바꿔요)."""

import os

# app을 import 하기 전에 넣어야 .env 가 없어도 설정이 만들어져요
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

from collections.abc import Iterator  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.db import get_db  # noqa: E402
from app.main import app  # noqa: E402


class FakeSession:
    """execute만 흉내 내는 가짜 세션. fail=True면 DB 장애처럼 에러를 던져요."""

    def __init__(self, fail: bool = False):
        self.fail = fail

    def execute(self, *_args, **_kwargs):
        if self.fail:
            from sqlalchemy.exc import OperationalError

            raise OperationalError("SELECT 1", {}, Exception("연결 실패"))
        return None


@pytest.fixture
def fake_db() -> Iterator[FakeSession]:
    session = FakeSession()
    app.dependency_overrides[get_db] = lambda: session
    yield session
    app.dependency_overrides.clear()


@pytest.fixture
def client(fake_db: FakeSession) -> TestClient:
    # raise_server_exceptions=False: 500 에러도 실제처럼 응답으로 받아 형식을 확인해요
    return TestClient(app, raise_server_exceptions=False)
