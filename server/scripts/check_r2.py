"""작은 임시 사진으로 R2 업로드·서명 URL 조회·삭제를 확인해요. DB는 사용하지 않아요."""

import sys
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image  # noqa: E402

from app.services.photo_storage import get_photo_storage  # noqa: E402


def main() -> int:
    key = f"connection-check/{uuid4().hex}.png"
    store = None
    attempted = False
    result = 1
    try:
        store = get_photo_storage()
        buffer = BytesIO()
        Image.new("RGB", (1, 1)).save(buffer, format="PNG")
        data = buffer.getvalue()
        attempted = True
        store.put(key, data, "image/png")
        with urlopen(store.read_url(key), timeout=20) as response:
            if response.read(len(data) + 1) != data:
                raise ValueError("내용 불일치")
        print("R2 upload and signed URL read: OK")
        result = 0
    except Exception as exc:
        # SDK 예외에는 주소나 자격 증명이 포함될 수 있어 예외 본문은 출력하지 않아요.
        print(f"R2 check failed ({type(exc).__name__}); verify credentials, bucket and network.")
    finally:
        if attempted and store is not None:
            try:
                store.delete(key)
                print("Temporary object cleanup: OK")
            except Exception:
                print(f"Temporary object cleanup failed; remove only this object manually: {key}")
                result = 1
    return result


if __name__ == "__main__":
    raise SystemExit(main())
