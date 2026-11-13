# KAN-93 순찰 설정 구현 계획과 설계

승인된 범위: 공원 지정 → 분리수거장 → 순찰 지점·순서 → 시간표 → 초기 설정 완료.
기준: DB 설계서 v0.4, 화면설계서 v2.7, KAN-93.

기존 FastAPI/SQLAlchemy 서비스를 확장한다. 검색 목록과 운영 parks를 분리하고 catalog_id로
공원 정보·경계를 연결 조회한다. parks에는 id/user_id/catalog_id/created_at만 저장한다.
관리자별 parks 1개, 활성 경로 1개, 분리수거장 1개를 보장한다.
points는 논리 삭제하며 변경 시 새 버전으로 복사해 과거 경로의 이름·좌표를 보존한다.
공원 변경 시 이전 지점·경로는 비활성화하고 시간표와 설정 완료 상태를 초기화한다.
동일 공원 재선택은 설정을 보존한다. 사용자 행 잠금으로 변경을 직렬화한다.

API: GET/PUT /park, /station, /routes, /schedules, /route. POST /route/complete.
/route는 기존 앱 RouteConfig 전체 계약이며 PUT 성공 시 설정 완료도 함께 저장한다.
분리 API 사용 시 /route/complete가 저장 상태를 검사한다. 모든 요청은 JWT 사용자 기준이다.
지점은 다각형 내부(구멍 제외), 분리수거장부터 지점 간 1km 이내 연결망에 속해야 한다.
순찰 순서는 핀 추가 순서와 다르므로 입력 배열 순서에 의존하지 않고 연결성을 검증한다.
분리수거장은 응답 start/end로 반환하며 route_points에는 patrol만 저장한다.
경로 변경은 agent_runs/agent_steps 로그와 같은 트랜잭션으로 저장한다.
활성 버전은 다음 순찰용이다. 실행기는 시작 시 경로 버전을 고정하고 applied_at을 기록해야 한다.
실제 로봇 실행·SLAM·주행 경로 미리보기는 별도 연동이며 SLAM 좌표는 NULL이다.

- [x] Task 1: tests/test_patrol_settings.py에 API 통합 테스트를 먼저 쓰고 404 실패 확인.
- [x] Task 2: models/patrol.py, schemas/patrol.py, services/patrol.py, routers/patrol.py 구현.
  models/__init__.py와 routers/api.py에 등록. 테스트 통과 확인.
- [x] Task 3: 명시적 Alembic 마이그레이션(RLS 포함), PATROL.md 계약 작성.
  Ruff와 전체 pytest, PostgreSQL 오프라인 DDL 검증.

검토 초점: 계정 격리, 실패 롤백, 공원 변경, 구멍·비정상 좌표·중복 검증, 이전 버전 보존.
현재 폴더에서 기존 미커밋 변경을 보존하며 직접 실행한다. 공유 DB 적용·배포·프론트 수정은 제외한다.
기준선: 기존 테스트 67개 통과. pytest 캐시 쓰기 권한 경고는 이후 cacheprovider 비활성화로 처리한다.

검증 기록:
- 신규 API 테스트의 미구현 실패 후 구현하여 통과.
- 순서 변경 시 연결된 지점이 거부되는 회귀 테스트 실패 후 연결망 검사로 수정.
- 잠금 전 읽은 User가 오래된 상태인 회귀 테스트 실패 후 잠금 조회에서 populate_existing으로 갱신.
- 별도 리뷰에서 발견한 동시 요청 문제 수정. 기존 로컬 데이터 정리 변경은 보존.
- PostgreSQL 오프라인 upgrade/downgrade DDL 테스트로 테이블·RLS·유일 인덱스·FK 검사.
- 실 Supabase에는 아직 적용하지 않았으며 실제 로봇·스케줄러 동작은 검증 범위가 아니다.
- 사용자 후속 결정으로 parks의 중복 공원 정보 6개 컬럼을 제거하고 목록 참조로 변경했다.
  미적용 생성 마이그레이션도 수정했다. API 응답 형식은 유지하고 목록 갱신 반영 회귀 테스트를 추가했다.
- 목록 경계 갱신 후 경로 저장 시 기존 분리수거장도 최신 경계로 재검증한다.
- 2026-11-13 사용자가 반영을 요청해 공유 Supabase를 20261112_0002에서 20261113_0003으로 갱신했다.
  parks 네 컬럼·목록 외래 키·7개 테이블 RLS를 실 DB에서 확인했다.
  alembic check 차이 없음, 전체 테스트 91개 통과. 프론트 연결과 서버 배포는 별도다.
