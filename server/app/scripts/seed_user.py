"""관리자 시드 계정을 만들어요. 실행: python -m app.scripts.seed_user --help"""

import argparse
from collections.abc import Sequence
from getpass import getpass

from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.core.db import SessionLocal
from app.core.errors import AppError
from app.schemas.auth import RegisterRequest
from app.services.auth import register_user


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="관리자 시드 계정을 만들어요. 비밀번호는 숨겨 입력받아요.")
    parser.add_argument("--login-id", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--phone", required=True)
    parser.add_argument("--email", required=True)
    args = parser.parse_args(argv)
    password = getpass("비밀번호: ")
    if password != getpass("비밀번호 확인: "):
        print("비밀번호가 서로 달라요. 계정을 만들지 않았어요.")
        return 1
    try:
        body = RegisterRequest(password=password, **vars(args))
        with SessionLocal() as db:
            register_user(db, body)
    except ValidationError:
        print("입력값을 확인해 주세요. 가입 API와 같은 아이디·비밀번호·전화번호·이메일 규칙을 사용해요.")
        return 1
    except AppError as exc:
        print(exc.message)
        return 1
    except SQLAlchemyError:
        print("DB에 계정을 저장하지 못했어요. 연결 설정과 마이그레이션 상태를 확인해 주세요.")
        return 1
    print("관리자 계정을 만들었어요. 이 계정으로 로그인할 수 있어요.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
