"""탐지 사진 업로드와 임시 조회 URL을 제공해요."""

from typing import Annotated

from fastapi import APIRouter, Path, Request, Response
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.core.errors import AppError
from app.routers.patrol import DB, Admin
from app.services import photos

router = APIRouter(tags=["photos"])
DetectionID = Annotated[int, Path(ge=1, le=9223372036854775807)]


@router.put("/detections/{detection_id}/photo", summary="탐지 사진을 비공개 R2에 저장")
async def upload_photo(detection_id: DetectionID, request: Request, db: DB, user: Admin):
    limit = get_settings().photo_max_bytes
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > limit:
            raise AppError(413, "사진 파일이 너무 커요", code="photo_too_large")
        data.extend(chunk)
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    return await run_in_threadpool(photos.upload, db, user, detection_id, bytes(data), content_type)


@router.get("/detections/{detection_id}/photo", summary="담당 공원 사진의 10분 유효 주소 조회")
def read_photo(detection_id: DetectionID, response: Response, db: DB, user: Admin):
    response.headers["Cache-Control"] = "no-store"
    return photos.read(db, user, detection_id)
