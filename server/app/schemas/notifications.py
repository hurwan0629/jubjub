"""알림 수신함과 Expo 기기 토큰 API 계약이에요."""

import re
from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, Field, SecretStr, field_validator

from app.schemas.parks import LatLng, ParkSchema


class NotificationResponse(ParkSchema):
    id: str
    type: str
    title: str
    body: str
    park_id: str | None
    robot_id: str | None
    position: LatLng | None
    occurred_at: datetime
    is_read: bool


class UnreadCountResponse(ParkSchema):
    count: int = Field(ge=0)


class PushTokenReference(ParkSchema):
    model_config = ConfigDict(extra="forbid")
    token: SecretStr = Field(min_length=1, max_length=4096)

    @field_validator("token")
    @classmethod
    def _valid_token(cls, value: SecretStr) -> SecretStr:
        if not re.fullmatch(r"(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]", value.get_secret_value()):
            raise ValueError("Expo 푸시 토큰을 입력해 주세요")
        return value


class PushTokenInput(PushTokenReference):
    platform: Literal["android", "ios"]


class PushTokenResponse(ParkSchema):
    id: str
    platform: Literal["android", "ios"]
    is_active: bool
    created_at: datetime
    updated_at: datetime
