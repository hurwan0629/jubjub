"""탐지 사진을 담당 공원에 한정해서 저장·조회해요."""

import logging
import re
import warnings
from io import BytesIO
from uuid import uuid4

from PIL import Image, UnidentifiedImageError
from sqlalchemy import select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.models import Detection, Park, User
from app.services import photo_storage

logger = logging.getLogger(__name__)


def _detection(db: Session, user: User, detection_id: int, *, allow_admin=False) -> Detection:
    try:
        statement = select(Detection).join(Park, Detection.park_id == Park.id).where(Detection.id == detection_id)
        if not (allow_admin and user.role == "super_admin"):
            statement = statement.where(Park.user_id == user.id, Park.status == "approved")
        item = db.scalar(statement)
    except SQLAlchemyError:
        db.rollback()
        raise AppError(503, "사진 정보를 조회하지 못했어요", code="photo_db_unavailable") from None
    if item is None:
        raise AppError(404, "이 공원의 탐지 정보를 찾을 수 없어요", code="detection_not_found")
    return item


def _valid_key(item: Detection) -> bool:
    return bool(
        re.fullmatch(rf"parks/{item.park_id}/detections/{item.id}/[0-9a-f]{{32}}\.(png|jpg)", item.image_path)
    ) or (item.image_path == f"detections/{item.client_detection_id}.jpg")


def validate_image(data: bytes, content_type: str) -> str:
    if len(data) > get_settings().photo_max_bytes:
        raise AppError(413, "사진 파일이 너무 커요", code="photo_too_large")
    formats = {"image/jpeg": ("JPEG", "jpg"), "image/png": ("PNG", "png")}
    if content_type not in formats:
        raise AppError(415, "JPEG 또는 PNG 사진을 보내 주세요", code="photo_type_unsupported")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                if image.format != formats[content_type][0] or image.width * image.height > 20_000_000:
                    raise ValueError("지원하지 않는 이미지예요")
                image.verify()
            # JPEG verify는 픽셀을 읽지 않아서 잘린 파일도 통과할 수 있어요.
            with Image.open(BytesIO(data)) as image:
                image.load()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise AppError(422, "올바른 사진 파일을 보내 주세요", code="photo_invalid") from None
    return formats[content_type][1]


def upload(db: Session, user: User, detection_id: int, data: bytes, content_type: str):
    item = _detection(db, user, detection_id)
    extension = validate_image(data, content_type)
    if _valid_key(item):
        raise AppError(409, "이미 사진이 등록된 탐지예요", code="photo_already_exists")
    key = f"parks/{item.park_id}/detections/{item.id}/{uuid4().hex}.{extension}"
    original_path = item.image_path
    store = photo_storage.get_photo_storage()
    store.put(key, data, content_type)
    try:
        result = db.execute(
            update(Detection)
            .where(
                Detection.id == detection_id,
                Detection.image_path == original_path,
                Detection.park_id.in_(select(Park.id).where(Park.user_id == user.id, Park.status == "approved")),
            )
            .values(image_path=key),
            execution_options={"synchronize_session": False},
        )
        if result.rowcount != 1:
            raise AppError(409, "사진 정보가 변경되었어요. 다시 조회해 주세요", code="photo_conflict")
        db.commit()
    except (SQLAlchemyError, AppError) as exc:
        db.rollback()
        try:
            store.delete(key)
        except AppError:
            logger.warning("DB 저장 실패 후 R2 사진 정리에 실패했어요")
        if isinstance(exc, AppError):
            raise
        raise AppError(503, "사진 정보를 저장하지 못했어요", code="photo_db_unavailable") from None
    return {"detectionId": str(detection_id), "imagePath": key}


def read(db: Session, user: User, detection_id: int):
    item = _detection(db, user, detection_id, allow_admin=True)
    if not _valid_key(item):
        raise AppError(404, "등록된 R2 사진이 없어요", code="photo_not_found")
    return {"url": photo_storage.get_photo_storage().read_url(item.image_path), "expiresIn": photo_storage.URL_SECONDS}
