"""R2 사진의 업로드·소유권·장애 처리를 검증해요."""

from datetime import UTC, datetime
from io import BytesIO

import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.models import Detection, Park, Robot
from tests import patrol_fixtures
from tests.patrol_fixtures import choose

setup_client = patrol_fixtures.setup_client


@pytest.fixture
def photo_setup(setup_client, monkeypatch):
    from app.services import photo_storage

    client, db = setup_client
    choose(client)
    park = db.scalar(select(Park).where(Park.user_id == 1))
    robot = Robot(name="사진 로봇", serial_no="photo-test", park_id=park.id, assigned_at=datetime.now(UTC))
    db.add(robot)
    db.flush()
    detection = Detection(
        park_id=park.id, robot_id=robot.id, material="plastic", slam_x=0, slam_y=0, lat=37.5, lng=127, image_path=""
    )
    db.add(detection)
    db.commit()
    objects = {}

    class Store:
        def put(self, key, data, content_type):
            objects[key] = data

        def delete(self, key):
            objects.pop(key, None)

        def read_url(self, key):
            return "https://example.invalid/" + key

    store = Store()
    monkeypatch.setattr(photo_storage, "get_photo_storage", lambda: store)
    buffer = BytesIO()
    Image.new("RGB", (2, 2)).save(buffer, format="PNG")
    return client, db, detection, objects, buffer.getvalue(), store


def test_upload_persists_key_and_read_returns_temporary_url(photo_setup):
    client, db, item, objects, png, _ = photo_setup
    response = client.put(f"/detections/{item.id}/photo", content=png, headers={"Content-Type": "image/png"})
    assert response.status_code == 200, response.text
    db.refresh(item)
    assert item.image_path.startswith(f"parks/{item.park_id}/detections/{item.id}/")
    assert objects[item.image_path] == png
    result = client.get(f"/detections/{item.id}/photo")
    assert result.status_code == 200
    assert result.json()["expiresIn"] == 600
    assert result.headers["cache-control"] == "no-store"
    assert result.json()["url"].endswith(item.image_path)


def test_invalid_and_oversized_images_never_reach_storage(photo_setup):
    client, _, item, objects, _, _ = photo_setup
    for body, expected in [(b"not an image", 422), (b"x" * (5 * 1024 * 1024 + 1), 413)]:
        response = client.put(f"/detections/{item.id}/photo", content=body, headers={"Content-Type": "image/png"})
        assert response.status_code == expected
    assert not objects


def test_other_manager_cannot_upload_or_read(photo_setup):
    from datetime import UTC, datetime

    from app.core.security import create_access_token

    client, db, item, objects, png, _ = photo_setup
    db.add(Park(user_id=2, catalog_id=2, status="approved", reviewed_by=10, reviewed_at=datetime.now(UTC)))
    db.commit()
    token, _ = create_access_token(2)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "image/png"}
    assert client.put(f"/detections/{item.id}/photo", content=png, headers=headers).status_code == 404
    assert client.get(f"/detections/{item.id}/photo", headers=headers).status_code == 404
    assert not objects


def test_photo_is_immutable_and_requires_authentication(photo_setup):
    client, _, item, objects, png, _ = photo_setup
    path = f"/detections/{item.id}/photo"
    assert client.put(path, content=png, headers={"Content-Type": "image/png"}).status_code == 200
    assert client.put(path, content=png, headers={"Content-Type": "image/png"}).status_code == 409
    assert len(objects) == 1
    client.headers.pop("Authorization")
    assert client.get(path).status_code == 401
    assert client.put(path, content=png, headers={"Content-Type": "image/png"}).status_code == 401


def test_db_failure_removes_new_object_and_keeps_old_path(photo_setup, monkeypatch):
    client, db, item, objects, png, _ = photo_setup
    item_id = item.id

    def fail():
        raise SQLAlchemyError("test failure")

    monkeypatch.setattr(db, "commit", fail)
    assert (
        client.put(f"/detections/{item_id}/photo", content=png, headers={"Content-Type": "image/png"}).status_code
        == 503
    )
    assert not objects
    db.refresh(item)
    assert item.image_path == ""


def test_storage_failure_does_not_change_db(photo_setup, monkeypatch):
    from app.core.errors import AppError

    client, db, item, _, png, store = photo_setup

    def fail(*args):
        raise AppError(503, "사진 저장에 실패했어요", code="photo_storage_unavailable")

    monkeypatch.setattr(store, "put", fail)
    assert (
        client.put(f"/detections/{item.id}/photo", content=png, headers={"Content-Type": "image/png"}).status_code
        == 503
    )
    db.refresh(item)
    assert item.image_path == ""


def test_missing_or_legacy_path_never_gets_signed(photo_setup):
    client, db, item, _, _, _ = photo_setup
    for path in ["", "https://foreign.example/photo.jpg", "parks/999/detections/1/private.png", "../../secret"]:
        item.image_path = path
        db.commit()
        assert client.get(f"/detections/{item.id}/photo").status_code == 404


def test_concurrent_upload_does_not_replace_winning_photo(photo_setup, monkeypatch):
    client, db, item, objects, png, store = photo_setup
    winner = f"parks/{item.park_id}/detections/{item.id}/{'a' * 32}.png"
    original_put = store.put

    def competing_put(key, data, content_type):
        from sqlalchemy import update

        original_put(key, data, content_type)
        db.execute(
            update(Detection).where(Detection.id == item.id).values(image_path=winner),
            execution_options={"synchronize_session": False},
        )
        db.commit()

    monkeypatch.setattr(store, "put", competing_put)
    response = client.put(f"/detections/{item.id}/photo", content=png, headers={"Content-Type": "image/png"})
    assert response.status_code == 409
    db.refresh(item)
    assert item.image_path == winner
    assert not objects


def test_truncated_jpeg_is_rejected_before_storage(photo_setup):
    client, _, item, objects, _, _ = photo_setup
    buffer = BytesIO()
    Image.new("RGB", (100, 100)).save(buffer, format="JPEG")
    response = client.put(
        f"/detections/{item.id}/photo", content=buffer.getvalue()[:-2], headers={"Content-Type": "image/jpeg"}
    )
    assert response.status_code == 422
    assert not objects
