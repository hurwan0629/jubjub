"""에러 응답이 항상 {status, message, code} 모양인지 확인해요."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.errors import AppError
from app.main import app

router = APIRouter(prefix="/_test")


class Body(BaseModel):
    name: str


@router.get("/app-error")
def raise_app_error():
    raise AppError(404, "순찰 지점을 찾을 수 없어요", code="point_not_found")


@router.post("/validate")
def validate(body: Body):
    return body


@router.get("/boom")
def boom():
    raise RuntimeError("예상 못 한 에러")


app.include_router(router)


def test_app_error(client):
    res = client.get("/_test/app-error")
    assert res.status_code == 404
    assert res.json() == {"status": 404, "message": "순찰 지점을 찾을 수 없어요", "code": "point_not_found"}


def test_unknown_path(client):
    res = client.get("/no-such-path")
    assert res.status_code == 404
    assert res.json()["status"] == 404
    assert res.json()["code"] == "not_found"


def test_validation_error(client):
    res = client.post("/_test/validate", json={})
    assert res.status_code == 422
    body = res.json()
    assert body["code"] == "validation_error"
    assert body["details"][0]["field"] == "body.name"


def test_unexpected_error(client):
    res = client.get("/_test/boom")
    assert res.status_code == 500
    assert res.json() == {"status": 500, "message": "서버에서 문제가 생겼어요", "code": "internal_error"}


def test_cors_allows_expo_web_and_lan(client):
    for origin in ("http://localhost:8081", "http://192.168.0.23:8081"):
        res = client.options("/health", headers={"Origin": origin, "Access-Control-Request-Method": "GET"})
        assert res.headers.get("access-control-allow-origin") == origin

    res = client.options(
        "/health", headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "GET"}
    )
    assert "access-control-allow-origin" not in res.headers
