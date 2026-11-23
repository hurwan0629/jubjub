"""실제 네트워크 없이 R2 SDK 요청과 비밀 값 보호를 확인해요."""

import pytest
from botocore.stub import Stubber

from app.core.config import Settings
from app.core.errors import AppError
from app.services import photo_storage


@pytest.fixture
def r2(monkeypatch):
    settings = Settings(
        _env_file=None,
        database_url="postgresql://test:test@localhost/test",
        r2_account_id="test-account",
        r2_endpoint="https://test-account.r2.cloudflarestorage.com",
        r2_bucket_name="test-photos",
        r2_access_key_id="test-access",
        r2_secret_access_key="test-secret",
    )
    monkeypatch.setattr(photo_storage, "get_settings", lambda: settings)
    return photo_storage.R2PhotoStorage(), settings


def test_sdk_put_delete_and_signed_read(r2):
    store, settings = r2
    with Stubber(store.client) as stub:
        stub.add_response(
            "put_object", {}, {"Bucket": "test-photos", "Key": "photo.png", "Body": b"png", "ContentType": "image/png"}
        )
        stub.add_response("delete_object", {}, {"Bucket": "test-photos", "Key": "photo.png"})
        store.put("photo.png", b"png", "image/png")
        url = store.read_url("photo.png")
        assert "X-Amz-Expires=600" in url
        assert "X-Amz-Signature=" in url
        store.delete("photo.png")
        stub.assert_no_pending_responses()
    assert "test-secret" not in repr(settings)
    assert "test-access" not in repr(settings)


def test_sdk_error_is_sanitized(r2):
    store, _ = r2
    with Stubber(store.client) as stub:
        stub.add_client_error("put_object", service_error_code="AccessDenied", service_message="test-secret")
        with pytest.raises(AppError) as error:
            store.put("photo.png", b"png", "image/png")
    assert error.value.status == 503
    assert "test-secret" not in error.value.message


def test_empty_config_fails_without_network(monkeypatch):
    monkeypatch.setattr(
        photo_storage,
        "get_settings",
        lambda: Settings(
            _env_file=None,
            database_url="postgresql://test:test@localhost/test",
            r2_access_key_id="",
            r2_secret_access_key="",
            r2_bucket_name="",
            r2_account_id="",
            r2_endpoint="",
        ),
    )
    with pytest.raises(AppError) as error:
        photo_storage.R2PhotoStorage()
    assert error.value.code == "photo_storage_not_configured"
