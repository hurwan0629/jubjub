# 공원 승인과 로봇 할당 설계 및 구현 계획

사용자가 제시한 스키마와 DB 적용까지 승인한 범위로 진행한다.
기존 parks/catalog 정규화와 경로 이력은 유지한다. 웹 UI는 별도 개발하며 여기서는 서버 계약을 제공한다.

## 결정
- users.role: manager 기본값, super_admin. 공개 가입에서 권한을 선택할 수 없다.
- route_setup_done은 parks로 옮기며 기존 값은 user_id로 복사 후 users 컬럼을 삭제한다.
- parks는 관리자당 한 행 유지. pending/approved/rejected와 승인자·시각·반려사유를 추가한다.
  pending/rejected는 재신청할 수 있고 approved는 임의 공원 변경을 차단한다.
  같은 공원 재선택은 pending/approved 상태를 유지하며 rejected의 재신청은 pending으로 바꾼다.
  다른 공원 선택 시 이전 경로·지점 비활성화/시간표 삭제/설정 완료 해제를 유지한다.
- catalog_id의 approved 행에만 유일 인덱스. 승인 전 경로·지점·시간표·로봇 조회는 서버에서도 거부한다.
- robots는 serial_no 유일, park_id nullable, assigned_at과 함께 할당. idle/working/charging/offline/error.
  공원당 여러 대를 허용한다. 승인 시 미할당 로봇 1대 이상을 지정한다.
- 승인자는 DB의 super_admin 역할로 검증한다. 신청과 로봇 행을 잠그고 승인·할당을 단일 트랜잭션으로 처리한다.
  이미 승인된 신청에 재승인/반려는 허용하지 않는다. 다른 공원에 할당된 로봇은 할당할 수 없다.
- agent_runs.robot_id nullable FK를 추가한다. 관리자의 경로 수정 로그는 로봇 실행이 아니므로 NULL을 허용한다.
- 기존 계정은 모두 manager, 기존 parks는 pending으로 이전한다. 어떤 계정도 임의 승격하지 않는다.
  총관리자 지정 CLI를 제공하고 지정 계정은 사용자 답변을 기다린다.
- 기존 공개 API 호환: isFirstLogin 유지, login/me에 role/parkStatus/routeSetupDone을 추가한다.
  앱은 승인 상태를 먼저 판단해야 한다. super_admin의 isFirstLogin은 false다.

## 작업
- [x] 새 승인 흐름·권한·원자성·중복 방지 테스트 작성 후 실패 확인.
- [x] users/parks/robots/agent_runs 모델 및 기존 인증·순찰 API 변경.
- [x] /admin/park-requests, 승인·반려, 로봇 등록·목록 API와 manager /robots 구현.
- [x] 기존 테스트를 승인된 공원 조건으로 갱신, 총관리자 CLI와 API 문서 작성.
- [x] 0004 Alembic 데이터 이전·제약·RLS, 오프라인 검증과 코드 리뷰.
- [x] 전체 테스트/Ruff 후 Supabase에 적용, 실제 PostgreSQL 제약·RLS·API 트랜잭션 검증.

검토 초점: 공개 가입 권한 상승, 승인 전 접근, 동시 중복 승인/로봇 중복 할당,
승인 부분 실패 롤백, 기존 설정 데이터 이전, FK 보호, approved 공원 변경에 의한 로봇 자동 이동 방지.

## 검증 및 적용 기록
- 신규 승인 테스트 10개가 미구현으로 실패한 것을 확인한 뒤 구현해 통과했다.
- 전체 pytest 104개 통과, Ruff check/format 통과. 별도 리뷰에서 추가 수정 사항 없음.
- 실제 PostgreSQL 임시 스키마에서 0001~0003 생성 후 0004 upgrade/downgrade를 실행해
  기존 완료 값 보존·기본 역할·신청 상태·RLS를 확인하고 전체 트랜잭션을 롤백했다.
- 사용자 요청으로 공유 Supabase를 20261113_0004로 갱신했다. alembic check 차이 없음.
- 사용자가 지정한 admin 총관리자 계정 1개 생성. 비밀번호는 숨겨 입력했고 저장소에 기록하지 않았다.
  전화번호는 빈 값, 이메일은 내부 식별용 admin@admin.invalid를 사용했다.
- 실제 FastAPI+Supabase 로그인과 신청(pending)→접근차단→로봇 등록→승인·할당→조회 확인.
  시험 계정·신청·로봇은 외부 트랜잭션으로 롤백 후 잔존 행이 없음을 확인했다.
- 서버 코드 배포·총관리자 웹 UI·앱 승인 화면 연결은 별도 작업이다.
