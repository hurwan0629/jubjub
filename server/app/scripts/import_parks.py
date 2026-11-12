"""검증한 서울 공원 경계를 Supabase에 적재해요."""

import argparse
import json
from pathlib import Path

from app.core.db import SessionLocal
from app.services.park_import import import_catalog


def main() -> None:
    parser = argparse.ArgumentParser(description="서울 공원 목록을 DB에 적재해요")
    parser.add_argument("path", type=Path, nargs="?", default=Path("data/seoul_parks.json"))
    parser.add_argument("--replace", action="store_true", help="이번 목록에서 빠진 기존 항목은 삭제 대신 비활성화해요")
    args = parser.parse_args()
    document = json.loads(args.path.read_text(encoding="utf-8"))
    with SessionLocal() as db:
        count = import_catalog(db, document, replace=args.replace)
    print(f"공원 경계 {count}개를 적재했어요. 같은 원본 키의 공원 ID는 유지해요.")


if __name__ == "__main__":
    main()
