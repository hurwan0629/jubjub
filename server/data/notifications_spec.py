"""알림 API 명세의 예시와 검토한 업무 규칙이에요."""


def extend_notification_spec(examples, add):
    examples.update(
        {
            "NotificationResponse": {
                "id": "41",
                "type": "robotAssignmentApproved",
                "title": "로봇 배정이 완료되었어요",
                "body": "예시공원에 로봇 2대를 배정했어요",
                "parkId": "5",
                "robotId": None,
                "position": None,
                "occurredAt": "2026-11-18T07:00:00Z",
                "isRead": False,
            },
            "UnreadCountResponse": {"count": 2},
            "PushTokenReference": {"token": "ExpoPushToken[example-device-token]"},
            "PushTokenInput": {"token": "ExpoPushToken[example-device-token]", "platform": "android"},
            "PushTokenResponse": {
                "id": "7",
                "platform": "android",
                "isActive": True,
                "createdAt": "2026-11-18T07:00:00Z",
                "updatedAt": "2026-11-18T07:05:00Z",
            },
        }
    )
    add(
        "GET",
        "/notifications",
        "내 알림 목록",
        "자신의 알림만 발생 시각·ID 내림차순으로 반환합니다. type·isRead 필터와 limit·offset을 지원하며 조회만으로 읽음 처리하지 않습니다. 목록은 포장 없는 배열이며 빈 결과는 []입니다. 총관리자도 자신의 알림만 조회합니다.",
        "503 notifications_unavailable",
    )
    add(
        "GET",
        "/notifications/unread-count",
        "내 미확인 알림 개수",
        "필터·페이지와 관계없이 자신의 전체 미확인 알림 개수를 반환합니다. 0개면 count=0입니다.",
        "503 notifications_unavailable",
    )
    add(
        "GET",
        "/notifications/{notification_id}",
        "내 알림 상세",
        "자신의 알림 내용·발생 시각·위치·읽음 여부를 반환합니다. 타인의 알림과 없는 알림은 동일한 404입니다. 조회 자체로 읽음 상태를 바꾸지 않습니다.",
        "404 notification_not_found; 503 notifications_unavailable",
    )
    add(
        "PATCH",
        "/notifications/{notification_id}/read",
        "내 알림 읽음 처리",
        "본문 없이 호출합니다. 반복해도 읽음 상태를 유지하며 발생 시각은 바꾸지 않습니다. 처리 완료·로봇 재확인 명령은 포함하지 않습니다.",
        "404 notification_not_found; 503 notifications_unavailable",
    )
    add(
        "PUT",
        "/push-tokens",
        "Expo 기기 토큰 등록·갱신",
        "ExpoPushToken 또는 ExponentPushToken 형식과 android/ios를 받습니다. 같은 토큰은 upsert하고 createdAt은 유지하며 updatedAt·현재 소유자·플랫폼·활성 상태를 갱신합니다. 같은 기기로 계정을 바꾸면 새 로그인 계정에 연결합니다. 여러 기기를 등록할 수 있고 토큰 원문은 응답하지 않습니다. userId 같은 추가 입력은 거부합니다.",
        "503 notifications_unavailable",
    )
    add(
        "DELETE",
        "/push-tokens",
        "현재 기기 토큰 해제",
        "본문 token으로 자신의 토큰만 비활성화합니다. 없는 토큰·다른 계정 소유 토큰도 동일하게 204입니다. 로그아웃 전 인증 토큰이 유효할 때 호출하고 재등록하면 다시 활성화됩니다.",
        "503 notifications_unavailable",
    )
