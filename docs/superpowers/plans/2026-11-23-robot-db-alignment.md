# Robot DB Alignment Implementation Plan

**Goal:** Confluence 현재 DB v27의 확정된 테이블 변경을 기존 데이터를 보존하면서 적용해요.

**Architecture:** Alembic 0014 다음에 0015를 추가해요. 로봇 상태를 1:1 robot_states로 이관하고 기존 Python Robot 상태 접근과 API 응답은 유지해요. 신규 통신 기록 테이블과 탐지 필드를 추가해요.

**Tech Stack:** SQLAlchemy 2, Alembic, PostgreSQL, pytest.

**Spec:** https://kdt-3team-finalterm.atlassian.net/wiki/pages/7471105 (v27), 로봇-서버 통신 문서 v14.

## Constraints

- robot_state_logs와 에이전트 테이블은 추가 예정이므로 제외해요.
- 기존 로봇 상태·위치·배터리를 이관해요. 토큰은 실제 발급 전 NULL이에요.
- 과거 탐지의 task_id와 client_detection_id를 꾸며내지 않아요. 이행 불가능한 기존 탐지가 있으면 적용을 중단해요.
- 기존 작업 결과 success → completed, failed → aborted로 변환해요.
- 신규 테이블은 RLS를 켜고 기본 외부 접근은 허용하지 않아요. Realtime 공개 구독 정책은 인증 체계 결정 전 추가하지 않아요.
- 표에 없는 NULL 허용 여부는 기존 제약과 메시지 규칙을 기준으로 정해요.

## Tasks

- [x] 신규 모델·로봇 상태의 생성 및 영속성·잘못된 기록 거부 테스트를 먼저 작성하고 실패를 확인했어요.
- [x] RobotState와 통신 기록 모델, 기존 Robot 속성 연결을 구현했어요.
- [x] Alembic 0015에서 기존 상태 이관, 탐지 필드 및 결과 제약 변경을 구현했어요.
- [x] 전체 서버 검사와 격리 PostgreSQL 스키마에서 upgrade/downgrade, 보존·제약 조건을 검증했어요.
- [x] DB 백업 후 공용 DB에 적용하고 스키마와 데이터 보존을 확인했어요.
- [x] 적용 결과, 남은 Realtime·WebSocket 구현 범위를 `server/ROBOT_PROTOCOL_DB.md`에 기록했어요.

## 검증 기록

모델 테스트 7건의 의도한 실패를 확인한 뒤 구현했어요. 전체 서버 테스트는 210 passed, 12 skipped예요.
격리 PostgreSQL 테스트와 `alembic check`도 통과했어요. 최종 독립 코드 리뷰에서 중요한 결함은 발견되지 않았어요.
Ruff 전체 경로 포맷 검사는 접근 불가 캐시 디렉터리 때문에 도구가 종료돼, 소스 경로인 app/tests/scripts를 명시해 88개 파일 포맷 검사를 통과했어요.
