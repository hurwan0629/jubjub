# 총관리자 승인과 로봇 할당

총관리자는 독립된 [web/ 프로젝트](../web/README.md)에 로그인하면 Figma Page 4의 관리자 보기 화면으로 이동해요.
하위관리자 모바일 앱은 app/, 총관리자 웹은 web/, 공통 API는 server/로 분리돼요. app/에는 총관리자 화면이 없으며 총관리자가 로그인하면 웹 로그인 안내를 표시해요.
가입 신청 목록·상태 필터·로봇 선택 후 승인·사유를 입력하는 반려와 승인 취소를 제공해요.
공원별 보고와 독립 로봇 관리 화면은 별도 구현 범위예요.
모든 요청에 Bearer JWT가 필요해요. `/admin/*`는 DB의 `users.role=super_admin`을 매번 검사해요.
JWT에 역할을 고정하지 않으므로 역할 변경은 다음 요청부터 적용돼요.

## DB 구조

## 공원 변경과 운영 화면 (2026-11-17)

하위관리자는 `POST /park-change-requests`에 `{catalogId,reason}`으로 변경을 신청해요.
`GET /park-change-requests`는 자기 신청 이력, `POST /park-change-requests/{id}/cancel`은 대기 신청 취소예요.
사유는 앞뒤 공백을 제거한 1~200자이며 공원별 대기 신청은 하나예요. 신청만으로 현재 공원은 바뀌지 않아요.

총관리자는 `GET /admin/park-change-requests?status=all`에서 확인하고
`POST /admin/park-change-requests/{id}/approve` 또는 `/reject`(`{reason}`)로 처리해요.
승인 시 다른 담당자 중복과 모든 로봇의 idle/offline 상태를 재검사해요.
공원 변경이 승인되면 기존 경로를 비활성화하고 지점·시간표·좌표 기준점을 초기화해요.
로봇 배정은 유지하고 `route_setup_done=false`로 새 공원 초기 설정을 요구해요. 반려·취소는 기존 설정을 유지해요.
이전 편집 화면의 저장을 막기 위해 `/route` 응답의 `catalogId`를 저장 요청에도 포함해야 해요.
분리 API의 `/station`, `/schedules`, `/route/complete`에는 `?catalogId=`를 보내요.

`GET /admin/parks`는 승인된 공원과 담당자·로봇 수를 반환해요.
일일 보고 조회 API와 데모 보고 생성기는 제거했어요.

`PATCH /admin/robots/{id}/assignment`의 `{parkId}`는 승인 공원 배정, `{parkId:null}`은 회수예요.
대기·오프라인 로봇만 가능하고, 다른 공원으로 옮길 때 이전 로봇의 활성 경로·시간표를 제거해요.
다른 로봇의 설정과 과거 경로 이력은 보존해요.
마이그레이션 `20261118_0008`은 `daily_reports`, `agent_steps`, `agent_runs` 테이블과 데이터를 삭제해요. 다운그레이드는 테이블 구조만 복원해요.

## 기존 테이블 구조

하위관리자 앱의 로봇 목록은 `GET /robots`, 개별 정보는 `GET /robots/{robot_id}`를 사용해요.
`PATCH /robots/{robot_id}`에 `{"name":"주비 1호"}`를 보내면 이름만 바꿔요.
이름은 앞뒤 공백을 제거한 1~100자이며, 승인된 내 공원에 배정된 로봇만 조회·수정할 수 있어요.
경로·시간표·기기 식별 번호는 이름 변경의 영향을 받지 않아요.

| 테이블 | 변경 |
| --- | --- |
| users | role: manager(기본), super_admin. route_setup_done 제거 |
| parks | status, approved_by, approved_at, reject_reason, route_setup_done 추가 |
| robots | id/name/serial_no/park_id/status/assigned_at/created_at 신규 |

parks는 여전히 관리자당 1개예요. 공원 정보는 catalog_id로 목록을 연결해서 조회해요.
같은 공원에 pending 신청은 여러 개 가능하지만 approved catalog_id는 부분 유일 인덱스로 한 개만 허용해요.
robots.serial_no는 유일하고 park_id는 유일하지 않으므로 공원 하나에 여러 로봇을 할당할 수 있어요.
로봇의 park_id와 assigned_at은 함께 NULL이거나 함께 값이 있어야 해요.
로봇 상태는 idle/working/emptying/offline/error예요. 새 로봇은 실제 연결 확인 전이므로 offline이에요.
로봇 할당은 온라인 상태를 임의로 바꾸지 않아요.
경로 저장 시 에이전트 실행 로그를 생성하지 않아요.
아직 없는 tasks/robot_states 등의 다중 로봇 실행·상태 집계는 이후 구현 범위예요.

## 앱 흐름

1. 가입 화면에서 계정 정보를 입력하고 공개 GET /parks로 담당 공원을 검색·지정해요.
2. POST /auth/register에 계정 정보와 catalogId를 함께 보내요. 역할은 항상 manager이고 role 입력은 422예요.
3. users와 parks를 한 트랜잭션으로 생성해 회원가입 신청(pending)을 저장해요. 이때 로그인하지 않아요.
4. 총관리자는 GET /admin/registrations에서 신청자 정보와 담당 공원을 함께 확인하고 승인·반려해요.
5. pending/rejected 계정은 로그인과 업무 API 모두 403이에요. approved일 때만 JWT를 발급해요.
6. 승인 후 로그인 응답의 routeSetupDone=false면 초기 설정, true면 운영 화면으로 이동해요.

승인 대상은 공원 단독 신청이 아니라 **담당 공원을 지정한 관리자의 회원가입 신청**이에요.
관리자당 담당 공원이 하나이므로 기존 parks의 status/approved_by/approved_at을 가입 신청 심사 상태로 재사용해요.
응답의 registrationStatus가 가입 승인 상태이며 parkStatus는 이전 앱 호환용이에요. 중복 상태 컬럼이나 추가 DB 마이그레이션은 필요하지 않아요.

기존 isFirstLogin은 호환용으로 유지해요. 총관리자는 false,
하위관리자는 승인된 공원에서 설정을 끝냈을 때만 false예요.
앱은 isFirstLogin 하나보다 **role → registrationStatus → routeSetupDone** 순으로 판단해야 해요.
승인 전 로그인은 403 registration_pending, 반려는 403 registration_rejected예요. 알림·이메일 발송은 별도예요.

## 총관리자 API

| API | 설명 |
| --- | --- |
| GET /admin/registrations?status=pending | 회원가입 신청 목록. status=all은 전체, pending/approved/rejected는 상태별 조회. limit/offset 페이지네이션 지원 |
| POST /admin/registrations/{userId}/approve | 가입 승인. `{}` 가능, robotIds는 선택 |
| POST /admin/registrations/{userId}/reject | `{reason:"반려 사유"}`로 가입 반려 |
| POST /admin/registrations/{userId}/revoke | `{reason:"승인 취소 사유"}`로 승인 취소 및 담당 로봇 회수 |
| GET /admin/park-requests?status=pending&limit=20&offset=0 | 신청 목록. status 생략 시 전체 |
| POST /admin/robots | 로봇 등록 `{name,serialNo}`. 성공 201 |
| GET /admin/robots?unassigned=true&limit=20&offset=0 | 미할당 로봇 목록. unassigned 생략 시 전체 |
| POST /admin/parks/{id}/approve | `{robotIds:["1","2"]}`로 승인·로봇 할당 |
| POST /admin/parks/{id}/reject | `{reason:"반려 사유"}`로 반려 |
| GET /robots | 하위관리자 본인의 승인된 공원에 할당된 로봇 목록 |

기존 /admin/park-requests 및 /admin/parks/{id}/approve·reject는 호환 경로예요. 신규 관리 화면은 userId 기준 /admin/registrations를 사용해요.

승인 취소는 승인 상태인 관리자에게만 가능해요. 담당 로봇이 모두 idle/offline일 때 로봇의 park_id와 assigned_at을 비우고 신청을 rejected로 변경하며 취소 사유를 저장해요.
working/emptying/error 로봇이 있으면 409 robot_not_available로 전체 변경을 거부해요. 기존 경로·시간표는 삭제하지 않아요.
취소 직후 해당 관리자의 로그인 및 기존 토큰을 사용하는 업무 API 접근은 403으로 차단돼요.
가입 신청/로봇 전체 목록 API는 offset 10,000 이후도 조회할 수 있으며 한 페이지는 최대 100개예요.
신청 목록은 공원 정보 외에 userId/applicantName/applicantLoginId/applicantEmail/applicantPhone/registrationStatus/createdAt과 승인 메타데이터를 반환해요.
GET/PUT /park와 승인·반려 응답에는 아래 필드가 추가돼요.

```json
{"status":"pending","reviewedBy":null,"reviewedAt":null,"rejectReason":null,"routeSetupDone":false}
```

가입 승인은 로봇 없이도 가능해요. robotIds를 함께 보내면 최대 100대까지 지정할 수 있고 중복 ID는 거부해요.
선택한 모든 로봇이 존재하며 미할당이고 idle/offline일 때만 승인해요.
이미 다른 공원에 할당된 로봇을 가져오거나 working/emptying/error 로봇을 배치할 수 없어요.
승인과 모든 로봇 할당을 같은 트랜잭션으로 처리하므로 일부만 저장되는 일은 없어요.
신청·로봇 행 잠금과 공원의 부분 유일 인덱스로 동시 중복 승인·할당도 막아요.
한 총관리자의 여러 변경 요청은 계정 행 잠금으로 직렬화해요.

## 신청 변경 규칙

- pending/rejected 계정에는 로그인 토큰을 발급하지 않으므로 앱에서 PUT /park로 신청을 변경하거나 재신청하지 않아요. 반려·기존 미완료 계정은 총관리자에게 문의하도록 안내해요.
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
