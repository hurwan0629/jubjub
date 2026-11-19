"""커밋된 알림만 Expo로 보내고 티켓·영수증·재시도를 관리해요."""

import json
import logging
import re
from datetime import UTC, datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.models import Notification, NotificationPushDelivery, Park, PushToken, User

logger = logging.getLogger(__name__)
PERMANENT_ERRORS = {"DeviceNotRegistered", "MessageTooBig", "InvalidCredentials", "MismatchSenderId"}


class PushServiceError(Exception):
    def __init__(self, code: str, *, retryable: bool):
        self.code, self.retryable = code, retryable
        super().__init__(code)


def _post(path: str, payload: dict) -> dict:
    settings = get_settings()
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    access_token = settings.expo_push_access_token.get_secret_value()
    if access_token:
        headers["Authorization"] = "Bearer " + access_token
    request = Request(
        settings.expo_push_base_url.rstrip("/") + path,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urlopen(request, timeout=settings.expo_push_timeout_seconds) as response:
            raw = response.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise PushServiceError("invalid_response", retryable=True)
        result = json.loads(raw)
        if not isinstance(result, dict):
            raise PushServiceError("invalid_response", retryable=True)
        return result
    except HTTPError as exc:
        # 응답 본문에는 토큰이 포함될 수 있어 저장·로그에 남기지 않아요.
        status = exc.code
        exc.close()
        raise PushServiceError(f"http_{status}", retryable=status == 429 or status >= 500) from None
    except (URLError, TimeoutError, OSError):
        raise PushServiceError("network_error", retryable=True) from None
    except (ValueError, UnicodeError):
        raise PushServiceError("invalid_response", retryable=True) from None


def _code(result: dict) -> str:
    details = result.get("details")
    code = details.get("error") if isinstance(details, dict) else None
    return code if code in PERMANENT_ERRORS | {"MessageRateExceeded"} else "expo_error"


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _retry(job: NotificationPushDelivery, code: str, now: datetime, *, retryable: bool):
    job.last_error = code
    if job.status == "submitted":
        # 접수된 알림은 재전송하지 않고 영수증만 다시 확인해요.
        if not retryable or job.submitted_at is None or now - _utc(job.submitted_at) >= timedelta(hours=24):
            job.status = "failed"
        else:
            job.next_attempt_at = now + timedelta(minutes=2)
    elif retryable and job.attempts < 5:
        job.next_attempt_at = now + timedelta(seconds=min(900, 30 * 2 ** (job.attempts - 1)))
    else:
        job.status = "failed"


def _process(db, job: NotificationPushDelivery, now: datetime):
    notification = db.get(Notification, job.notification_id)
    # 토큰 재등록·해제와 발송을 직렬화해 계정이 바뀐 기기로 보내지 않아요.
    token = db.scalar(
        select(PushToken)
        .where(PushToken.id == job.push_token_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if notification is None or token is None or not token.is_active or token.user_id != notification.user_id:
        job.status, job.last_error = "cancelled", "device_unavailable"
        return
    user = db.get(User, notification.user_id)
    approved = user is not None and (
        user.role == "super_admin"
        or db.scalar(select(Park.id).where(Park.user_id == user.id, Park.status == "approved")) is not None
    )
    if not approved:
        job.status, job.last_error = "cancelled", "recipient_unavailable"
        return
    if not re.fullmatch(r"(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]", token.token):
        job.status, job.last_error = "failed", "invalid_token"
        return
    try:
        if job.status == "pending":
            job.attempts += 1
            result = _post(
                "/send",
                {
                    "to": token.token,
                    "sound": "default",
                    "title": "JUBJUB",
                    "body": "새 알림이 도착했어요. 앱에서 확인해 주세요.",
                    "data": {"notificationId": str(notification.id), "type": notification.notification_type},
                },
            ).get("data")
            if (
                isinstance(result, dict)
                and result.get("status") == "ok"
                and isinstance(result.get("id"), str)
                and result["id"]
            ):
                job.status, job.ticket_id, job.submitted_at = "submitted", result["id"], now
                job.next_attempt_at, job.last_error = now + timedelta(minutes=15), None
                return
        else:
            job.receipt_checks += 1
            receipts = _post("/getReceipts", {"ids": [job.ticket_id]}).get("data")
            result = receipts.get(job.ticket_id) if isinstance(receipts, dict) else None
            if isinstance(result, dict) and result.get("status") == "ok":
                job.status, job.last_error = "delivered", None
                return
        if not isinstance(result, dict):
            raise PushServiceError(
                "receipt_unavailable" if job.status == "submitted" else "invalid_response", retryable=True
            )
        code = _code(result)
        if job.status == "submitted" and code == "MessageRateExceeded":
            job.status, job.ticket_id, job.submitted_at = "pending", None, None
        if code == "DeviceNotRegistered":
            token.is_active = False
        _retry(job, code, now, retryable=code not in PERMANENT_ERRORS)
    except PushServiceError as exc:
        _retry(job, exc.code, now, retryable=exc.retryable)


def dispatch_pending_pushes(session_factory=None, *, limit: int = 50) -> int:
    if not get_settings().expo_push_enabled:
        return 0
    factory = session_factory or SessionLocal
    processed = 0
    try:
        for _ in range(limit):
            with factory() as db, db.begin():
                now = datetime.now(UTC)
                job = db.scalar(
                    select(NotificationPushDelivery)
                    .where(
                        NotificationPushDelivery.status.in_(["pending", "submitted"]),
                        NotificationPushDelivery.next_attempt_at <= now,
                    )
                    .order_by(NotificationPushDelivery.next_attempt_at, NotificationPushDelivery.id)
                    .limit(1)
                    .with_for_update(skip_locked=True)
                )
                if job is None:
                    break
                _process(db, job, now)
                processed += 1
    except SQLAlchemyError:
        # 발송 실패 때문에 이미 커밋된 배정 API가 실패한 것처럼 보이지 않게 해요.
        logger.warning("푸시 대기열 처리 중 DB 오류가 발생했어요")
    return processed
