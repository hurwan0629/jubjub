"""FastAPI 앱 진입점.  실행: uvicorn app.main:app --reload --host 0.0.0.0"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.routers import api, auth, health, parks
from app.routers.robot_protocol import socket_router
from app.schemas.common import ErrorResponse
from app.services.robot_connections import RobotConnections
from app.services.robot_scheduler import scheduler_loop

# 모든 API 문서(/docs)에 공통 에러 형식을 보여줘요
ERROR_RESPONSES = {code: {"model": ErrorResponse} for code in (400, 401, 403, 404, 409, 422, 500, 503, 504)}


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app):
        worker = (
            asyncio.create_task(scheduler_loop(app.state.robot_connections))
            if settings.robot_schedule_enabled
            else None
        )
        try:
            yield
        finally:
            if worker:
                worker.cancel()
                await asyncio.gather(worker, return_exceptions=True)
            for robot_id in list(app.state.robot_connections.connections):
                await app.state.robot_connections.disconnect(robot_id, 1001)

    app = FastAPI(
        title="JUBJUB 서버",
        description='공원 쓰레기 수거 로봇 관리자 앱 API. 에러는 모두 `{"status": 404, "message": "...", "code": "not_found"}` 형식이에요.',
        version="0.1.0",
        responses=ERROR_RESPONSES,
        lifespan=lifespan,
    )
    app.state.robot_connections = RobotConnections()

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
    app.include_router(socket_router)

    return app


app = create_app()
