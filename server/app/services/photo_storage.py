"""비공개 R2 사진을 저장하고 임시 조회 주소를 발급해요."""

from functools import lru_cache
from urllib.parse import urlparse

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import get_settings
from app.core.errors import AppError

URL_SECONDS = 600


class R2PhotoStorage:
    def __init__(self):
        settings = get_settings()
        endpoint = settings.r2_endpoint or (
            f"https://{settings.r2_account_id}.r2.cloudflarestorage.com" if settings.r2_account_id else ""
        )
        parsed = urlparse(endpoint)
        if (
            not settings.r2_bucket_name
            or not settings.r2_access_key_id.get_secret_value()
            or not settings.r2_secret_access_key.get_secret_value()
            or parsed.scheme != "https"
            or not (parsed.hostname or "").endswith(".r2.cloudflarestorage.com")
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path not in ("", "/")
        ):
            raise AppError(503, "R2 사진 저장소 설정을 확인해 주세요", code="photo_storage_not_configured")
        self.bucket = settings.r2_bucket_name
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            region_name="auto",
            aws_access_key_id=settings.r2_access_key_id.get_secret_value(),
            aws_secret_access_key=settings.r2_secret_access_key.get_secret_value(),
            config=Config(
                signature_version="s3v4",
                connect_timeout=5,
                read_timeout=15,
                retries={"max_attempts": 2},
                s3={"addressing_style": "path"},
            ),
        )

    def put(self, key: str, data: bytes, content_type: str):
        try:
            self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)
        except (BotoCoreError, ClientError):
            raise AppError(503, "사진 저장소에 연결하지 못했어요", code="photo_storage_unavailable") from None

    def delete(self, key: str):
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except (BotoCoreError, ClientError):
            raise AppError(503, "사진을 정리하지 못했어요", code="photo_storage_unavailable") from None

    def read_url(self, key: str) -> str:
        try:
            return self.client.generate_presigned_url(
                "get_object", Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=URL_SECONDS
            )
        except (BotoCoreError, ClientError):
            raise AppError(503, "사진 주소를 만들지 못했어요", code="photo_storage_unavailable") from None


@lru_cache
def get_photo_storage() -> R2PhotoStorage:
    return R2PhotoStorage()
