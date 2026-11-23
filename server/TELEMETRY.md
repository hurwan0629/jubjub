# 로봇 탐지·작업·알림 테이블

마이그레이션 `20261118_0009`에서 기본 테이블을 생성하고, `20261123_0015`에서 상태 분리와 통신 기록을 추가했어요. 모든 ID는 bigint이고 시각은 timestamptz예요. RLS를 활성화하며 접근은 서버에서 권한을 확인해요. 최신 수신·조회·제어 계약은 [로봇 통신 API](ROBOT_PROTOCOL_API.md)를 참고해요.

| 테이블 | 주요 필드 |
| --- | --- |
| detections | park_id, robot_id, material, slam_x, slam_y, lat, lng, image_path, detected_at, pickup_result |
| robot_tasks | park_id, robot_id, task_type, route_id, trigger, started_at, ended_at, result |
| notifications | user_id, recipient_role, park_id, robot_id, notification_type, title, body, lat, lng, occurred_at, is_read |
| push_tokens | user_id, token, platform, is_active, created_at, updated_at |

- 쓰레기 분류는 `plastic`, `can`, `glass`, `general`이에요. 수거 결과는 대기 중 NULL, 완료 시 `collected` 또는 `failed`예요.
- `slam_x/y`는 로봇 좌표이고 `lat/lng`는 지도 위도·경도예요. `image_path`는 Cloudflare 이미지 URL 또는 객체 경로예요. 업로드 자체는 별도 구현이 필요해요.
- 작업 종류는 `patrol`(순찰), `station_move`(분리수거장 이동)예요. 순찰은 `route_id`와 `trigger`(`schedule`, `request`)가 필수예요. 이동 작업에서는 두 필드가 NULL이에요.
- 진행 중인 작업은 종료 시각과 결과가 NULL이고, 완료 시 두 필드를 함께 기록해요. 결과는 `completed`, `stopped`, `aborted`, `missed`예요.
- 알림은 수신 관리자별 한 행이에요. `recipient_role`은 발생 당시 역할(`manager`, `super_admin`)이고 읽음 여부는 개별 관리해요. 공원·로봇·위치는 해당 사항이 없으면 NULL이에요. 알림 종류는 아직 목록이 정해지지 않아 문자열로 저장해요.
- 푸시 토큰은 전체 기기에서 유일해요. 한 관리자는 여러 토큰을 가질 수 있어요. 로그인 시 token 기준으로 upsert하고 현재 user_id·platform·updated_at을 갱신해야 해요. ORM 갱신은 updated_at을 자동 갱신하며 직접 SQL에서는 명시해야 해요.

탐지·작업은 로봇 WebSocket으로 수신해요. 알림 조회·읽음 처리·Expo 기기 토큰 등록·해제 및 발송 대기열은 `20261118_0011`에서 추가했어요. 계약과 실행 설정은 [NOTIFICATIONS.md](NOTIFICATIONS.md)를 참고해요.
