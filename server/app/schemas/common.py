"""여러 API가 같이 쓰는 응답 모양."""

from pydantic import BaseModel


class ErrorResponse(BaseModel):
    status: int
    message: str
    code: str
    details: object | None = None
