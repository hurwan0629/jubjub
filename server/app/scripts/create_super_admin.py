"""총관리자 계정을 콘솔에서 만들어요. 공개 가입 API로는 권한을 부여하지 않아요."""

import argparse
import re
from collections.abc import Sequence
from getpass import getpass

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import User


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="총관리자를 만들어요. 비밀번호는 숨겨 입력받아요.")
    parser.add_argument("--login-id", required=True)
    parser.add_argument("--name", default="총관리자")
    parser.add_argument("--email", default=None)
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[A-Za-z0-9]{4,16}", args.login_id) or not args.name.strip():
        print("아이디는 영문·숫자 4~16자이고 이름이 필요해요.")
        return 1
    password = getpass("비밀번호: ")
    if password != getpass("비밀번호 확인: "):
        print("비밀번호가 서로 달라요.")
        return 1
    if not 8 <= len(password) <= 128 or not re.search(r"[A-Za-z]", password) or not re.search(r"[0-9]", password):
        print("비밀번호는 영문·숫자를 포함한 8~128자로 입력해 주세요.")
        return 1
    email = args.email or f"{args.login_id.lower()}@admin.invalid"
    try:
        with SessionLocal() as db:
            if db.scalar(select(User.id).where((User.login_id == args.login_id) | (User.email == email))):
                print("이미 있는 계정이나 이메일은 변경하지 않아요.")
                return 1
            db.add(
                User(
                    login_id=args.login_id,
                    password_hash=hash_password(password),
                    name=args.name.strip(),
                    phone="",
                    email=email,
                    role="super_admin",
                )
            )
            db.commit()
    except SQLAlchemyError:
        print("총관리자를 만들지 못했어요. DB 연결과 마이그레이션을 확인해 주세요.")
        return 1
    print("총관리자 계정을 만들었어요.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
