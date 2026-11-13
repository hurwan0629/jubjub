# 총관리자 승인과 로봇 할당

웹 UI는 별도 구현해요. 여기서는 웹·앱이 사용할 서버 API와 DB 구조를 제공해요.
모든 요청에 Bearer JWT가 필요해요. `/admin/*`는 DB의 `users.role=super_admin`을 매번 검사해요.
JWT에 역할을 고정하지 않으므로 역할 변경은 다음 요청부터 적용돼요.

## DB 구조

| 테이블 | 변경 |
| --- | --- |
| users | role: manager(기본), super_admin. route_setup_done 제거 |
| parks | status, approved_by, approved_at, reject_reason, route_setup_done 추가 |
| robots | id/name/serial_no/park_id/status/assigned_at/created_at 신규 |
| agent_runs | robot_id nullable FK 추가 |

parks는 여전히 관리자당 1개예요. 공원 정보는 catalog_id로 목록을 연결해서 조회해요.
같은 공원에 pending 신청은 여러 개 가능하지만 approved catalog_id는 부분 유일 인덱스로 한 개만 허용해요.
robots.serial_no는 유일하고 park_id는 유일하지 않으므로 공원 하나에 여러 로봇을 할당할 수 있어요.
로봇의 park_id와 assigned_at은 함께 NULL이거나 함께 값이 있어야 해요.
로봇 상태는 idle/working/charging/offline/error예요. 새 로봇은 실제 연결 확인 전이므로 offline이에요.
로봇 할당은 온라인 상태를 임의로 바꾸지 않아요.
agent_runs의 관리자 경로 변경 로그는 로봇 실행이 아니므로 robot_id=NULL이에요.
실제 로봇 실행기는 실행 대상 robot_id를 기록해야 해요.
아직 없는 tasks/robot_states 등의 다중 로봇 실행·상태 집계는 이후 구현 범위예요.

## 앱 흐름

1. POST /auth/register로 가입해요. 역할은 항상 manager이고 role 입력은 422예요.
2. 로그인 응답 또는 GET /me에서 role/parkStatus/routeSetupDone을 확인해요.
3. 공원 미선택(parkStatus=null)이면 검색 후 PUT /park `{catalogId}`로 신청해요.
4. pending이면 승인 대기 화면, rejected면 rejectReason을 표시하고 다시 신청해요.
5. approved일 때만 분리수거장·경로·시간표 설정과 할당 로봇 조회를 사용해요.
6. routeSetupDone=false면 초기 설정, true면 운영 화면으로 이동해요.

기존 isFirstLogin은 호환용으로 유지해요. 총관리자는 false,
하위관리자는 승인된 공원에서 설정을 끝냈을 때만 false예요.
앱은 isFirstLogin 하나보다 **role → parkStatus → routeSetupDone** 순으로 판단해야 해요.
승인 상태 확인에는 GET /park 또는 GET /me를 사용해요. 실시간 푸시·자동 갱신 기능은 별도예요.
승인 전 순찰 API는 서버에서도 403 park_not_approved를 반환해요.

## 총관리자 API

| API | 설명 |
| --- | --- |
| GET /admin/park-requests?status=pending&limit=20&offset=0 | 신청 목록. status 생략 시 전체 |
| POST /admin/robots | 로봇 등록 `{name,serialNo}`. 성공 201 |
| GET /admin/robots?unassigned=true&limit=20&offset=0 | 미할당 로봇 목록. unassigned 생략 시 전체 |
| POST /admin/parks/{id}/approve | `{robotIds:["1","2"]}`로 승인·로봇 할당 |
| POST /admin/parks/{id}/reject | `{reason:"반려 사유"}`로 반려 |
| GET /robots | 하위관리자 본인의 승인된 공원에 할당된 로봇 목록 |

신청 목록은 공원 정보 외에 userId/applicantName/createdAt과 승인 메타데이터를 반환해요.
GET/PUT /park와 승인·반려 응답에는 아래 필드가 추가돼요.

```json
{"status":"pending","approvedBy":null,"approvedAt":null,"rejectReason":null,"routeSetupDone":false}
```

승인에는 로봇 1~100대가 필요하고 중복 ID는 거부해요.
선택한 모든 로봇이 존재하며 미할당이고 idle/offline일 때만 승인해요.
이미 다른 공원에 할당된 로봇을 가져오거나 working/charging/error 로봇을 배치할 수 없어요.
승인과 모든 로봇 할당을 같은 트랜잭션으로 처리하므로 일부만 저장되는 일은 없어요.
신청·로봇 행 잠금과 공원의 부분 유일 인덱스로 동시 중복 승인·할당도 막아요.
한 총관리자의 여러 변경 요청은 계정 행 잠금으로 직렬화해요.

## 신청 변경 규칙

- pending에서 같은 공원을 다시 선택하면 신청을 유지해요.
- rejected에서 다시 신청하면 pending으로 바뀌며 반려 사유를 비워요.
- pending/rejected에서 다른 공원을 선택하면 기존 경로·지점·시간표와 완료 상태를 초기화해요.
- approved에서 같은 공원을 선택하면 상태를 유지해요.
- approved에서 다른 공원으로 변경은 409 approved_park_change_forbidden이에요.
- 승인·반려는 pending에서만 가능해요. 이미 승인된 공원을 반려해서 로봇을 남기는 동작은 허용하지 않아요.

공원 승인 취소·담당자 변경·로봇 회수/이동·할당 이력 테이블은 이번 API 범위에 포함하지 않아요.
운영 중인 로봇의 정지와 실행 작업 처리 규칙을 정한 뒤 별도로 구현해야 해요.

## 총관리자 계정 생성

공개 가입으로 총관리자를 만들 수 없어요. 서버 콘솔에서 아래 명령을 사용해요.
비밀번호는 숨겨 입력하며 명령 인자나 로그에 넣지 않아요. 기존 계정은 덮어쓰거나 자동 승격하지 않아요.

```powershell
python -m app.scripts.create_super_admin --login-id admin
```

이름 기본값은 총관리자, 전화번호는 빈 문자열이에요.
이메일 미지정 시 `{login-id}@admin.invalid`라는 내부 식별용 예약 도메인 주소를 사용해요.
실제 연락용 이메일이 있다면 `--email`로 지정할 수 있어요.
사용자 비밀번호는 이 문서나 저장소에 기록하지 않아요.

## 마이그레이션

20261113_0004가 기존 계정을 manager, 기존 공원을 pending으로 이전해요.
users.route_setup_done을 parks.user_id로 연결해 복사한 뒤 기존 컬럼을 제거해요.
자동으로 승인하거나 특정 계정을 총관리자로 승격하지 않아요.
robots에도 RLS를 켜며 공개 정책은 추가하지 않아요.
역할·승인 상태·로봇 할당 정보는 앱에서 직접 DB에 쓰지 않고 FastAPI를 통해 변경해요.

2026-11-13 공유 Supabase에 20261113_0004를 적용했고 `alembic check`도 통과했어요.
요청한 admin 총관리자 계정을 만들고 실제 로그인·승인·로봇 할당 API를 검증했어요.
검증용 계정·신청·로봇 행은 모두 롤백했어요. 서버 실행 환경은 최신 코드를 배포/재시작해야 해요.
