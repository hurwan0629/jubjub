# 로봇 통신 DB 변경 (2026-11-23)

기준은 [Confluence 현재 DB v27](https://kdt-3team-finalterm.atlassian.net/wiki/pages/7471105)과 연결된 로봇-서버 통신 문서 v14예요.
마이그레이션은 `20261120_0014` → `20261123_0015`예요. 공용 Supabase에 적용했어요.

## 반영한 내용

- `robots`의 상태·좌표·배터리·마지막 통신 시각을 `robot_states`로 이관했어요. `slam_yaw`, `updated_at`을 추가했어요.
- `robots`에는 `auth_token_hash`, `token_issued_at`을 추가했어요. 실제 발급 전에는 NULL이에요.
- `robot_task_points`, `robot_errors`, `robot_message_receipts`를 추가했어요. 지점 순서와 메시지 중복을 제약으로 막아요.
- `detections`에 필수 `task_id`, `client_detection_id`(UUID), `confidence`와 선택 `pickup_fail_reason`을 추가했어요.
- `robot_tasks.result`는 `completed`, `stopped`, `aborted`, `missed`를 사용해요. 과거 `success`는 `completed`, `failed`는 `aborted`로 변환해요.
- 알림 종류는 원래 자유 텍스트이므로 `robot_error`, `patrol_missed`용 스키마 변경은 필요하지 않아요.
- `Robot`의 기존 Python 속성은 상태 테이블을 읽고 쓰도록 연결해 기존 API 응답을 유지해요. ORM으로 로봇을 등록하면 상태 행도 함께 생성해요.

## 검증과 백업

적용 전 기존 18개 테이블을 JSON으로 백업했어요. 파일은 Git에서 제외되는 `data/db-backups/20261123T053422Z-before-0015.json`에 있어요. 사용자 정보가 포함돼 있으므로 저장소에 올리지 않아요.
로봇 22대의 기존 상태·위치·배터리를 값 단위로 비교했고, 기존 모든 테이블의 행 수를 보존했어요.
적용 후 사용자 10명, 공원 7개, 로봇 22대, 상태 22행을 확인했어요.

전체 서버 테스트는 210개 통과, 12개 건너뜀이었어요. 별도로 격리 PostgreSQL 스키마에서 이관·되돌리기·중복 메시지·손실 방지 검증을 통과했어요.
`alembic current`는 `20261123_0015 (head)`, `alembic check`는 추가 변경 없음으로 확인했어요.

## 적용 범위와 주의점

문서에서 추후 추가로 정한 `robot_state_logs`, `daily_reports`, `agent_runs`, `agent_steps`는 만들지 않았어요.
WebSocket 수신, 좌표 변환, 토큰 발급 API, 자동 오류 알림 생성은 이번 테이블 변경에 포함되지 않아요.

신규 테이블에는 기존 테이블과 같이 RLS를 켰어요. 현재 DB에는 공개 조회 정책이나 Realtime 구독 테이블 설정이 없어요.
앱의 Realtime 직접 구독은 서버 JWT와 Supabase 인증을 어떻게 연결할지 결정하고 별도로 접근 정책을 설정해야 해요. 인증 없이 전체 로봇 상태를 공개하지 않아요.

팀원은 DB만 바뀐 상태에서 예전 서버 코드를 계속 쓰면 안 돼요. 특히 `minee`에는 기존 `dev` 변경과 이번 모델 변경을 함께 반영해야 해요.
팀원 서버에도 이번 마이그레이션과 모델 변경이 포함된 커밋을 함께 반영하고 서버를 재시작해야 해요.
`returning`은 DB에서 허용하지만 기존 서버 응답과 앱·웹의 상태 타입에는 아직 없어요. 실제 로봇 통신을 연결하기 전에 대응이 필요해요.

## 복구

이번 버전이 요구하는 필수 값이 없는 기존 탐지가 있으면 upgrade를 중단해요. 이번 적용 당시 탐지·작업 기록은 모두 0건이었어요.
새 프로토콜 기록, 토큰, 방향 값, `returning` 상태나 `stopped`·`missed` 결과가 생긴 뒤에는 downgrade를 거부해 데이터 손실을 막아요.
새 기록이 없는 경우에만 `alembic downgrade 20261120_0014`로 상태를 다시 `robots`에 이관할 수 있어요.
