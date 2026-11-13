# JUBJUB API 명세서 — 현재 구현 기준

작성 기준: 2026-11-13 (KST). 현재 FastAPI 라우터·Pydantic 스키마·서비스 코드와 생성 OpenAPI를 대조했어요.
**현재 구현된 업무 API는 22개예요.** 기획 예정 API는 마지막 절에 별도로 구분했어요.
DB는 Alembic `20261113_0004`까지 Supabase에 적용됐어요. 이 문서의 서버 코드가 실행 환경에 배포·재시작됐는지는 별도로 확인해야 해요.

## 1. 공통 규칙

- 개발용 Base URL: `http://localhost:8000`. 휴대폰에서는 서버 PC의 사설 IP와 포트 8000을 사용해요. 운영 주소는 아직 이 문서에서 확정하지 않아요.
- Swagger: `{BASE_URL}/docs`, OpenAPI: `{BASE_URL}/openapi.json`.
- 요청·응답: JSON, 필드 이름은 camelCase. ID 응답은 bigint 정밀도 손실을 막기 위해 문자열이에요.
- 경로 매개변수 `park_id`는 1~9223372036854775807의 정수예요. JSON의 catalogId/robotIds는 양의 정수 형태 문자열을 보내요.
- 인증 헤더: `Authorization: Bearer <accessToken>`. /health, /auth/register, /auth/login만 공개 업무 API예요.
- 역할: `manager` 하위관리자, `super_admin` 총관리자. JWT에는 역할을 넣지 않고 DB의 현재 역할로 검사해요.
- 관리자 공원은 계정당 1개. 다른 사용자의 userId/parkId를 본인 설정 API의 권한으로 사용하지 않아요.
- 시간표의 HH:mm은 한국 현지 시각으로 해석하는 계약이에요. 날짜·시각 응답은 시간대 정보를 포함한 ISO 8601이며 클라이언트에서 KST로 표시해요.
- JSON 쓰기 요청은 `Content-Type: application/json`을 사용해요.
- 배열 목록은 별도 envelope 없이 `[]`로 응답해요. 페이지 조회의 결과 개수는 전체 개수가 아니에요.

### 권한 구분

| 구분 | 접근 |
| --- | --- |
| 공개 | 회원가입·로그인·서버 상태 |
| 로그인 사용자 | 내 계정 정보, 공원 목록 검색 |
| manager | 내 공원 신청·상태 조회 |
| manager + approved 공원 | 분리수거장·순찰 경로·시간표·내 로봇 조회 |
| super_admin | 신청 목록, 승인·반려, 로봇 등록·전체 목록 |

## 2. 전체 API 목록

| # | Method | Path | 기능 | 권한 | 성공 |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | /health | 서버·DB 상태 | 공개 | 200 |
| 2 | POST | /auth/register | 하위관리자 회원가입 | 공개 | 201 |
| 3 | POST | /auth/login | 로그인·JWT 발급 | 공개 | 200 |
| 4 | GET | /me | 내 계정·역할·승인 상태 | 로그인 | 200 |
| 5 | GET | /parks | 이름·주소로 서울 공원 검색 | 로그인 | 200 |
| 6 | GET | /park | 내 공원과 승인 상태 | manager | 200 |
| 7 | PUT | /park | 관리 공원 선택·승인 신청 | manager | 200 |
| 8 | GET | /station | 분리수거장 위치 | manager + approved | 200 |
| 9 | PUT | /station | 분리수거장 위치 저장 | manager + approved | 200 |
| 10 | GET | /routes | 활성 경로 지점·순서·출발·복귀 위치 | manager + approved | 200 |
| 11 | PUT | /routes | 순찰 지점·순서 저장 | manager + approved | 200 |
| 12 | GET | /schedules | 순찰 시간표 | manager + approved | 200 |
| 13 | PUT | /schedules | 순찰 시간표 전체 교체 | manager + approved | 200 |
| 14 | GET | /route | 공원·분리수거장·경로·시간표 통합 조회 | manager + approved | 200 |
| 15 | PUT | /route | 설정 일괄 저장·초기 설정 완료 | manager + approved | 200 |
| 16 | POST | /route/complete | 개별 저장한 설정의 완료 처리 | manager + approved | 200 |
| 17 | GET | /admin/park-requests | 공원 신청 목록 | super_admin | 200 |
| 18 | POST | /admin/parks/{park_id}/approve | 공원 승인·로봇 할당 | super_admin | 200 |
| 19 | POST | /admin/parks/{park_id}/reject | 공원 신청 반려 | super_admin | 200 |
| 20 | POST | /admin/robots | 로봇 등록 | super_admin | 201 |
| 21 | GET | /admin/robots | 전체·미할당 로봇 목록 | super_admin | 200 |
| 22 | GET | /robots | 내 승인 공원에 할당된 로봇 | manager + approved | 200 |

**/parks와 /park, /routes와 /route는 서로 다른 API예요.** /parks는 검색 목록, /park는 신청한 운영 공원이에요. /routes는 지점·순서만, /route는 시간표까지 포함한 전체 설정이에요.

## 3. 인증·계정

### POST /auth/register — 회원가입

요청:
```json
{
  "loginId": "manager01",
  "password": "ExamplePass123!",
  "name": "공원 관리자",
  "phone": "010-1234-5678",
  "email": "manager@example.com"
}
```

- loginId: 영문·숫자 4~16자, 대소문자 구분.
- password: 영문·숫자를 각각 포함한 8~128자. 비밀번호 앞뒤 공백을 임의로 제거하지 않아요.
- name: 앞뒤 공백 제거 후 1~100자.
- phone: 하이픈·공백 제거 후 숫자 9~15자. 요청 원문 길이는 9~30자.
- email: 유효한 이메일, 최대 254자, 소문자로 저장.
- role은 서버가 manager로 정해요. role을 비롯한 정의되지 않은 입력 필드는 422예요.
- 비밀번호 확인과 필수 개인정보 동의 UI는 프론트 책임이에요. 확인 비밀번호·동의 시각을 저장하는 필드는 현재 API에 없어요.
- 이 요청은 계정만 만들고 공원 선택·승인 신청은 하지 않아요. accessToken도 발급하지 않아요.

201 응답:
```json
{"id":"1","name":"공원 관리자","email":"manager@example.com","role":"manager","parkStatus":null,"routeSetupDone":false}
```

오류: 409 account_exists(아이디 또는 이메일 중복), 422 validation_error.

### POST /auth/login — 로그인

요청:
```json
{"loginId":"manager01","password":"ExamplePass123!"}
```

200 응답 예:
```json
{
  "accessToken": "<JWT>",
  "tokenType": "bearer",
  "expiresIn": 3600,
  "isFirstLogin": true,
  "role": "manager",
  "parkStatus": "pending",
  "routeSetupDone": false
}
```

- expiresIn은 초 단위, 기본 3600초. 서버 설정에 따라 바뀌며 토큰 만료 시 다시 로그인해요. refresh API는 없어요.
- parkStatus: 공원 미신청이면 null, 신청 상태에 따라 pending/approved/rejected.
- routeSetupDone은 parks.route_setup_done이에요.
- isFirstLogin: manager가 approved 공원에서 설정을 완료했을 때 false. super_admin도 false. 그 외 manager는 true예요.
- **현재 구현은 pending/rejected에서도 로그인을 허용해요.** 토큰으로 승인 상태를 조회하되 운영 설정 API를 차단해요.
- 비밀번호는 Argon2 해시, JWT는 HS256이며 sub/iat/exp만 포함해요.
- 오류: 401 invalid_credentials(없는 계정·틀린 비밀번호 동일 응답), 503 auth_not_configured.

### GET /me — 내 계정 상태

200:
```json
{"name":"공원 관리자","email":"manager@example.com","role":"manager","parkStatus":"approved","routeSetupDone":true}
```

총관리자는 role=super_admin, parkStatus=null, routeSetupDone=false예요.
프론트는 **role → parkStatus → routeSetupDone** 순서로 화면을 분기해요.
인증 누락·만료·변조·삭제된 계정은 401 invalid_token이에요.

## 4. 공원 검색·신청

### GET /parks — 이름·주소 검색

예: `GET /parks?query=여의도&limit=20&offset=0`

| Query | 타입 | 기본 | 조건 |
| --- | --- | --- | --- |
| query | string | 빈 문자열 | 최대 100자, 앞뒤 공백 제거 |
| limit | integer | 20 | 1~100 |
| offset | integer | 0 | 0~10000 |

- 이름 또는 주소로 검색하며 공백으로 나눈 단어는 모두 일치해야 해요.
- %와 _는 와일드카드가 아닌 문자로 검색해요.
- 활성화된 공원만 이름·ID 순으로 반환해요.
- 검색어가 비어 있거나 결과가 없으면 200과 []예요.
- **내 위치 검색·거리순 정렬은 제거됐어요. latitude/longitude를 보내지 마세요.** 현재 라우터는 알 수 없는 query 매개변수를 무시하므로 이전 위치 매개변수만 보내면 []예요.
- 응답의 distance는 기존 앱 타입 호환을 위해 항상 빈 문자열이에요.

200: ParkSearchResult[]:
```json
[
  {
    "id": "101",
    "name": "예시공원",
    "address": "서울특별시 예시 주소",
    "distance": "",
    "bounds": {
      "southWest": {"latitude":37.5,"longitude":127.0},
      "northEast": {"latitude":37.51,"longitude":127.01}
    },
    "area": {
      "outer": [
        {"latitude":37.5,"longitude":127.0},
        {"latitude":37.5,"longitude":127.01},
        {"latitude":37.51,"longitude":127.01},
        {"latitude":37.51,"longitude":127.0},
        {"latitude":37.5,"longitude":127.0}
      ],
      "holes": []
    }
  }
]
```
예시 좌표·주소·ID는 설명용이며 실데이터가 아니에요. 실제 저장 요청에는 선택한 검색 결과를 사용해요.
오류: 422 validation_error, 503 park_catalog_unavailable.

### GET /park — 내 공원·신청 상태

manager 본인의 ManagedPark를 반환해요. pending/rejected에서도 조회 가능해요.
미신청이면 404 park_not_found예요.

### PUT /park — 공원 선택·신청

요청: `{"catalogId":"101"}`. **검색 결과 id를 catalogId로 보내요.**

200: ManagedPark:
```json
{
  "id":"10",
  "catalogId":"101",
  "name":"예시공원",
  "address":"서울특별시 예시 주소",
  "center":{"latitude":37.505,"longitude":127.005},
  "bounds":{
    "southWest":{"latitude":37.5,"longitude":127.0},
    "northEast":{"latitude":37.51,"longitude":127.01}
  },
  "area":{
    "outer":[
      {"latitude":37.5,"longitude":127.0},
      {"latitude":37.5,"longitude":127.01},
      {"latitude":37.51,"longitude":127.01},
      {"latitude":37.51,"longitude":127.0},
      {"latitude":37.5,"longitude":127.0}
    ],
    "holes":[]
  },
  "status":"pending",
  "approvedBy":null,
  "approvedAt":null,
  "rejectReason":null,
  "routeSetupDone":false
}
```

- ManagedPark.id는 parks.id이고 catalogId는 park_catalog_entries.id예요. 승인 URL에는 parks.id를 사용해요.
- 이름·주소·중심 좌표·경계는 목록에서 연결 조회하며 parks에 중복 저장하지 않아요.
- 새 신청은 pending. 동일 공원 pending/approved 재선택은 유지해요.
- rejected에서 재신청하면 pending으로 바꾸고 반려 사유를 비워요.
- pending/rejected에서 다른 공원을 고르면 이전 경로 비활성화·지점 논리 삭제·시간표 제거·완료 상태 초기화를 처리해요.
- approved 상태에서 다른 공원으로 변경은 409 approved_park_change_forbidden이에요.
- 같은 카탈로그 공원에 신청은 여러 개 가능하지만 승인된 신청은 최대 1개예요.
- 오류: 403 manager_required, 404 park_not_found(없는/비활성 catalogId), 409 approved_park_change_forbidden, 422 validation_error.

## 5. 순찰 설정 공통 계약

아래 /station, /routes, /schedules, /route, /route/complete는 **manager이며 approved 공원이 있어야** 해요.
미신청: 409 park_required. pending/rejected: 403 park_not_approved. super_admin: 403 manager_required.

### 공통 데이터 타입

| 타입 | 필드 |
| --- | --- |
| LatLng | latitude: number(-90~90), longitude: number(-180~180). NaN/Infinity 불가 |
| ParkBounds | southWest: LatLng, northEast: LatLng |
| ParkArea | outer: LatLng[], holes: LatLng[][] |
| PatrolPoint 요청 | id?: string(최대 100자), name: string, position: LatLng |
| PatrolPoint 응답 | id: string, name: string, position: LatLng |
| PatrolSlot 요청 | id?: string(최대 100자), time: HH:mm, label: string, on: boolean, repeat?: daily/weekdays/weekends |
| PatrolSlot 응답 | id: string, time: HH:mm, label: string, on: boolean, repeat: string |

- 지점 name과 시간표 label은 앞뒤 공백 제거 후 1~100자예요.
- 순찰 지점은 1~100개, 같은 위치 중복 불가. points 배열 순서가 순찰 순서예요.
- 앱의 임시 id는 저장 권한이나 기존 행 수정 대상으로 사용하지 않아요. 서버가 ID를 발급하므로 저장 응답으로 상태를 갱신해요.
- 좌표는 WGS84. bounds는 표시용 사각형이고 실제 공원 내부 판정은 area의 outer/holes로 해요.
- 분리수거장과 순찰 지점은 현재 카탈로그 경계 안이어야 해요.
- 순찰 지점은 분리수거장부터 지점 간 1km 이내로 연결되는 연결망에 속해야 해요. 순찰 배열 순서를 핀 추가 순서로 간주하지 않아요.
- 순찰은 분리수거장 출발 → points 순서 → 같은 분리수거장 복귀예요.
- 실제 이동 경로·장애물·SLAM 도달 가능성을 계산하는 API는 아니에요.

### GET /station — 분리수거장 조회

200: LatLng. 아직 등록하지 않았으면 JSON null이에요.

### PUT /station — 분리수거장 저장

요청·200 응답:
```json
{"latitude":37.505,"longitude":127.005}
```

공원당 현재 분리수거장 1개예요.
활성 경로가 있는 상태에서 위치를 옮기면 기존 지점의 거리·경계 조건을 재검증하고 새 경로 버전을 만들어요.
실패하면 이전 위치와 경로를 보존해요.
422 point_outside_park / point_too_far / validation_error.

### GET /routes — 현재 경로 조회

200 예:
```json
{
  "id":"30",
  "start":{"latitude":37.505,"longitude":127.005},
  "points":[{"id":"40","name":"잔디광장","position":{"latitude":37.506,"longitude":127.006}}],
  "end":{"latitude":37.505,"longitude":127.005},
  "appliesFrom":"nextPatrol"
}
```

- 경로 미등록: id=null, points=[].
- 경로가 없고 분리수거장이 있으면 start/end는 해당 좌표, 모두 없으면 null이에요.
- points에는 순찰 지점만 있어요. 앱에서 start/end를 앞뒤에 그려요.

### PUT /routes — 지점·순서 저장

요청:
```json
{"points":[{"id":"local-1","name":"잔디광장","position":{"latitude":37.506,"longitude":127.006}}]}
```

200은 GET /routes와 같은 형식이에요.
- 분리수거장 미등록은 409 station_required.
- 새 routes/route_points와 지점 버전을 만들고 이전 경로는 비활성화해요. 기존 이력의 지점 이름·좌표는 보존해요.
- 관리자 경로 수정 로그를 같은 트랜잭션으로 기록해요.
- 다음 순찰용 설정을 저장해요. 실행기는 시작 시 route ID를 고정해 현재 순찰을 끝까지 사용해야 해요.
- 이 API만으로 초기 설정 완료 상태를 true로 만들지 않아요.
- 422 point_outside_park / point_too_far / validation_error.

### GET /schedules — 시간표 조회

200: PatrolSlot[]. 미등록이면 [].
정렬은 시각·ID 순이에요.

### PUT /schedules — 시간표 전체 교체

요청·응답 예(응답 id는 서버 발급값):
```json
[{"id":"local-1","time":"10:00","label":"오전 순찰","on":true,"repeat":"daily"}]
```

- 요청 배열 최대 100개, 빈 배열도 허용해요. 빈 배열 저장 시 parks.route_setup_done=false.
- repeat 생략 시 daily.
- HH:mm은 00:00~23:59. 같은 시각에 반복 요일이 겹치면 422 duplicate_schedule.
- daily와 weekdays/weekends는 겹치며 weekdays와 weekends는 서로 겹치지 않아요. on=false 항목도 중복 검사 대상이에요.
- 실행 예약·로봇 출발을 수행하는 스케줄러는 아직 없어요.

### GET /route — 전체 설정 조회

200: RouteConfig:
```json
{
  "parkName":"예시공원",
  "bounds":{
    "southWest":{"latitude":37.5,"longitude":127.0},
    "northEast":{"latitude":37.51,"longitude":127.01}
  },
  "area":{
    "outer":[
      {"latitude":37.5,"longitude":127.0},
      {"latitude":37.5,"longitude":127.01},
      {"latitude":37.51,"longitude":127.01},
      {"latitude":37.51,"longitude":127.0},
      {"latitude":37.5,"longitude":127.0}
    ],
    "holes":[]
  },
  "station":{"latitude":37.505,"longitude":127.005},
  "points":[{"id":"40","name":"잔디광장","position":{"latitude":37.506,"longitude":127.006}}],
  "schedule":[{"id":"50","time":"10:00","label":"오전 순찰","on":true,"repeat":"daily"}]
}
```

분리수거장 미등록 시 station=null, 미설정 points/schedule은 []예요.

### PUT /route — 전체 설정 원자적 저장·완료

요청:
```json
{
  "station":{"latitude":37.505,"longitude":127.005},
  "points":[{"name":"잔디광장","position":{"latitude":37.506,"longitude":127.006}}],
  "schedule":[{"time":"10:00","label":"오전 순찰","on":true,"repeat":"daily"}]
}
```

- station 필수, points 1~100개, schedule 1~100개.
- 성공하면 GET /route 형태를 반환하고 parks.route_setup_done=true로 바꿔요.
- 분리수거장·경로·시간표·변경 로그·완료 여부가 하나의 트랜잭션이에요. 한 항목이라도 실패하면 모두 롤백해요.
- parkName/bounds/area를 요청에 포함해도 현재 연결된 카탈로그 값을 사용해요.
- 시간표가 전부 on=false여도 한 개 이상이면 완료할 수 있어요.
- 앱은 성공 응답을 받은 후 완료 화면으로 이동해요. 실패 시 입력을 유지해요.

### POST /route/complete — 개별 저장 후 완료

요청 body 없음. 200: `{"routeSetupDone":true}`.
분리수거장·활성 경로·시간표가 존재하는지 검사해요. 하나라도 없으면 409 setup_incomplete.
현재 구현은 이 완료 요청에서 저장된 좌표를 최신 카탈로그 경계로 다시 검사하지 않아요.
전체 설정을 다시 검증·저장하려면 PUT /route를 사용해요.

## 6. 총관리자 승인·로봇 관리

### GET /admin/park-requests — 공원 신청 목록

Query: status?(pending/approved/rejected, 생략 시 전체), limit=20(1~100), offset=0(0~10000).
200: ManagedPark[] 항목에 **userId, applicantName, createdAt**이 추가된 배열.
생성 시각·ID 순서예요. 빈 목록은 [].
userId는 신청한 하위관리자 번호예요.

### POST /admin/parks/{park_id}/approve — 승인 및 로봇 할당

요청: `{"robotIds":["1","2"]}`.
200: status=approved인 ManagedPark. approvedBy와 approvedAt이 채워지고 rejectReason은 null이에요.

- URL park_id는 **신청 행 parks.id**예요. catalogId가 아니에요.
- pending 신청만 가능하고 신청자의 현재 역할이 manager여야 해요.
- 카탈로그 공원도 활성 상태여야 해요.
- robotIds 1~100개, 중복 불가. 모든 로봇은 미할당이고 idle 또는 offline이어야 해요.
- 신청 승인과 모든 로봇의 park_id/assigned_at 설정을 한 트랜잭션으로 처리해요.
- 같은 카탈로그 공원에 이미 approved 신청이 있으면 승인하지 않아요.
- 로봇 할당은 실제 온라인 연결이나 주행을 시작하지 않아요. offline 상태도 자동 변경하지 않아요.
- 요청 직렬화·행 잠금·부분 유일 인덱스로 중복 승인과 로봇 중복 할당을 막아요.

오류: 404 park_request_not_found / robot_not_found,
409 park_request_not_pending / invalid_applicant_role / park_catalog_inactive / park_already_approved / robot_already_assigned / robot_not_available,
422 validation_error. 동시 요청의 DB 제약 충돌은 409 settings_conflict일 수 있어요.

### POST /admin/parks/{park_id}/reject — 반려

요청: `{"reason":"운영 준비 후 다시 신청해 주세요"}`.
reason은 앞뒤 공백 제거 후 1~1000자.
200: status=rejected인 ManagedPark. rejectReason이 채워지고 approvedBy/approvedAt은 null이에요.
pending만 처리해요. 이미 approved/rejected이면 409 park_request_not_pending.
없는 신청은 404 park_request_not_found.

### POST /admin/robots — 로봇 등록

요청: `{"name":"주비 1호","serialNo":"JUBI-EXAMPLE-001"}`.
name/serialNo는 앞뒤 공백 제거 후 1~100자. serialNo는 유일해요.

201 예:
```json
{
  "id":"1",
  "name":"주비 1호",
  "serialNo":"JUBI-EXAMPLE-001",
  "parkId":null,
  "status":"offline",
  "assignedAt":null,
  "createdAt":"2026-11-13T00:00:00Z"
}
```

등록만으로 공원에 할당되지 않아요.
중복 serialNo는 409 robot_serial_exists, 동시 등록 충돌은 409 settings_conflict일 수 있어요.

### GET /admin/robots — 로봇 목록

Query: unassigned=false(boolean), limit=20(1~100), offset=0(0~10000).
unassigned=true이면 parkId=null인 로봇만, false이면 전체예요.
200: RobotResponse[] (위 로봇 응답 형식). ID 순서.
상태 값: idle/working/charging/offline/error.
목록은 가용 상태 필터가 아니므로 승인 화면은 할당 여부와 상태를 함께 확인해요.

### GET /robots — 내 할당 로봇

Query/body 없음. manager의 approved 공원에 할당된 RobotResponse[]를 반환해요.
본인 공원만 조회해요. 총관리자 전체 목록은 /admin/robots를 사용해요.

총관리자 API 공통 오류: 401 invalid_token, 403 super_admin_required,
DB 처리 실패 503 patrol_unavailable, 제약 충돌 409 settings_conflict.

## 7. 상태 확인

### GET /health

인증 없이 DB SELECT 1 연결을 확인해요.
200: `{"status":"ok","db":"ok"}`.
실패: 503 db_unavailable.
로봇 온라인 상태나 다른 외부 서비스의 정상 작동까지 보장하는 API는 아니에요.

## 8. 공통 오류

```json
{"status":403,"message":"총관리자의 공원 승인을 기다려 주세요","code":"park_not_approved"}
```

유효성 오류는 details에 필드와 이유를 포함해요:
```json
{
  "status":422,
  "message":"입력값을 확인해 주세요",
  "code":"validation_error",
  "details":[{"field":"body.points","reason":"입력 조건을 확인해 주세요"}]
}
```

거리 오류의 details 형식은 달라요:
```json
{"status":422,"message":"기존 지점과 너무 멀어요","code":"point_too_far","details":{"distanceMeters":1500,"maxDistanceMeters":1000}}
```
위 message/reason은 형식 설명용 예시예요. 클라이언트 분기는 code와 status 기준으로 해요.

| HTTP | code | 의미 |
| --- | --- | --- |
| 401 | invalid_credentials | 로그인 정보 불일치 |
| 401 | invalid_token | Bearer 누락·만료·변조·삭제된 계정. WWW-Authenticate: Bearer |
| 403 | manager_required | 하위관리자 전용 |
| 403 | super_admin_required | 총관리자 전용 |
| 403 | park_not_approved | 본인 공원이 pending/rejected |
| 404 | park_not_found | 공원 미선택 또는 선택한 목록 공원이 없음/비활성 |
| 404 | park_request_not_found | 신청 번호 없음 |
| 404 | robot_not_found | 로봇 번호 없음 |
| 409 | account_exists | 아이디·이메일 중복 |
| 409 | park_required | 먼저 공원 신청 필요 |
| 409 | station_required | 먼저 분리수거장 등록 필요 |
| 409 | setup_incomplete | 완료에 필요한 설정 없음 |
| 409 | approved_park_change_forbidden | 승인된 공원 변경 시도 |
| 409 | park_request_not_pending | 이미 처리된 신청 |
| 409 | invalid_applicant_role | 신청자가 manager가 아님 |
| 409 | park_catalog_inactive | 운영 불가 목록 공원 |
| 409 | park_already_approved | 같은 목록 공원이 이미 승인됨 |
| 409 | robot_already_assigned | 이미 할당된 로봇 |
| 409 | robot_not_available | 로봇 상태가 할당 불가 |
| 409 | robot_serial_exists | 기기 식별 번호 중복 |
| 409 | settings_conflict | 동시 저장 등의 DB 제약 충돌 |
| 422 | validation_error | 타입·형식·범위 오류 |
| 422 | point_outside_park | 공원 경계 밖 지점/분리수거장 |
| 422 | point_too_far | 1km 연결 조건 위반 |
| 422 | duplicate_schedule | 겹치는 순찰 시각 |
| 503 | auth_not_configured | JWT 서명 설정 문제 |
| 503 | park_catalog_unavailable | 공원 목록 조회 실패 |
| 503 | patrol_unavailable | 순찰·승인·할당 DB 처리 실패 |
| 503 | db_unavailable | health의 DB 연결 실패 |
| 500 | internal_error | 처리하지 못한 서버 오류 |

## 9. 현재 구현으로 연결 가능한 흐름

1. POST /auth/register → 계정 생성.
2. POST /auth/login → 토큰 저장.
3. GET /parks?query=... → 검색 결과 선택.
4. PUT /park {catalogId} → pending 신청.
5. GET /park 또는 GET /me → 승인 상태 확인.
6. 총관리자: 로봇 등록 → 신청 목록 조회 → 승인 요청에 robotIds 지정.
7. manager: approved 확인 → PUT /route 일괄 저장 → 초기 설정 완료.
8. 이후 GET/PUT /route로 수정. 또는 /station → /routes → /schedules → POST /route/complete로 개별 저장.

PUT /park와 PUT /route는 서로 다른 요청/트랜잭션이에요.
설정 저장이 실패해도 앞서 저장한 공원 신청은 남아요.

## 10. Figma 변경사항·미구현 구분

**현재 Figma Page 2의 회원가입 시안과 서버 구현을 혼동하지 않도록 해요.**

| 항목 | 현재 구현 | 추가 작업 |
| --- | --- | --- |
| 회원가입 중 공원 선택 | 가입 API는 계정만 생성, 공원 신청은 로그인 후 별도 | 가입+공원 선택을 이어주는 계약/화면 변경 |
| 승인 전 로그인 | 로그인 허용, 운영 기능은 서버에서 차단 | 시안의 “승인 후 로그인 가능” 정책을 적용하려면 인증 흐름 재설계 |
| 승인 알림 | 상태 조회 가능, 알림 발송 없음 | 푸시/알림·상태 갱신 연결 |
| 위치 기반 공원 검색 | 제거됨, 이름·주소만 검색 | 시안의 내 위치 버튼·거리 표시 정리 |
| 실제 주행 경로 미리보기 | 미구현 | KAN-94. /routes 응답을 실제 이동 polyline으로 간주하지 않기 |
| 로봇 상태·작업 대기열·지도·알림·로그 조회·일일 보고·WebSocket | 이번 서버 라우터에 미구현 | 각 기능 작업에서 계약 확정 후 추가 |
| 순찰 시간표 자동 실행·SLAM 좌표 변환 | 설정 저장만 구현 | 로봇/실행기 연동 |
| 로봇 회수·재배치·승인 취소·담당자 변경·할당 이력 | 미구현 | 진행 중 작업 정리 규칙과 이력 정책 결정 |

경로 변경 로그는 DB에 저장하지만 로그 조회 API까지 구현된 것은 아니에요.
카탈로그 경계 변경 시 기존 저장 지점은 자동으로 이동/비활성화되지 않아요. 실행 전 유효성 검증은 실행기 연동에서 추가해야 해요.

## 11. 근거·관련 작업

- 구현 근거: server/app/routers/{auth,api,parks,patrol,approval,health}.py, server/app/schemas/, server/app/services/.
- 저장소 전달 문서: server/AUTH.md, server/PARKS.md, server/PATROL.md, server/ADMIN.md.
- 인증: [KAN-88](https://kdt-3team-finalterm.atlassian.net/browse/KAN-88).
- 순찰 설정: [KAN-93](https://kdt-3team-finalterm.atlassian.net/browse/KAN-93).
- 실제 경로 미리보기(미구현): [KAN-94](https://kdt-3team-finalterm.atlassian.net/browse/KAN-94).
- 앱 실제 API 연결: [KAN-29](https://kdt-3team-finalterm.atlassian.net/browse/KAN-29).
- [Figma Page 2 회원가입](https://www.figma.com/design/8jxiaGJ8smbceYuXug5roD/Untitled?node-id=211-2653).
- 기존 KAN-23의 경로 미리보기 요청 댓글은 그대로 보존하며, 그 제안 경로를 현재 구현 API로 확정하지 않아요.

