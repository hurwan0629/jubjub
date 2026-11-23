"""FastAPI 앱 진입점.  실행: uvicorn app.main:app --reload --host 0.0.0.0"""

import asyncio
import contextlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.errors import register_error_handlers
from app.routers import api, auth, health, parks, robot_ws
from app.schemas.common import ErrorResponse
from app.services import robot_link
from app.services.robot_connections import manager as robot_connections

# 모든 API 문서(/docs)에 공통 에러 형식을 보여줘요
ERROR_RESPONSES = {code: {"model": ErrorResponse} for code in (400, 401, 403, 404, 409, 422, 500, 503)}


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """서버가 켜져 있는 동안 로봇 끊김 감시를 백그라운드로 돌려요."""
    settings = get_settings()
    watchdog = None
    if settings.robot_watchdog_enabled:
        watchdog = asyncio.create_task(
            robot_link.run_watchdog(
                SessionLocal,
                robot_connections,
                settings.robot_watchdog_interval_seconds,
                settings.robot_offline_after_seconds,
            )
        )
    yield
    if watchdog is not None:
        watchdog.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await watchdog


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="JUBJUB 서버",
        description='공원 쓰레기 수거 로봇 관리자 앱 API. 에러는 모두 `{"status": 404, "message": "...", "code": "not_found"}` 형식이에요.',
        version="0.1.0",
        responses=ERROR_RESPONSES,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)

    # 공개 API예요. 업무 API는 routers/api.py에 등록해서 인증을 적용해요.
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(parks.router)
    app.include_router(api.router)
    # 로봇 접속 WebSocket. 사용자 JWT가 아니라 로봇 토큰으로 인증해요.
    app.include_router(robot_ws.router)

    return app


app = create_app()
