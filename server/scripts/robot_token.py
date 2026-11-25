"""로봇 접속 토큰을 발급해요 (개발용 도구).

총관리자 API `POST /admin/robots/{robot_id}/token` 과 같은 방식(app/services/robot_tokens.py)으로 발급해요.
웹 화면 없이 시뮬레이터를 시험할 때 써요.

실행 (server 폴더에서):
    python scripts/robot_token.py --list                         로봇 목록과 토큰 발급 여부
    python scripts/robot_token.py --robot-id 1                   1번 로봇에 토큰 발급 (이전 토큰은 무효)
    python scripts/robot_token.py --create "시뮬레이터 1" --serial SIM-001   로봇을 새로 만들고 토큰 발급

토큰 원문은 지금 한 번만 보여줘요. DB에는 해시만 저장돼서 다시 볼 수 없어요. 잃어버리면 다시 발급해요.
.env 의 DATABASE_URL(공용 Supabase)에 바로 저장되니 팀에 알리고 쓰세요.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.core.db import SessionLocal  # noqa: E402
from app.models import Robot  # noqa: E402
from app.services.robot_tokens import issue_token  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="로봇 접속 토큰 발급")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--list", action="store_true", help="로봇 목록 보기")
    group.add_argument("--robot-id", type=int, help="토큰을 발급할 로봇 id")
    group.add_argument("--create", metavar="NAME", help="새 로봇 이름 (--serial 필요)")
    parser.add_argument("--serial", help="새 로봇 시리얼 번호 (중복 불가)")
    args = parser.parse_args()

    with SessionLocal() as db:
        if args.list:
            for robot in db.scalars(select(Robot).order_by(Robot.id)):
                token = "발급됨" if robot.auth_token_hash else "-"
                print(f"{robot.id:>4}  {robot.name:<20} {robot.serial_no:<16} 공원={robot.park_id}  토큰={token}")
            return 0

        if args.create:
            if not args.serial:
                parser.error("--create 에는 --serial 이 필요해요")
            robot = Robot(name=args.create, serial_no=args.serial)
            db.add(robot)
            db.flush()
        else:
            robot = db.get(Robot, args.robot_id)
            if robot is None:
                print(f"{args.robot_id}번 로봇이 없어요. --list 로 확인해 주세요", file=sys.stderr)
                return 1

        token = issue_token(robot)
        db.commit()
        print(f"로봇 {robot.id} ({robot.name}) 토큰을 발급했어요. 지금 한 번만 보여줘요:\n")
        print(f"  ROBOT_ID={robot.id}")
        print(f"  ROBOT_TOKEN={token}\n")
        print("로봇(시뮬레이터) 설정에 넣어 주세요. 이전 토큰으로 연결된 로봇은 다음 메시지에서 끊겨요.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
