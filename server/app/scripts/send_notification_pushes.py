"""대기 푸시와 Expo 영수증을 처리해요. --watch로 주기 실행해요."""

import argparse
import time

from app.services.notification_push import dispatch_pending_pushes


def main():
    parser = argparse.ArgumentParser(description="Expo 푸시 발송·재시도·영수증 확인")
    parser.add_argument("--watch", action="store_true")
    parser.add_argument("--interval", type=int, default=30)
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()
    if not 1 <= args.limit <= 100 or not 1 <= args.interval <= 60:
        parser.error("limit는 1~100, interval은 1~60초로 지정해 주세요")
    try:
        while True:
            dispatch_pending_pushes(limit=args.limit)
            if not args.watch:
                break
            time.sleep(args.interval)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
