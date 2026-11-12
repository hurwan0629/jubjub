"""에러 응답 형식 통일.

모든 에러는 {"status": 404, "message": "사람이 읽을 문장", "code": "not_found"} 모양으로 내려가요.
앱(app/src/api/client.ts)의 ApiError가 status·message를 읽어요.

서비스·라우터에서는 AppError를 던지면 돼요:
    raise AppError(404, "순찰 지점을 찾을 수 없어요", code="point_not_found")
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

DEFAULT_CODE = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    500: "internal_error",
    503: "service_unavailable",
}


class AppError(Exception):
    def __init__(
        self,
        status: int,
        message: str,
        code: str | None = None,
        details: object = None,
        headers: dict[str, str] | None = None,
    ):
        self.status = status
        self.message = message
        self.code = code or DEFAULT_CODE.get(status, "error")
        self.details = details
        self.headers = headers


def error_body(status: int, message: str, code: str | None = None, details: object = None) -> dict:
    body: dict = {"status": status, "message": message, "code": code or DEFAULT_CODE.get(status, "error")}
    if details is not None:
        body["details"] = details
    return body


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            error_body(exc.status, exc.message, exc.code, exc.details), status_code=exc.status, headers=exc.headers
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        message = exc.detail if isinstance(exc.detail, str) else "요청을 처리하지 못했어요"
        # 없는 주소·메서드는 Starlette가 영어 기본 문구를 넣어서 한국어로 바꿔요
        message = {
            "Not Found": "요청한 주소를 찾을 수 없어요",
            "Method Not Allowed": "허용되지 않는 요청 방식이에요",
        }.get(message, message)
        return JSONResponse(error_body(exc.status_code, message), status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [{"field": ".".join(str(p) for p in e["loc"]), "reason": e["msg"]} for e in exc.errors()]
        return JSONResponse(error_body(422, "입력값을 확인해 주세요", details=details), status_code=422)

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("처리하지 못한 에러", exc_info=exc)
        return JSONResponse(error_body(500, "서버에서 문제가 생겼어요"), status_code=500)
