"""FastAPI 앱 진입점.  실행: uvicorn app.main:app --reload --host 0.0.0.0"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.routers import health
from app.schemas.common import ErrorResponse

# 모든 API 문서(/docs)에 공통 에러 형식을 보여줘요
ERROR_RESPONSES = {code: {"model": ErrorResponse} for code in (400, 401, 404, 422, 500)}


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="JUBJUB 서버",
        description='공원 쓰레기 수거 로봇 관리자 앱 API. 에러는 모두 `{"status": 404, "message": "...", "code": "not_found"}` 형식이에요.',
        version="0.1.0",
        responses=ERROR_RESPONSES,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)

    # 라우터는 여기에 한 줄씩 추가해요
    app.include_router(health.router)

    return app


app = create_app()
