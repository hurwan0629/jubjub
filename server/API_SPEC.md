# JUBJUB API 명세서

기존 명세 기준일: 2026-11-20 (KST). 2026-11-23 DB 0015에 맞춘 로봇 상태·인증·활동 조회·순찰 제어와 WebSocket 계약은 [ROBOT_PROTOCOL_API.md](ROBOT_PROTOCOL_API.md)에 추가했어요. 최신 전체 HTTP 경로와 요청 스키마는 서버의 `/docs`, `/openapi.json`에서 확인해요. 코드 기준이며 원격 서버 배포 완료를 의미하지 않아요.

기존 명세 형식: [KAN-23](https://kdt-3team-finalterm.atlassian.net/browse/KAN-23)

## 1. 공통 규칙

| 항목 | 내용 |
| --- | --- |
| 서버 기본 주소 | http://localhost:8000 — 휴대폰에서는 서버 PC의 사설 IP:8000 사용 |
| 문서 주소 | /docs (Swagger), /openapi.json (OpenAPI). 아래 경로에 /api 접두사는 없습니다. 웹 개발 프록시 /api는 클라이언트 설정입니다. |
| 요청·응답 | JSON / Content-Type: application/json / camelCase |
| 일반 인증 | Authorization: Bearer <accessToken> |
| 공개 HTTP 경로 | GET /health, GET /parks, POST /auth/register, POST /auth/login, POST /auth/reapplication-session, POST /auth/reapply. 재신청은 자체 본인 확인·전용 토큰 검증이 있습니다. |
| 역할 | manager: 하위관리자 앱 / super_admin: 총관리자 웹. /admin/*는 서버에서 총관리자 권한 검사. /me는 둘 다 허용. 일반 공원·순찰·로봇 API는 manager만 허용. |
| 승인 정책 | pending·rejected manager는 일반 업무 API를 기존 토큰으로도 호출할 수 없습니다. 승인 취소 시 즉시 차단합니다. |
| ID | 응답·JSON 본문 ID는 문자열. Path·Query ID는 URL의 양의 정수로 서버가 변환합니다. Query·Path 상한 9223372036854775807. 이름이 같아 보여도 userId, parkId, catalogId, robotId는 별개입니다. |
| 목록·페이지 | 목록은 data/total 포장 없는 배열. 해당 API가 지원하는 limit·offset으로 조회합니다. 빈 결과는 []입니다. |
| 시각·좌표 | 시각은 ISO 8601, 화면에서 KST 변환. 시간표 HH:mm은 현지 운영 시간 계약으로 타임존 필드는 없습니다. 위도·경도는 latitude/longitude, 로봇 SLAM 좌표는 slamX/slamY입니다. |
| 저장·예시 | 설정 변경은 트랜잭션으로 처리합니다. 아래 계정·ID·좌표는 가상 예시이며 실제 호출은 공원 검색 결과와 실제 경계 안 좌표를 사용합니다. |

```http
Content-Type: application/json
Authorization: Bearer <accessToken>
```

### ID 구분

| 예시 필드 | 테이블·의미 | 사용 위치 |
| --- | --- | --- |
| userId="12" | users.id — 계정 | /admin/registrations/{user_id} |
| parkId="5" | parks.id — 관리자와 연결된 운영 공원 | 로봇 배정, /admin/parks/{park_id}/approve |
| catalogId="69" | park_catalog_entries.id — 물리적 공원 목록 | 공원 검색·가입·공원 변경·편집 대상 검증 |
| robotId="6" | robots.id — 로봇 | 로봇 상세·로봇별 순찰 설정 |
| requestId="31" | park_change_requests.id — 변경 요청 | 공원 변경 취소·승인·반려 |

### 다중 로봇·편집 일관성

- robotId가 있는 순찰 API는 공원 배정 로봇이 2대 이상이면 반드시 지정합니다(미지정 422 robot_required). 1대면 생략 시 자동 선택, 0대면 robotId=null 미배정 초안을 저장합니다.
- 분리수거장은 공원 공통, 경로·시간표는 로봇별입니다. 첫 로봇 배정 때 초안을 독립 설정으로 복사합니다.
- 응답의 catalogId를 편집 화면에서 보관하고 PUT /route·PUT /routes의 body.catalogId, PUT /station·PUT /schedules·POST /route/complete의 query.catalogId로 돌려보냅니다.
- catalogId가 달라지면 409 park_changed입니다. 과거 공원 변경 승인이 있는 공원은 catalogId를 생략해도 409이므로 신규 클라이언트는 항상 전달해야 합니다.
- 지점은 공원 외곽 안·holes 밖이어야 합니다(다각형 경계 자체는 허용). 분리수거장부터 다른 지점과 1km 이내로 연결되는지 검사하며, 인접한 배열 항목끼리만 검사하는 방식은 아닙니다.
- PUT /schedules는 빈 배열을 허용하지만 PUT /route의 schedule은 최소 1개입니다. 초기 완료 확인은 시간표 행 존재 기준이며 on=true 항목 존재 여부를 별도로 강제하지 않습니다.

## 2. 전체 API 목록

| 번호 | 기능 | Method | Path | 권한 |
| --- | --- | --- | --- | --- |
| 1 | 서버·DB 상태 확인 | GET | /health | 공개·전용 검증 |
| 2 | 공원 검색 | GET | /parks | 공개·전용 검증 |
| 3 | 회원가입 신청 | POST | /auth/register | 공개·전용 검증 |
| 4 | 로그인 | POST | /auth/login | 공개·전용 검증 |
| 5 | 반려 사유·재신청 정보 조회 | POST | /auth/reapplication-session | 공개·전용 검증 |
| 6 | 반려된 가입 신청 수정·재제출 | POST | /auth/reapply | 공개·전용 검증 |
| 7 | 내 계정 조회 | GET | /me | 승인된 하위·총관리자 |
| 8 | 담당 공원 조회 | GET | /park | 승인된 하위관리자 |
| 9 | 담당 공원 선택 — 기존 호환 API | PUT | /park | 승인된 하위관리자 |
| 10 | 선택한 분리수거장 조회 | GET | /station | 승인된 하위관리자 |
| 11 | 공유 분리수거장 저장 | PUT | /station | 승인된 하위관리자 |
| 12 | 로봇별 순찰 경로 조회 | GET | /routes | 승인된 하위관리자 |
| 13 | 로봇별 순찰 지점·순서 저장 | PUT | /routes | 승인된 하위관리자 |
| 14 | 로봇별 순찰 시간표 조회 | GET | /schedules | 승인된 하위관리자 |
| 15 | 로봇별 순찰 시간표 교체 | PUT | /schedules | 승인된 하위관리자 |
| 16 | 로봇별 전체 순찰 설정 조회 | GET | /route | 승인된 하위관리자 |
| 17 | 전체 순찰 설정 일괄 저장 | PUT | /route | 승인된 하위관리자 |
| 18 | 개별 순찰 설정 완료 처리 | POST | /route/complete | 승인된 하위관리자 |
| 19 | 총관리자 — 가입 신청 목록 | GET | /admin/registrations | 총관리자 |
| 20 | 총관리자 — 가입 승인 | POST | /admin/registrations/{user_id}/approve | 총관리자 |
| 21 | 총관리자 — 가입 반려 | POST | /admin/registrations/{user_id}/reject | 총관리자 |
| 22 | 총관리자 — 기존 가입 승인 취소 | POST | /admin/registrations/{user_id}/revoke | 총관리자 |
| 23 | 총관리자 — 공원 신청 목록(호환) | GET | /admin/park-requests | 총관리자 |
| 24 | 총관리자 — 공원 ID로 승인(호환) | POST | /admin/parks/{park_id}/approve | 총관리자 |
| 25 | 총관리자 — 공원 ID로 반려(호환) | POST | /admin/parks/{park_id}/reject | 총관리자 |
| 26 | 총관리자 — 로봇 등록 | POST | /admin/robots | 총관리자 |
| 27 | 총관리자 — 전체·미배정 로봇 목록 | GET | /admin/robots | 총관리자 |
| 28 | 내 공원의 배정 로봇 목록 | GET | /robots | 승인된 하위관리자 |
| 29 | 내 공원의 로봇 상세 조회 | GET | /robots/{robot_id} | 승인된 하위관리자 |
| 30 | 내 공원 로봇 이름 수정 | PATCH | /robots/{robot_id} | 승인된 하위관리자 |
| 31 | 내 공원 변경 요청 이력 | GET | /park-change-requests | 승인된 하위관리자 |
| 32 | 담당 공원 변경 신청 | POST | /park-change-requests | 승인된 하위관리자 |
| 33 | 내 공원 변경 요청 취소 | POST | /park-change-requests/{request_id}/cancel | 승인된 하위관리자 |
| 34 | 총관리자 — 공원 변경 요청 목록 | GET | /admin/park-change-requests | 총관리자 |
| 35 | 총관리자 — 공원 변경 승인 | POST | /admin/park-change-requests/{request_id}/approve | 총관리자 |
| 36 | 총관리자 — 공원 변경 반려 | POST | /admin/park-change-requests/{request_id}/reject | 총관리자 |
| 37 | 총관리자 — 운영 공원 목록 | GET | /admin/parks | 총관리자 |
| 38 | 총관리자 — 로봇 공원 배정·이동·회수 | PATCH | /admin/robots/{robot_id}/assignment | 총관리자 |
| 39 | 최초·추가 로봇 배정 요청 | POST | /robot-assignment-requests | 승인된 하위관리자 |
| 40 | 내 로봇 배정 요청 이력 | GET | /robot-assignment-requests | 승인된 하위관리자 |
| 41 | 내 로봇 배정 요청 취소 | POST | /robot-assignment-requests/{request_id}/cancel | 승인된 하위관리자 |
| 42 | 총관리자 — 로봇 배정 요청 목록 | GET | /admin/robot-assignment-requests | 총관리자 |
| 43 | 총관리자 — 요청 승인과 실제 로봇 배정 | POST | /admin/robot-assignment-requests/{request_id}/approve | 총관리자 |
| 44 | 총관리자 — 로봇 배정 요청 반려 | POST | /admin/robot-assignment-requests/{request_id}/reject | 총관리자 |
| 45 | 분리수거장 목록 | GET | /stations | 승인된 하위관리자 |
| 46 | 분리수거장 등록 | POST | /stations | 승인된 하위관리자 |
| 47 | 분리수거장 수정 | PATCH | /stations/{station_id} | 승인된 하위관리자 |
| 48 | 분리수거장 삭제 | DELETE | /stations/{station_id} | 승인된 하위관리자 |
| 49 | 탐지 사진 업로드 | PUT | /detections/{detection_id}/photo | 승인된 하위관리자 |
| 50 | 탐지 사진 임시 주소 조회 | GET | /detections/{detection_id}/photo | 승인된 하위관리자 |
| 51 | 내 알림 목록 | GET | /notifications | 승인된 하위·총관리자 |
| 52 | 내 미확인 알림 개수 | GET | /notifications/unread-count | 승인된 하위·총관리자 |
| 53 | 내 알림 상세 | GET | /notifications/{notification_id} | 승인된 하위·총관리자 |
| 54 | 내 알림 읽음 처리 | PATCH | /notifications/{notification_id}/read | 승인된 하위·총관리자 |
| 55 | Expo 기기 토큰 등록·갱신 | PUT | /push-tokens | 승인된 하위·총관리자 |
| 56 | 현재 기기 토큰 해제 | DELETE | /push-tokens | 승인된 하위·총관리자 |

## 3.01. 서버·DB 상태 확인

### GET /health

기능: SELECT 1로 DB 연결을 확인합니다. 로봇·외부 서비스 정상 여부까지 의미하지 않습니다.

권한: 일반 Bearer 토큰 불필요. 위 기능의 자체 검증 조건 적용

#### 요청

```http
GET /health
```

요청 본문: 없음.

#### 응답

성공: HTTP 200 · HealthResponse

```json
{
  "status": "ok",
  "db": "ok"
}
```

주요 업무 오류: 503 db_unavailable. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.02. 공원 검색

### GET /parks

기능: 활성 공원만 이름·ID 순서로 반환합니다. 이름 또는 주소에 검색 단어가 모두 포함되어야 합니다. 공백 검색어·검색 결과 없음은 []입니다. 거리순 검색은 없고 distance는 빈 문자열입니다.

권한: 일반 Bearer 토큰 불필요. 위 기능의 자체 검증 조건 적용

#### 요청

```http
GET /parks?query=예시공원&limit=20&offset=0
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | query | 선택 | string | 최대 문자 수: 100; 기본값: "" |
| query | limit | 선택 | integer | 최솟값: 1; 최댓값: 100; 기본값: 20 |
| query | offset | 선택 | integer | 최솟값: 0; 최댓값: 10000; 기본값: 0 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · ParkResponse[]

```json
[
  {
    "id": "69",
    "name": "예시공원",
    "address": "서울특별시 예시 주소",
    "distance": "",
    "bounds": {
      "southWest": {
        "latitude": 37.54,
        "longitude": 127.03
      },
      "northEast": {
        "latitude": 37.55,
        "longitude": 127.04
      }
    },
    "area": {
      "outer": [
        {
          "latitude": 37.54,
          "longitude": 127.03
        },
        {
          "latitude": 37.54,
          "longitude": 127.04
        },
        {
          "latitude": 37.55,
          "longitude": 127.04
        },
        {
          "latitude": 37.55,
          "longitude": 127.03
        },
        {
          "latitude": 37.54,
          "longitude": 127.03
        }
      ],
      "holes": []
    }
  }
]
```

주요 업무 오류: 503 park_catalog_unavailable. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.03. 회원가입 신청

### POST /auth/register

기능: 가입 계정과 담당 공원을 하나의 트랜잭션으로 생성합니다. manager 역할만 생성하고 pending으로 대기합니다. 토큰은 발급하지 않습니다. 비밀번호 확인·개인정보 동의는 앱에서 검사합니다. 아이디는 대소문자를 구분하고 이메일은 소문자로 정규화합니다. 정의하지 않은 필드는 422입니다.

권한: 일반 Bearer 토큰 불필요. 위 기능의 자체 검증 조건 적용

#### 요청

```http
POST /auth/register
```

본문: RegisterRequest — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "loginId": "manager01",
  "password": "ExamplePass123!",
  "name": "공원 관리자",
  "phone": "010-1234-5678",
  "email": "manager@example.com",
  "catalogId": "69"
}
```

#### 응답

성공: HTTP 201 · RegisterResponse

```json
{
  "name": "공원 관리자",
  "email": "manager@example.com",
  "role": "manager",
  "parkStatus": "pending",
  "routeSetupDone": false,
  "registrationStatus": "pending",
  "id": "12"
}
```

주요 업무 오류: 404 park_not_found; 409 account_exists; 503 registration_unavailable. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.04. 로그인

### POST /auth/login

기능: 비밀번호 확인 후 승인된 계정에만 토큰을 발급합니다. pending·rejected는 403입니다. 총관리자는 웹에서 로그인하며 앱은 web_login_required로 안내합니다(앱 자체 오류). isFirstLogin은 최초 로그인 횟수가 아니라 manager의 순찰 초기 설정 필요 여부입니다.

권한: 일반 Bearer 토큰 불필요. 위 기능의 자체 검증 조건 적용

#### 요청

```http
POST /auth/login
```

본문: LoginRequest — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "loginId": "manager01",
  "password": "ExamplePass123!"
}
```

#### 응답

성공: HTTP 200 · LoginResponse

```json
{
  "role": "manager",
  "parkStatus": "approved",
  "routeSetupDone": false,
  "registrationStatus": "approved",
  "accessToken": "<accessToken>",
  "tokenType": "bearer",
  "expiresIn": 3600,
  "isFirstLogin": true
}
```

주요 업무 오류: 401 invalid_credentials; 403 registration_pending / registration_rejected / registration_incomplete; 503 auth_not_configured. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.05. 반려 사유·재신청 정보 조회

### POST /auth/reapplication-session

기능: 기존 아이디·비밀번호로 본인 확인한 반려 manager만 호출할 수 있습니다. 기존 정보와 반려 사유, 30분 유효한 재신청 전용 토큰을 반환합니다. 비밀번호는 반환하지 않습니다. park는 활성 공원일 때 기존 선택 정보이고, 비활성 공원은 null입니다. 일반 업무 API에는 이 토큰을 사용할 수 없습니다.

권한: 일반 Bearer 토큰 불필요. 위 기능의 자체 검증 조건 적용

#### 요청

```http
POST /auth/reapplication-session
```

본문: LoginRequest — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "loginId": "manager01",
  "password": "ExamplePass123!"
}
```

#### 응답

성공: HTTP 200 · ReapplicationSession

```json
{
  "reapplicationToken": "<reapplicationToken>",
  "expiresIn": 1800,
  "loginId": "manager01",
  "name": "공원 관리자",
  "email": "manager@example.com",
  "phone": "01012345678",
  "catalogId": "69",
  "rejectReason": "담당자 정보를 확인해 주세요",
  "park": {
    "id": "69",
    "name": "예시공원",
    "address": "서울특별시 예시 주소",
    "distance": "",
    "bounds": {
      "southWest": {
        "latitude": 37.54,
        "longitude": 127.03
      },
      "northEast": {
        "latitude": 37.55,
        "longitude": 127.04
      }
    },
    "area": {
      "outer": [
        {
          "latitude": 37.54,
          "longitude": 127.03
        },
        {
          "latitude": 37.54,
          "longitude": 127.04
        },
        {
          "latitude": 37.55,
          "longitude": 127.04
        },
        {
          "latitude": 37.55,
          "longitude": 127.03
        },
        {
          "latitude": 37.54,
          "longitude": 127.03
        }
      ],
      "holes": []
    }
  }
}
```

주요 업무 오류: 401 invalid_credentials; 409 registration_not_rejected; 503 auth_not_configured. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.06. 반려된 가입 신청 수정·재제출

### POST /auth/reapply

기능: 일반 Bearer 토큰 대신 본문의 reapplicationToken을 사용합니다. 같은 계정·신청 행을 수정하고 pending으로 되돌립니다. loginId·role 입력은 허용하지 않습니다. 비밀번호를 새로 입력하며 이전 비밀번호를 반환하거나 자동 채우지 않습니다. 다른 공원을 고르면 이전 경로·지점·시간표·좌표 기준점을 초기화하고 미처리 공원 변경 요청은 취소합니다. 제출 후 토큰을 다시 사용할 수 없으며 다시 승인받아야 로그인할 수 있습니다.

권한: 일반 Bearer 토큰 불필요. 위 기능의 자체 검증 조건 적용

#### 요청

```http
POST /auth/reapply
```

본문: ReapplyRequest — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "password": "ExamplePass123!",
  "name": "공원 관리자",
  "phone": "010-1234-5678",
  "email": "manager@example.com",
  "catalogId": "69",
  "reapplicationToken": "<reapplicationToken>"
}
```

#### 응답

성공: HTTP 200 · RegisterResponse

```json
{
  "name": "공원 관리자",
  "email": "manager@example.com",
  "role": "manager",
  "parkStatus": "pending",
  "routeSetupDone": false,
  "registrationStatus": "pending",
  "id": "12"
}
```

주요 업무 오류: 401 invalid_token; 404 park_not_found; 409 account_exists / registration_not_rejected; 503 registration_unavailable / auth_not_configured. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.07. 내 계정 조회

### GET /me

기능: 토큰 소유자의 이름·이메일·역할·가입 승인 상태·초기 설정 완료 여부를 반환합니다. 총관리자는 parkStatus=null, registrationStatus=approved입니다.

권한: 승인된 manager 또는 super_admin Bearer 토큰

#### 요청

```http
GET /me
```

요청 본문: 없음.

#### 응답

성공: HTTP 200 · ProfileResponse

```json
{
  "name": "공원 관리자",
  "email": "manager@example.com",
  "role": "manager",
  "parkStatus": "approved",
  "routeSetupDone": false,
  "registrationStatus": "approved"
}
```

오류: 5장의 공통 인증·입력 검증·서버 오류를 적용합니다.

## 3.08. 담당 공원 조회

### GET /park

기능: 로그인한 manager의 운영 공원과 지도 정보·승인 정보를 반환합니다. id는 parks.id, catalogId는 공원 목록 ID입니다. pending·rejected 계정은 공통 인증 단계에서 차단됩니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
GET /park
```

요청 본문: 없음.

#### 응답

성공: HTTP 200 · ManagedPark

```json
{
  "id": "5",
  "catalogId": "69",
  "name": "예시공원",
  "address": "서울특별시 예시 주소",
  "center": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "bounds": {
    "southWest": {
      "latitude": 37.54,
      "longitude": 127.03
    },
    "northEast": {
      "latitude": 37.55,
      "longitude": 127.04
    }
  },
  "area": {
    "outer": [
      {
        "latitude": 37.54,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.03
      }
    ],
    "holes": []
  },
  "status": "approved",
  "reviewedBy": "8",
  "reviewedAt": "2026-11-18T03:00:00Z",
  "rejectReason": null,
  "routeSetupDone": false,
  "anchorPoints": []
}
```

주요 업무 오류: 404 park_not_found. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.09. 담당 공원 선택 — 기존 호환 API

### PUT /park

기능: 현재 공개 가입은 /auth/register에서 공원을 함께 저장합니다. 승인 계정은 같은 catalogId 요청에는 기존 공원을 반환하고, 다른 공원으로 직접 바꾸는 요청은 거부합니다. pending·rejected는 인증 단계에서 차단되어 이 API로 재신청할 수 없습니다. 공원 변경은 /park-change-requests, 반려 재신청은 /auth/reapply를 사용합니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
PUT /park
```

본문: ParkSelection — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "catalogId": "69"
}
```

#### 응답

성공: HTTP 200 · ManagedPark

```json
{
  "id": "5",
  "catalogId": "69",
  "name": "예시공원",
  "address": "서울특별시 예시 주소",
  "center": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "bounds": {
    "southWest": {
      "latitude": 37.54,
      "longitude": 127.03
    },
    "northEast": {
      "latitude": 37.55,
      "longitude": 127.04
    }
  },
  "area": {
    "outer": [
      {
        "latitude": 37.54,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.03
      }
    ],
    "holes": []
  },
  "status": "approved",
  "reviewedBy": "8",
  "reviewedAt": "2026-11-18T03:00:00Z",
  "rejectReason": null,
  "routeSetupDone": false,
  "anchorPoints": []
}
```

주요 업무 오류: 404 park_not_found; 409 approved_park_change_forbidden. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.10. 선택한 분리수거장 조회

### GET /station

기능: robotId에 해당하는 활성 경로의 default_station_id로 좌표를 조회합니다. 경로가 없으면 null이며 등록 목록에서 자동 선택하지 않습니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
GET /station?robotId=6
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | robotId | 선택 | integer / null | 최솟값: 1; 최댓값: 9223372036854775807 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · LatLng / null

```json
{
  "latitude": 37.5433,
  "longitude": 127.0332
}
```

오류: 5장의 공통 인증·입력 검증·서버 오류를 적용합니다.

## 3.11. 공유 분리수거장 저장

### PUT /station

기능: catalogId는 query로 전달합니다. 공원 경계 안 좌표만 허용합니다. 위치를 옮기면 같은 공원의 배정 로봇·미배정 초안의 활성 경로를 모두 검증하고 경로 버전을 함께 갱신합니다. 어느 경로라도 유효하지 않으면 전체 변경을 취소합니다. 여러 장소가 등록되면 단일 좌표 방식은 409 default_station_required이며 defaultStationId로 선택해야 합니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
PUT /station?catalogId=69
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | catalogId | 선택 | integer / null | 최솟값: 1; 최댓값: 9223372036854775807 |

본문: LatLng — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "latitude": 37.5433,
  "longitude": 127.0332
}
```

#### 응답

성공: HTTP 200 · LatLng

```json
{
  "latitude": 37.5433,
  "longitude": 127.0332
}
```

주요 업무 오류: 409 park_changed; 422 point_outside_park / point_too_far; 409 default_station_required; 404 station_not_found. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.12. 로봇별 순찰 경로 조회

### GET /routes

기능: robotId로 대상 로봇을 지정합니다. 미설정이면 id/start/end가 null일 수 있고 points=[]입니다. start/end는 해당 경로 버전의 분리수거장 좌표이며 appliesFrom=nextPatrol입니다. 실제 주행 가능한 polyline 계산 API가 아닙니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
GET /routes?robotId=6
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | robotId | 선택 | integer / null | 최솟값: 1; 최댓값: 9223372036854775807 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · RouteResponse

```json
{
  "catalogId": "69",
  "robotId": "6",
  "id": "20",
  "start": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "points": [
    {
      "name": "정문",
      "position": {
        "latitude": 37.5435,
        "longitude": 127.0334
      },
      "id": "101"
    }
  ],
  "end": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "appliesFrom": "nextPatrol",
  "defaultStationId": "1"
}
```

주요 업무 오류: 404 robot_not_found; 422 robot_required. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.13. 로봇별 순찰 지점·순서 저장

### PUT /routes

기능: body.catalogId로 편집 시작 당시 공원을 확인합니다. points 배열 순서가 순찰 순서입니다. 좌표 중복은 거부하고 분리수거장이 먼저 있어야 합니다. 기존 경로를 비활성화하고 새 버전·새 지점 ID를 생성합니다. 전달한 임시 id를 식별 권한으로 사용하지 않습니다. 다음 순찰 적용 설정이며 실행 중인 로봇에 즉시 경로 명령을 보내는 API가 아닙니다. 여러 장소가 등록되면 단일 좌표 방식은 409 default_station_required이며 defaultStationId로 선택해야 합니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
PUT /routes?robotId=6
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | robotId | 선택 | integer / null | 최솟값: 1; 최댓값: 9223372036854775807 |

본문: RouteInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "catalogId": "69",
  "points": [
    {
      "name": "정문",
      "position": {
        "latitude": 37.5435,
        "longitude": 127.0334
      }
    }
  ]
}
```

#### 응답

성공: HTTP 200 · RouteResponse

```json
{
  "catalogId": "69",
  "robotId": "6",
  "id": "20",
  "start": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "points": [
    {
      "name": "정문",
      "position": {
        "latitude": 37.5435,
        "longitude": 127.0334
      },
      "id": "101"
    }
  ],
  "end": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "appliesFrom": "nextPatrol",
  "defaultStationId": "1"
}
```

주요 업무 오류: 404 robot_not_found; 409 station_required / park_changed; 422 robot_required / point_outside_park / point_too_far; 409 default_station_required; 404 station_not_found. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.14. 로봇별 순찰 시간표 조회

### GET /schedules

기능: robotId로 조회합니다. runAt이 아니라 time=HH:mm, enabled가 아니라 on 필드를 사용합니다. 미설정이면 []입니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
GET /schedules?robotId=6
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | robotId | 선택 | integer / null | 최솟값: 1; 최댓값: 9223372036854775807 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · ScheduleResponse[]

```json
[
  {
    "time": "10:00",
    "label": "오전 순찰",
    "on": true,
    "repeat": "daily",
    "id": "30"
  }
]
```

주요 업무 오류: 404 robot_not_found; 422 robot_required. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.15. 로봇별 순찰 시간표 교체

### PUT /schedules

기능: 본문은 객체가 아닌 배열입니다. 최대 100개이며 []로 비울 수 있습니다. 같은 시각의 동일 repeat와 daily+weekdays/weekends 조합은 중복입니다. 같은 시각의 weekdays+weekends는 허용합니다. on=false여도 중복 검사는 적용됩니다. 비우면 다른 로봇의 완성 설정 유무에 따라 routeSetupDone이 false가 될 수 있습니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
PUT /schedules?robotId=6&catalogId=69
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | robotId | 선택 | integer / null | 최솟값: 1; 최댓값: 9223372036854775807 |
| query | catalogId | 선택 | integer / null | 최솟값: 1; 최댓값: 9223372036854775807 |

본문: ScheduleInput[] — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
[
  {
    "time": "10:00",
    "label": "오전 순찰",
    "on": true,
    "repeat": "daily"
  }
]
```

#### 응답

성공: HTTP 200 · ScheduleResponse[]

```json
[
  {
    "time": "10:00",
    "label": "오전 순찰",
    "on": true,
    "repeat": "daily",
    "id": "30"
  }
]
```

주요 업무 오류: 404 robot_not_found; 409 park_changed; 422 robot_required / duplicate_schedule. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.16. 로봇별 전체 순찰 설정 조회

### GET /route

기능: 분리수거장·지점·시간표·공원 경계를 한 번에 반환합니다. station은 공원 공통이고 경로·시간표는 로봇별입니다. 미설정은 station=null, points=[], schedule=[]입니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
GET /route?robotId=6
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | robotId | 선택 | integer / null | 최솟값: 1; 최댓값: 9223372036854775807 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · ConfigResponse

```json
{
  "catalogId": "69",
  "robotId": "6",
  "parkName": "예시공원",
  "bounds": {
    "southWest": {
      "latitude": 37.54,
      "longitude": 127.03
    },
    "northEast": {
      "latitude": 37.55,
      "longitude": 127.04
    }
  },
  "area": {
    "outer": [
      {
        "latitude": 37.54,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.03
      }
    ],
    "holes": []
  },
  "station": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "points": [
    {
      "name": "정문",
      "position": {
        "latitude": 37.5435,
        "longitude": 127.0334
      },
      "id": "101"
    }
  ],
  "schedule": [
    {
      "time": "10:00",
      "label": "오전 순찰",
      "on": true,
      "repeat": "daily",
      "id": "30"
    }
  ],
  "defaultStationId": "1"
}
```

주요 업무 오류: 404 robot_not_found; 422 robot_required. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.17. 전체 순찰 설정 일괄 저장

### PUT /route

기능: 분리수거장·경로·시간표를 하나의 트랜잭션으로 저장하고 routeSetupDone=true로 완료합니다. points·schedule은 각각 1~100개입니다. body.catalogId와 query.robotId를 사용합니다. 공유 분리수거장 변경은 다른 로봇의 기존 경로도 함께 검증·갱신합니다. 실패하면 일부 항목만 저장되지 않습니다. 여러 장소가 등록되면 단일 좌표 방식은 409 default_station_required이며 defaultStationId로 선택해야 합니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
PUT /route?robotId=6
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | robotId | 선택 | integer / null | 최솟값: 1; 최댓값: 9223372036854775807 |

본문: ConfigInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "catalogId": "69",
  "station": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "points": [
    {
      "name": "정문",
      "position": {
        "latitude": 37.5435,
        "longitude": 127.0334
      }
    }
  ],
  "schedule": [
    {
      "time": "10:00",
      "label": "오전 순찰",
      "on": true,
      "repeat": "daily"
    }
  ]
}
```

#### 응답

성공: HTTP 200 · ConfigResponse

```json
{
  "catalogId": "69",
  "robotId": "6",
  "parkName": "예시공원",
  "bounds": {
    "southWest": {
      "latitude": 37.54,
      "longitude": 127.03
    },
    "northEast": {
      "latitude": 37.55,
      "longitude": 127.04
    }
  },
  "area": {
    "outer": [
      {
        "latitude": 37.54,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.03
      }
    ],
    "holes": []
  },
  "station": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "points": [
    {
      "name": "정문",
      "position": {
        "latitude": 37.5435,
        "longitude": 127.0334
      },
      "id": "101"
    }
  ],
  "schedule": [
    {
      "time": "10:00",
      "label": "오전 순찰",
      "on": true,
      "repeat": "daily",
      "id": "30"
    }
  ],
  "defaultStationId": "1"
}
```

주요 업무 오류: 404 robot_not_found; 409 park_changed; 422 robot_required / point_outside_park / point_too_far / duplicate_schedule; 409 default_station_required; 404 station_not_found. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.18. 개별 순찰 설정 완료 처리

### POST /route/complete

기능: 본문 없이 query.robotId·catalogId를 사용합니다. 대상 로봇(또는 미배정 초안)에 분리수거장·활성 경로·시간표가 모두 있어야 완료합니다. PUT /route는 이 완료 처리를 포함하므로 별도 호출이 필요 없습니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
POST /route/complete?robotId=6&catalogId=69
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | robotId | 선택 | integer / null | 최솟값: 1; 최댓값: 9223372036854775807 |
| query | catalogId | 선택 | integer / null | 최솟값: 1; 최댓값: 9223372036854775807 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · SetupResponse

```json
{
  "routeSetupDone": true
}
```

주요 업무 오류: 404 robot_not_found; 409 setup_incomplete / park_changed; 422 robot_required. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.19. 총관리자 — 가입 신청 목록

### GET /admin/registrations

기능: status 기본값은 pending, all이면 전체입니다. 각 항목은 운영 공원 정보와 신청자 정보를 포함하며 createdAt·id 오름차순입니다. createdAt은 parks 행의 생성 시각으로 재신청할 때 새로 갱신되는 시각은 아닙니다.

권한: 총관리자(super_admin) Bearer 토큰

#### 요청

```http
GET /admin/registrations?status=pending&limit=20&offset=0
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | status | 선택 | string / null | 기본값: "pending"; 허용: all, pending, approved, rejected |
| query | limit | 선택 | integer | 최솟값: 1; 최댓값: 100; 기본값: 20 |
| query | offset | 선택 | integer | 최솟값: 0; 최댓값: 9223372036854775807; 기본값: 0 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · ParkRequestResponse[]

```json
[
  {
    "id": "5",
    "catalogId": "69",
    "name": "예시공원",
    "address": "서울특별시 예시 주소",
    "center": {
      "latitude": 37.5433,
      "longitude": 127.0332
    },
    "bounds": {
      "southWest": {
        "latitude": 37.54,
        "longitude": 127.03
      },
      "northEast": {
        "latitude": 37.55,
        "longitude": 127.04
      }
    },
    "area": {
      "outer": [
        {
          "latitude": 37.54,
          "longitude": 127.03
        },
        {
          "latitude": 37.54,
          "longitude": 127.04
        },
        {
          "latitude": 37.55,
          "longitude": 127.04
        },
        {
          "latitude": 37.55,
          "longitude": 127.03
        },
        {
          "latitude": 37.54,
          "longitude": 127.03
        }
      ],
      "holes": []
    },
    "status": "pending",
    "reviewedBy": null,
    "reviewedAt": null,
    "rejectReason": null,
    "routeSetupDone": false,
    "anchorPoints": [],
    "userId": "12",
    "applicantName": "공원 관리자",
    "applicantLoginId": "manager01",
    "applicantEmail": "manager@example.com",
    "applicantPhone": "01012345678",
    "registrationStatus": "pending",
    "createdAt": "2026-11-18T02:00:00Z"
  }
]
```

오류: 5장의 공통 인증·입력 검증·서버 오류를 적용합니다.

## 3.20. 총관리자 — 가입 승인

### POST /admin/registrations/{user_id}/approve

기능: path에는 계정 user_id를 넣습니다. {}로 로봇 없이도 승인할 수 있습니다. robotIds는 중복 없는 최대 100개입니다. 공원 목록이 활성이고 같은 catalogId에 승인된 다른 관리자가 없어야 합니다. 지정 로봇은 미배정이며 idle 또는 offline이어야 합니다. 초안 설정은 로봇별 독립 설정으로 복사합니다.

권한: 총관리자(super_admin) Bearer 토큰

#### 요청

```http
POST /admin/registrations/12/approve
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | user_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

본문: ApprovalInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "robotIds": [
    "6"
  ]
}
```

#### 응답

성공: HTTP 200 · ManagedPark

```json
{
  "id": "5",
  "catalogId": "69",
  "name": "예시공원",
  "address": "서울특별시 예시 주소",
  "center": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "bounds": {
    "southWest": {
      "latitude": 37.54,
      "longitude": 127.03
    },
    "northEast": {
      "latitude": 37.55,
      "longitude": 127.04
    }
  },
  "area": {
    "outer": [
      {
        "latitude": 37.54,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.03
      }
    ],
    "holes": []
  },
  "status": "approved",
  "reviewedBy": "8",
  "reviewedAt": "2026-11-18T03:00:00Z",
  "rejectReason": null,
  "routeSetupDone": false,
  "anchorPoints": []
}
```

주요 업무 오류: 404 registration_not_found / robot_not_found; 409 park_request_not_pending / park_catalog_inactive / park_already_approved / invalid_applicant_role / robot_already_assigned / robot_not_available. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.21. 총관리자 — 가입 반려

### POST /admin/registrations/{user_id}/reject

기능: 대기 신청만 반려합니다. reason은 공백 제거 후 1~1000자입니다. 승인 정보는 null로 초기화하고 rejectReason을 남깁니다. 응답은 신청자 목록 항목이 아닌 ManagedPark입니다.

권한: 총관리자(super_admin) Bearer 토큰

#### 요청

```http
POST /admin/registrations/12/reject
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | user_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

본문: RejectionInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "reason": "담당 공원 확인이 필요해요"
}
```

#### 응답

성공: HTTP 200 · ManagedPark

```json
{
  "id": "5",
  "catalogId": "69",
  "name": "예시공원",
  "address": "서울특별시 예시 주소",
  "center": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "bounds": {
    "southWest": {
      "latitude": 37.54,
      "longitude": 127.03
    },
    "northEast": {
      "latitude": 37.55,
      "longitude": 127.04
    }
  },
  "area": {
    "outer": [
      {
        "latitude": 37.54,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.03
      }
    ],
    "holes": []
  },
  "status": "rejected",
  "reviewedBy": "8",
  "reviewedAt": "2026-11-18T03:00:00Z",
  "rejectReason": "담당 공원 확인이 필요해요",
  "routeSetupDone": false,
  "anchorPoints": []
}
```

주요 업무 오류: 404 registration_not_found; 409 park_request_not_pending. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.22. 총관리자 — 기존 가입 승인 취소

### POST /admin/registrations/{user_id}/revoke

기능: approved 계정만 취소할 수 있습니다. 모든 배정 로봇이 idle 또는 offline이어야 하고 로봇은 미배정으로 회수합니다. 계정은 rejected로 전환되며 사유를 저장합니다. 이전 로그인 토큰으로도 업무 접근이 즉시 차단됩니다. 이후 반려 재신청 절차를 사용할 수 있습니다.

권한: 총관리자(super_admin) Bearer 토큰

#### 요청

```http
POST /admin/registrations/12/revoke
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | user_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

본문: RejectionInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "reason": "담당 공원 확인이 필요해요"
}
```

#### 응답

성공: HTTP 200 · ManagedPark

```json
{
  "id": "5",
  "catalogId": "69",
  "name": "예시공원",
  "address": "서울특별시 예시 주소",
  "center": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "bounds": {
    "southWest": {
      "latitude": 37.54,
      "longitude": 127.03
    },
    "northEast": {
      "latitude": 37.55,
      "longitude": 127.04
    }
  },
  "area": {
    "outer": [
      {
        "latitude": 37.54,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.03
      }
    ],
    "holes": []
  },
  "status": "rejected",
  "reviewedBy": "8",
  "reviewedAt": "2026-11-18T03:00:00Z",
  "rejectReason": "담당 공원 확인이 필요해요",
  "routeSetupDone": false,
  "anchorPoints": []
}
```

주요 업무 오류: 404 registration_not_found; 409 registration_not_approved / robot_not_available. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.23. 총관리자 — 공원 신청 목록(호환)

### GET /admin/park-requests

기능: 가입 신청 목록의 기존 호환 경로입니다. 기본 status는 없음(전체)이고 all 문자열은 허용하지 않습니다. offset 상한은 10000입니다. 새 클라이언트는 /admin/registrations를 사용합니다.

권한: 총관리자(super_admin) Bearer 토큰

#### 요청

```http
GET /admin/park-requests?status=pending&limit=20&offset=0
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | status | 선택 | string / null | 허용: pending, approved, rejected |
| query | limit | 선택 | integer | 최솟값: 1; 최댓값: 100; 기본값: 20 |
| query | offset | 선택 | integer | 최솟값: 0; 최댓값: 10000; 기본값: 0 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · ParkRequestResponse[]

```json
[
  {
    "id": "5",
    "catalogId": "69",
    "name": "예시공원",
    "address": "서울특별시 예시 주소",
    "center": {
      "latitude": 37.5433,
      "longitude": 127.0332
    },
    "bounds": {
      "southWest": {
        "latitude": 37.54,
        "longitude": 127.03
      },
      "northEast": {
        "latitude": 37.55,
        "longitude": 127.04
      }
    },
    "area": {
      "outer": [
        {
          "latitude": 37.54,
          "longitude": 127.03
        },
        {
          "latitude": 37.54,
          "longitude": 127.04
        },
        {
          "latitude": 37.55,
          "longitude": 127.04
        },
        {
          "latitude": 37.55,
          "longitude": 127.03
        },
        {
          "latitude": 37.54,
          "longitude": 127.03
        }
      ],
      "holes": []
    },
    "status": "pending",
    "reviewedBy": null,
    "reviewedAt": null,
    "rejectReason": null,
    "routeSetupDone": false,
    "anchorPoints": [],
    "userId": "12",
    "applicantName": "공원 관리자",
    "applicantLoginId": "manager01",
    "applicantEmail": "manager@example.com",
    "applicantPhone": "01012345678",
    "registrationStatus": "pending",
    "createdAt": "2026-11-18T02:00:00Z"
  }
]
```

오류: 5장의 공통 인증·입력 검증·서버 오류를 적용합니다.

## 3.24. 총관리자 — 공원 ID로 승인(호환)

### POST /admin/parks/{park_id}/approve

기능: 계정 userId가 아니라 운영 공원 park_id를 받는 기존 호환 API입니다. 처리 규칙·본문·응답은 가입 승인과 같습니다.

권한: 총관리자(super_admin) Bearer 토큰

#### 요청

```http
POST /admin/parks/5/approve
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | park_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

본문: ApprovalInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "robotIds": [
    "6"
  ]
}
```

#### 응답

성공: HTTP 200 · ManagedPark

```json
{
  "id": "5",
  "catalogId": "69",
  "name": "예시공원",
  "address": "서울특별시 예시 주소",
  "center": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "bounds": {
    "southWest": {
      "latitude": 37.54,
      "longitude": 127.03
    },
    "northEast": {
      "latitude": 37.55,
      "longitude": 127.04
    }
  },
  "area": {
    "outer": [
      {
        "latitude": 37.54,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.03
      }
    ],
    "holes": []
  },
  "status": "approved",
  "reviewedBy": "8",
  "reviewedAt": "2026-11-18T03:00:00Z",
  "rejectReason": null,
  "routeSetupDone": false,
  "anchorPoints": []
}
```

주요 업무 오류: 404 park_request_not_found / robot_not_found; 409 park_request_not_pending / park_already_approved / park_catalog_inactive / invalid_applicant_role / robot_already_assigned / robot_not_available. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.25. 총관리자 — 공원 ID로 반려(호환)

### POST /admin/parks/{park_id}/reject

기능: 계정 userId가 아니라 운영 공원 park_id를 받습니다. 대기 중인 신청만 반려하며 새 클라이언트는 /admin/registrations/{user_id}/reject를 사용합니다.

권한: 총관리자(super_admin) Bearer 토큰

#### 요청

```http
POST /admin/parks/5/reject
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | park_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

본문: RejectionInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "reason": "담당 공원 확인이 필요해요"
}
```

#### 응답

성공: HTTP 200 · ManagedPark

```json
{
  "id": "5",
  "catalogId": "69",
  "name": "예시공원",
  "address": "서울특별시 예시 주소",
  "center": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "bounds": {
    "southWest": {
      "latitude": 37.54,
      "longitude": 127.03
    },
    "northEast": {
      "latitude": 37.55,
      "longitude": 127.04
    }
  },
  "area": {
    "outer": [
      {
        "latitude": 37.54,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.04
      },
      {
        "latitude": 37.55,
        "longitude": 127.03
      },
      {
        "latitude": 37.54,
        "longitude": 127.03
      }
    ],
    "holes": []
  },
  "status": "rejected",
  "reviewedBy": "8",
  "reviewedAt": "2026-11-18T03:00:00Z",
  "rejectReason": "담당 공원 확인이 필요해요",
  "routeSetupDone": false,
  "anchorPoints": []
}
```

주요 업무 오류: 404 park_request_not_found; 409 park_request_not_pending. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.26. 총관리자 — 로봇 등록

### POST /admin/robots

기능: name·serialNo는 앞뒤 공백 제거 후 각각 1~100자입니다. serialNo는 고유합니다. 신규 로봇은 실제 연결 확인 전이므로 offline, parkId/assignedAt=null로 생성합니다.

권한: 총관리자(super_admin) Bearer 토큰

#### 요청

```http
POST /admin/robots
```

본문: RobotInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "name": "jub21",
  "serialNo": "jub21"
}
```

#### 응답

성공: HTTP 201 · RobotResponse

```json
{
  "id": "6",
  "name": "jub21",
  "serialNo": "jub21",
  "parkId": null,
  "status": "offline",
  "assignedAt": null,
  "createdAt": "2026-11-18T02:00:00Z",
  "slamX": null,
  "slamY": null,
  "lat": null,
  "lng": null,
  "batteryVoltage": null,
  "lastSeenAt": null,
  "parkName": null,
  "managerId": null,
  "managerName": null,
  "managerLoginId": null
}
```

주요 업무 오류: 409 robot_serial_exists. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.27. 총관리자 — 전체·미배정 로봇 목록

### GET /admin/robots

기능: unassigned=true이면 미배정 로봇만 반환합니다. 기본 false는 전체입니다. id 오름차순, limit·offset 페이지 방식입니다. 배정 로봇은 담당 공원·관리자 필드를 채웁니다.

권한: 총관리자(super_admin) Bearer 토큰

#### 요청

```http
GET /admin/robots?unassigned=false&limit=20&offset=0
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | unassigned | 선택 | boolean | 기본값: false |
| query | limit | 선택 | integer | 최솟값: 1; 최댓값: 100; 기본값: 20 |
| query | offset | 선택 | integer | 최솟값: 0; 최댓값: 9223372036854775807; 기본값: 0 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · RobotResponse[]

```json
[
  {
    "id": "6",
    "name": "jub3",
    "serialNo": "jub3",
    "parkId": "5",
    "status": "offline",
    "assignedAt": "2026-11-18T03:00:00Z",
    "createdAt": "2026-11-18T02:00:00Z",
    "slamX": null,
    "slamY": null,
    "lat": null,
    "lng": null,
    "batteryVoltage": null,
    "lastSeenAt": null,
    "parkName": "예시공원",
    "managerId": "12",
    "managerName": "공원 관리자",
    "managerLoginId": "manager01"
  }
]
```

오류: 5장의 공통 인증·입력 검증·서버 오류를 적용합니다.

## 3.28. 내 공원의 배정 로봇 목록

### GET /robots

기능: 승인된 manager의 공원에 배정된 로봇만 id 오름차순으로 반환합니다. 미배정이면 []입니다. 실제 측정 전 좌표·전압·최근 수신 시각은 null입니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
GET /robots
```

요청 본문: 없음.

#### 응답

성공: HTTP 200 · RobotResponse[]

```json
[
  {
    "id": "6",
    "name": "jub3",
    "serialNo": "jub3",
    "parkId": "5",
    "status": "offline",
    "assignedAt": "2026-11-18T03:00:00Z",
    "createdAt": "2026-11-18T02:00:00Z",
    "slamX": null,
    "slamY": null,
    "lat": null,
    "lng": null,
    "batteryVoltage": null,
    "lastSeenAt": null,
    "parkName": null,
    "managerId": null,
    "managerName": null,
    "managerLoginId": null
  }
]
```

오류: 5장의 공통 인증·입력 검증·서버 오류를 적용합니다.

## 3.29. 내 공원의 로봇 상세 조회

### GET /robots/{robot_id}

기능: 내 공원 소속 로봇만 조회합니다. 다른 공원 또는 없는 로봇은 같은 404로 처리합니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
GET /robots/6
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | robot_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · RobotResponse

```json
{
  "id": "6",
  "name": "jub3",
  "serialNo": "jub3",
  "parkId": "5",
  "status": "offline",
  "assignedAt": "2026-11-18T03:00:00Z",
  "createdAt": "2026-11-18T02:00:00Z",
  "slamX": null,
  "slamY": null,
  "lat": null,
  "lng": null,
  "batteryVoltage": null,
  "lastSeenAt": null,
  "parkName": null,
  "managerId": null,
  "managerName": null,
  "managerLoginId": null
}
```

주요 업무 오류: 404 robot_not_found. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.30. 내 공원 로봇 이름 수정

### PATCH /robots/{robot_id}

기능: 수정 가능한 필드는 name뿐입니다. 기기 식별 번호·경로·시간표는 바뀌지 않습니다. 이름은 앞뒤 공백 제거 후 1~100자입니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
PATCH /robots/6
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | robot_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

본문: RobotNameInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "name": "순찰 로봇"
}
```

#### 응답

성공: HTTP 200 · RobotResponse

```json
{
  "id": "6",
  "name": "순찰 로봇",
  "serialNo": "jub3",
  "parkId": "5",
  "status": "offline",
  "assignedAt": "2026-11-18T03:00:00Z",
  "createdAt": "2026-11-18T02:00:00Z",
  "slamX": null,
  "slamY": null,
  "lat": null,
  "lng": null,
  "batteryVoltage": null,
  "lastSeenAt": null,
  "parkName": null,
  "managerId": null,
  "managerName": null,
  "managerLoginId": null
}
```

주요 업무 오류: 404 robot_not_found. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.31. 내 공원 변경 요청 이력

### GET /park-change-requests

기능: 내 계정의 최신 요청 최대 50개를 id 내림차순으로 반환합니다. 다른 관리자의 요청은 보이지 않습니다. 별도 페이지 query는 없습니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
GET /park-change-requests
```

요청 본문: 없음.

#### 응답

성공: HTTP 200 · ParkChangeResponse[]

```json
[
  {
    "id": "31",
    "parkId": "5",
    "userId": "12",
    "applicantName": "공원 관리자",
    "applicantLoginId": "manager01",
    "currentCatalogId": "69",
    "currentParkName": "예시공원",
    "requestedCatalogId": "70",
    "requestedParkName": "다른 예시공원",
    "requestedParkAddress": "서울특별시 다른 예시 주소",
    "reason": "담당 공원이 변경되었어요",
    "status": "pending",
    "rejectReason": null,
    "createdAt": "2026-11-18T03:00:00Z",
    "reviewedAt": null,
    "conflictingManagerName": null
  }
]
```

오류: 5장의 공통 인증·입력 검증·서버 오류를 적용합니다.

## 3.32. 담당 공원 변경 신청

### POST /park-change-requests

기능: 승인된 manager가 현재 공원과 다른 활성 공원으로 변경을 신청합니다. reason은 공백 제거 후 1~200자입니다. 공원당 pending 요청은 하나만 허용합니다. 이미 관리자가 있는 공원도 신청은 가능하며 conflictingManagerName으로 알려주고 실제 승인은 충돌을 거부합니다. 신청 단계에서는 기존 설정을 유지합니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
POST /park-change-requests
```

본문: ParkChangeInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "catalogId": "70",
  "reason": "담당 공원이 변경되었어요"
}
```

#### 응답

성공: HTTP 201 · ParkChangeResponse

```json
{
  "id": "31",
  "parkId": "5",
  "userId": "12",
  "applicantName": "공원 관리자",
  "applicantLoginId": "manager01",
  "currentCatalogId": "69",
  "currentParkName": "예시공원",
  "requestedCatalogId": "70",
  "requestedParkName": "다른 예시공원",
  "requestedParkAddress": "서울특별시 다른 예시 주소",
  "reason": "담당 공원이 변경되었어요",
  "status": "pending",
  "rejectReason": null,
  "createdAt": "2026-11-18T03:00:00Z",
  "reviewedAt": null,
  "conflictingManagerName": null
}
```

주요 업무 오류: 404 park_not_found; 409 park_change_pending; 422 same_park. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.33. 내 공원 변경 요청 취소

### POST /park-change-requests/{request_id}/cancel

기능: 내 pending 요청만 취소합니다. 타인 요청과 없는 요청은 동일한 404입니다. cancelled와 reviewedAt을 기록하며 기존 공원·로봇·설정은 유지합니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
POST /park-change-requests/31/cancel
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | request_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · ParkChangeResponse

```json
{
  "id": "31",
  "parkId": "5",
  "userId": "12",
  "applicantName": "공원 관리자",
  "applicantLoginId": "manager01",
  "currentCatalogId": "69",
  "currentParkName": "예시공원",
  "requestedCatalogId": "70",
  "requestedParkName": "다른 예시공원",
  "requestedParkAddress": "서울특별시 다른 예시 주소",
  "reason": "담당 공원이 변경되었어요",
  "status": "cancelled",
  "rejectReason": null,
  "createdAt": "2026-11-18T03:00:00Z",
  "reviewedAt": "2026-11-18T03:10:00Z",
  "conflictingManagerName": null
}
```

주요 업무 오류: 404 park_change_not_found; 409 park_change_not_pending. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.34. 총관리자 — 공원 변경 요청 목록

### GET /admin/park-change-requests

기능: status 기본 pending, all은 전체입니다. createdAt·id 내림차순으로 반환합니다. limit 기본값은 100으로 가입 신청 목록(20)과 다릅니다.

권한: 총관리자(super_admin) Bearer 토큰

#### 요청

```http
GET /admin/park-change-requests?status=pending&limit=100&offset=0
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | status | 선택 | string | 허용: all, pending, approved, rejected, cancelled; 기본값: "pending" |
| query | limit | 선택 | integer | 최솟값: 1; 최댓값: 100; 기본값: 100 |
| query | offset | 선택 | integer | 최솟값: 0; 최댓값: 9223372036854775807; 기본값: 0 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · ParkChangeResponse[]

```json
[
  {
    "id": "31",
    "parkId": "5",
    "userId": "12",
    "applicantName": "공원 관리자",
    "applicantLoginId": "manager01",
    "currentCatalogId": "69",
    "currentParkName": "예시공원",
    "requestedCatalogId": "70",
    "requestedParkName": "다른 예시공원",
    "requestedParkAddress": "서울특별시 다른 예시 주소",
    "reason": "담당 공원이 변경되었어요",
    "status": "pending",
    "rejectReason": null,
    "createdAt": "2026-11-18T03:00:00Z",
    "reviewedAt": null,
    "conflictingManagerName": null
  }
]
```

오류: 5장의 공통 인증·입력 검증·서버 오류를 적용합니다.

## 3.35. 총관리자 — 공원 변경 승인

### POST /admin/park-change-requests/{request_id}/approve

기능: 본문이 없습니다. pending 요청이며 신청 당시 공원과 현재 공원이 같아야 합니다. 대상 공원에 다른 승인 관리자가 없어야 하고 모든 배정 로봇이 idle/offline이어야 합니다. 운영 parkId와 로봇 배정은 유지하고 catalogId를 바꿉니다. 기존 경로·지점·시간표·좌표 기준점을 초기화하고 routeSetupDone=false로 만듭니다. 새 공원에서 순찰 설정을 다시 해야 합니다.

권한: 총관리자(super_admin) Bearer 토큰

#### 요청

```http
POST /admin/park-change-requests/31/approve
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | request_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · ParkChangeResponse

```json
{
  "id": "31",
  "parkId": "5",
  "userId": "12",
  "applicantName": "공원 관리자",
  "applicantLoginId": "manager01",
  "currentCatalogId": "69",
  "currentParkName": "예시공원",
  "requestedCatalogId": "70",
  "requestedParkName": "다른 예시공원",
  "requestedParkAddress": "서울특별시 다른 예시 주소",
  "reason": "담당 공원이 변경되었어요",
  "status": "approved",
  "rejectReason": null,
  "createdAt": "2026-11-18T03:00:00Z",
  "reviewedAt": "2026-11-18T03:10:00Z",
  "conflictingManagerName": null
}
```

주요 업무 오류: 404 park_change_not_found; 409 park_change_not_pending / park_change_stale / park_catalog_inactive / park_already_approved / robot_not_available. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.36. 총관리자 — 공원 변경 반려

### POST /admin/park-change-requests/{request_id}/reject

기능: pending 요청만 반려합니다. reason은 1~1000자입니다. 요청 상태·반려 사유·검토 시각을 기록하고 현재 공원·설정·로봇 배정은 유지합니다.

권한: 총관리자(super_admin) Bearer 토큰

#### 요청

```http
POST /admin/park-change-requests/31/reject
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | request_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

본문: RejectionInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "reason": "담당 공원 확인이 필요해요"
}
```

#### 응답

성공: HTTP 200 · ParkChangeResponse

```json
{
  "id": "31",
  "parkId": "5",
  "userId": "12",
  "applicantName": "공원 관리자",
  "applicantLoginId": "manager01",
  "currentCatalogId": "69",
  "currentParkName": "예시공원",
  "requestedCatalogId": "70",
  "requestedParkName": "다른 예시공원",
  "requestedParkAddress": "서울특별시 다른 예시 주소",
  "reason": "담당 공원이 변경되었어요",
  "status": "rejected",
  "rejectReason": "담당 공원 확인이 필요해요",
  "createdAt": "2026-11-18T03:00:00Z",
  "reviewedAt": "2026-11-18T03:10:00Z",
  "conflictingManagerName": null
}
```

주요 업무 오류: 404 park_change_not_found; 409 park_change_not_pending. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.37. 총관리자 — 운영 공원 목록

### GET /admin/parks

기능: 승인된 공원만 id 오름차순으로 반환합니다. 담당 관리자와 배정된 로봇 수를 포함합니다. 공원 목록 카탈로그 검색과 다릅니다.

권한: 총관리자(super_admin) Bearer 토큰

#### 요청

```http
GET /admin/parks?limit=100&offset=0
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | limit | 선택 | integer | 최솟값: 1; 최댓값: 100; 기본값: 100 |
| query | offset | 선택 | integer | 최솟값: 0; 최댓값: 9223372036854775807; 기본값: 0 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · AdminParkResponse[]

```json
[
  {
    "id": "5",
    "catalogId": "69",
    "name": "예시공원",
    "address": "서울특별시 예시 주소",
    "managerId": "12",
    "managerName": "공원 관리자",
    "managerLoginId": "manager01",
    "status": "approved",
    "robotCount": 2
  }
]
```

오류: 5장의 공통 인증·입력 검증·서버 오류를 적용합니다.

## 3.38. 총관리자 — 로봇 공원 배정·이동·회수

### PATCH /admin/robots/{robot_id}/assignment

기능: parkId는 승인된 운영 공원 ID이며 null이면 회수입니다. 필드 생략은 허용하지 않습니다. idle/offline만 처리하고 활성 공원으로만 배정합니다. 이동·회수 시 이전 공원의 해당 로봇 경로를 비활성화하고 지점을 숨기며 시간표를 제거합니다. 다른 로봇 설정은 보존합니다. 새 공원의 미배정 초안이 있으면 복사합니다. 상태를 임의로 online으로 바꾸지 않습니다.

권한: 총관리자(super_admin) Bearer 토큰

#### 요청

```http
PATCH /admin/robots/6/assignment
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | robot_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

본문: AssignmentInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "parkId": "5"
}
```

#### 응답

성공: HTTP 200 · RobotResponse

```json
{
  "id": "6",
  "name": "jub3",
  "serialNo": "jub3",
  "parkId": "5",
  "status": "offline",
  "assignedAt": "2026-11-18T03:00:00Z",
  "createdAt": "2026-11-18T02:00:00Z",
  "slamX": null,
  "slamY": null,
  "lat": null,
  "lng": null,
  "batteryVoltage": null,
  "lastSeenAt": null,
  "parkName": "예시공원",
  "managerId": "12",
  "managerName": "공원 관리자",
  "managerLoginId": "manager01"
}
```

주요 업무 오류: 404 robot_not_found; 409 robot_assignment_changed / robot_not_available / park_not_approved / park_catalog_inactive. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.39. 최초·추가 로봇 배정 요청

### POST /robot-assignment-requests

기능: 승인된 manager의 로그인 정보로 신청자와 운영 공원을 결정합니다. robotCount는 추가 요청 대수(정수 1~100)이며 기존 배정 로봇을 포함한 총 대수가 아닙니다. reason은 필수이며 앞뒤 공백 제거 후 1~1000자입니다. 누락·빈 문자열·공백만 입력하면 422 validation_error입니다. 공원별 pending 요청은 한 건만 허용하고 요청만으로 기기 등록·배정은 하지 않습니다. userId·parkId 등의 추가 입력은 거부합니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
POST /robot-assignment-requests
```

본문: RobotAssignmentRequestInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "robotCount": 2,
  "reason": "추가 순찰이 필요해요"
}
```

#### 응답

성공: HTTP 201 · RobotAssignmentRequestResponse

```json
{
  "id": "41",
  "userId": "12",
  "parkId": "5",
  "catalogId": "69",
  "parkName": "예시공원",
  "applicantName": "공원 관리자",
  "applicantLoginId": "manager01",
  "robotCount": 2,
  "reason": "추가 순찰이 필요해요",
  "status": "pending",
  "rejectReason": null,
  "reviewedBy": null,
  "reviewedAt": null,
  "createdAt": "2026-11-18T03:00:00Z",
  "assignedRobotIds": []
}
```

주요 업무 오류: 409 robot_assignment_request_pending / park_not_approved / park_catalog_inactive. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.40. 내 로봇 배정 요청 이력

### GET /robot-assignment-requests

기능: 현재 계정의 요청만 조회합니다. status 기본 all이며 최신 생성 시각·ID 순으로 내려줍니다. assignedRobotIds는 승인 당시 로봇 ID 이력으로 회수 이후에도 유지합니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
GET /robot-assignment-requests?status=pending&limit=20&offset=0
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | status | 선택 | string | 허용: all, pending, approved, rejected, cancelled; 기본값: "all" |
| query | limit | 선택 | integer | 최솟값: 1; 최댓값: 100; 기본값: 20 |
| query | offset | 선택 | integer | 최솟값: 0; 최댓값: 9223372036854775807; 기본값: 0 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · RobotAssignmentRequestResponse[]

```json
[
  {
    "id": "41",
    "userId": "12",
    "parkId": "5",
    "catalogId": "69",
    "parkName": "예시공원",
    "applicantName": "공원 관리자",
    "applicantLoginId": "manager01",
    "robotCount": 2,
    "reason": "추가 순찰이 필요해요",
    "status": "pending",
    "rejectReason": null,
    "reviewedBy": null,
    "reviewedAt": null,
    "createdAt": "2026-11-18T03:00:00Z",
    "assignedRobotIds": []
  }
]
```

오류: 5장의 공통 인증·입력 검증·서버 오류를 적용합니다.

## 3.41. 내 로봇 배정 요청 취소

### POST /robot-assignment-requests/{request_id}/cancel

기능: 본문 없이 자신의 pending 요청만 취소합니다. 타인의 요청과 없는 요청은 동일한 404입니다. reviewedBy에 취소한 관리자 ID, reviewedAt에 취소 시각을 기록하고 기존 배정은 유지합니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
POST /robot-assignment-requests/31/cancel
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | request_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · RobotAssignmentRequestResponse

```json
{
  "id": "41",
  "userId": "12",
  "parkId": "5",
  "catalogId": "69",
  "parkName": "예시공원",
  "applicantName": "공원 관리자",
  "applicantLoginId": "manager01",
  "robotCount": 2,
  "reason": "추가 순찰이 필요해요",
  "status": "cancelled",
  "rejectReason": null,
  "reviewedBy": "12",
  "reviewedAt": "2026-11-18T03:10:00Z",
  "createdAt": "2026-11-18T03:00:00Z",
  "assignedRobotIds": []
}
```

주요 업무 오류: 404 robot_assignment_request_not_found; 409 robot_assignment_request_not_pending. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.42. 총관리자 — 로봇 배정 요청 목록

### GET /admin/robot-assignment-requests

기능: status 기본 pending, all로 전체 요청을 조회합니다. limit 기본 20, 최대 100입니다. 최신 생성 시각·ID 순으로 반환합니다.

권한: 총관리자(super_admin) Bearer 토큰

#### 요청

```http
GET /admin/robot-assignment-requests?status=pending&limit=20&offset=0
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | status | 선택 | string | 허용: all, pending, approved, rejected, cancelled; 기본값: "pending" |
| query | limit | 선택 | integer | 최솟값: 1; 최댓값: 100; 기본값: 20 |
| query | offset | 선택 | integer | 최솟값: 0; 최댓값: 9223372036854775807; 기본값: 0 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · RobotAssignmentRequestResponse[]

```json
[
  {
    "id": "41",
    "userId": "12",
    "parkId": "5",
    "catalogId": "69",
    "parkName": "예시공원",
    "applicantName": "공원 관리자",
    "applicantLoginId": "manager01",
    "robotCount": 2,
    "reason": "추가 순찰이 필요해요",
    "status": "pending",
    "rejectReason": null,
    "reviewedBy": null,
    "reviewedAt": null,
    "createdAt": "2026-11-18T03:00:00Z",
    "assignedRobotIds": []
  }
]
```

오류: 5장의 공통 인증·입력 검증·서버 오류를 적용합니다.

## 3.43. 총관리자 — 요청 승인과 실제 로봇 배정

### POST /admin/robot-assignment-requests/{request_id}/approve

기능: 요청 대수와 정확히 같은 수의 중복 없는 robotIds를 받습니다. 전부 미배정·idle/offline이어야 하고 신청 당시 승인된 공원·catalogId·manager 역할이 유지되어야 합니다. 요청 승인·배정·이력·초안 경로 복사·알림 저장을 한 트랜잭션으로 처리하며 부분 승인은 하지 않습니다. 모든 신규 로봇에 미배정 초안을 독립 복사하고 기존 로봇 설정은 유지합니다. 실제 로봇 주행 명령은 보내지 않습니다. 푸시는 커밋 후 발송 설정이 켜져 있을 때 처리합니다.

권한: 총관리자(super_admin) Bearer 토큰

#### 요청

```http
POST /admin/robot-assignment-requests/31/approve
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | request_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

본문: RobotAssignmentApprovalInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "robotIds": [
    "7",
    "8"
  ]
}
```

#### 응답

성공: HTTP 200 · RobotAssignmentRequestResponse

```json
{
  "id": "41",
  "userId": "12",
  "parkId": "5",
  "catalogId": "69",
  "parkName": "예시공원",
  "applicantName": "공원 관리자",
  "applicantLoginId": "manager01",
  "robotCount": 2,
  "reason": "추가 순찰이 필요해요",
  "status": "approved",
  "rejectReason": null,
  "reviewedBy": "8",
  "reviewedAt": "2026-11-18T03:10:00Z",
  "createdAt": "2026-11-18T03:00:00Z",
  "assignedRobotIds": [
    "7",
    "8"
  ]
}
```

주요 업무 오류: 404 robot_assignment_request_not_found / robot_not_found; 409 robot_assignment_request_not_pending / robot_assignment_request_stale / robot_already_assigned / robot_not_available / park_catalog_inactive; 422 robot_assignment_count_mismatch. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.44. 총관리자 — 로봇 배정 요청 반려

### POST /admin/robot-assignment-requests/{request_id}/reject

기능: pending 요청만 반려하고 1~1000자 reason을 저장합니다. 로봇 배정은 바꾸지 않습니다. 반려 상태·처리자·시각·알림 기록을 함께 저장합니다.

권한: 총관리자(super_admin) Bearer 토큰

#### 요청

```http
POST /admin/robot-assignment-requests/31/reject
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | request_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

본문: RejectionInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "reason": "담당 공원 확인이 필요해요"
}
```

#### 응답

성공: HTTP 200 · RobotAssignmentRequestResponse

```json
{
  "id": "41",
  "userId": "12",
  "parkId": "5",
  "catalogId": "69",
  "parkName": "예시공원",
  "applicantName": "공원 관리자",
  "applicantLoginId": "manager01",
  "robotCount": 2,
  "reason": "추가 순찰이 필요해요",
  "status": "rejected",
  "rejectReason": "현재 가용 로봇이 없어요",
  "reviewedBy": "8",
  "reviewedAt": "2026-11-18T03:10:00Z",
  "createdAt": "2026-11-18T03:00:00Z",
  "assignedRobotIds": []
}
```

주요 업무 오류: 404 robot_assignment_request_not_found; 409 robot_assignment_request_not_pending. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.45. 분리수거장 목록

### GET /stations

기능: 본인 공원의 삭제되지 않은 장소 목록을 반환합니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
GET /stations
```

요청 본문: 없음.

#### 응답

성공: HTTP 200 · StationResponse[]

```json
[
  {
    "id": "1",
    "name": "북문 분리수거장",
    "position": {
      "latitude": 37.5433,
      "longitude": 127.0332
    }
  }
]
```

오류: 5장의 공통 인증·입력 검증·서버 오류를 적용합니다.

## 3.46. 분리수거장 등록

### POST /stations

기능: 이름·공원 내부 좌표를 등록합니다. 최대 100곳이며 같은 좌표는 중복 등록할 수 없습니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
POST /stations
```

본문: StationInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "name": "북문 분리수거장",
  "position": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "catalogId": "69"
}
```

#### 응답

성공: HTTP 201 · StationResponse

```json
{
  "id": "1",
  "name": "북문 분리수거장",
  "position": {
    "latitude": 37.5433,
    "longitude": 127.0332
  }
}
```

주요 업무 오류: 409 station_position_exists / park_changed; 422 point_outside_park / station_limit_exceeded. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.47. 분리수거장 수정

### PATCH /stations/{station_id}

기능: 이름과 좌표를 수정합니다. 참조하는 활성 경로를 모두 검증하고 새 버전으로 저장합니다. 과거 경로 좌표는 보존합니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
PATCH /stations/{station_id}
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | station_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

본문: StationInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "name": "북문 분리수거장",
  "position": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "catalogId": "69"
}
```

#### 응답

성공: HTTP 200 · StationResponse

```json
{
  "id": "1",
  "name": "북문 분리수거장",
  "position": {
    "latitude": 37.5433,
    "longitude": 127.0332
  }
}
```

주요 업무 오류: 404 station_not_found; 409 station_position_exists / park_changed; 422 point_outside_park / point_too_far. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.48. 분리수거장 삭제

### DELETE /stations/{station_id}

기능: 활성 경로의 default_station_id에서 참조하지 않는 장소만 삭제합니다. catalogId는 query입니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
DELETE /stations/{station_id}?catalogId=69
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | station_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |
| query | catalogId | 선택 | integer / null | 최솟값: 1; 최댓값: 9223372036854775807 |

요청 본문: 없음.

#### 응답

성공: HTTP 204 · 응답 본문 없음

주요 오류: 404 station_not_found; 409 station_in_use / park_changed. 공통 인증·입력 검증 오류를 함께 적용합니다.

## 3.49. 탐지 사진 업로드

### PUT /detections/{detection_id}/photo

기능: JPEG/PNG 원본 바이트를 Content-Type image/jpeg 또는 image/png로 보냅니다. 기본 최대 5MiB, 2천만 픽셀입니다. 담당 공원의 기존 탐지만 가능하며 비공개 R2 저장 후 DB에 경로를 기록합니다. 이미 등록된 R2 사진은 덮어쓰지 않습니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
PUT /detections/{detection_id}/photo
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | detection_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · object

```json
{
  "detectionId": "1",
  "imagePath": "parks/5/detections/1/<UUID>.jpg"
}
```

주요 업무 오류: 404 detection_not_found; 409 photo_already_exists / photo_conflict; 413 photo_too_large; 415 photo_type_unsupported; 422 photo_invalid; 503 photo_storage_unavailable / photo_db_unavailable. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.50. 탐지 사진 임시 주소 조회

### GET /detections/{detection_id}/photo

기능: 담당 공원 탐지의 R2 사진을 볼 수 있는 600초 유효 URL을 반환합니다. Cache-Control: no-store이며 만료 후 다시 요청합니다.

권한: 승인된 manager Bearer 토큰

#### 요청

```http
GET /detections/{detection_id}/photo
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | detection_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · object

```json
{
  "url": "https://<R2-endpoint>/<bucket>/<object>?<temporary-signature>",
  "expiresIn": 600
}
```

주요 업무 오류: 404 detection_not_found / photo_not_found; 503 photo_storage_unavailable / photo_db_unavailable. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.51. 내 알림 목록

### GET /notifications

기능: 자신의 알림만 발생 시각·ID 내림차순으로 반환합니다. type·isRead 필터와 limit·offset을 지원하며 조회만으로 읽음 처리하지 않습니다. 목록은 포장 없는 배열이며 빈 결과는 []입니다. 총관리자도 자신의 알림만 조회합니다.

권한: 승인된 manager 또는 super_admin Bearer 토큰

#### 요청

```http
GET /notifications?type=robotAssignmentApproved&isRead=false&limit=20&offset=0
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| query | type | 선택 | string / null | 최소 문자 수: 1; 최대 문자 수: 100 |
| query | isRead | 선택 | boolean / null | - |
| query | limit | 선택 | integer | 최솟값: 1; 최댓값: 100; 기본값: 20 |
| query | offset | 선택 | integer | 최솟값: 0; 최댓값: 9223372036854775807; 기본값: 0 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · NotificationResponse[]

```json
[
  {
    "id": "41",
    "type": "robotAssignmentApproved",
    "title": "로봇 배정이 완료되었어요",
    "body": "예시공원에 로봇 2대를 배정했어요",
    "parkId": "5",
    "robotId": null,
    "position": null,
    "occurredAt": "2026-11-18T07:00:00Z",
    "isRead": false
  }
]
```

주요 업무 오류: 503 notifications_unavailable. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.52. 내 미확인 알림 개수

### GET /notifications/unread-count

기능: 필터·페이지와 관계없이 자신의 전체 미확인 알림 개수를 반환합니다. 0개면 count=0입니다.

권한: 승인된 manager 또는 super_admin Bearer 토큰

#### 요청

```http
GET /notifications/unread-count
```

요청 본문: 없음.

#### 응답

성공: HTTP 200 · UnreadCountResponse

```json
{
  "count": 2
}
```

주요 업무 오류: 503 notifications_unavailable. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.53. 내 알림 상세

### GET /notifications/{notification_id}

기능: 자신의 알림 내용·발생 시각·위치·읽음 여부를 반환합니다. 타인의 알림과 없는 알림은 동일한 404입니다. 조회 자체로 읽음 상태를 바꾸지 않습니다.

권한: 승인된 manager 또는 super_admin Bearer 토큰

#### 요청

```http
GET /notifications/41
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | notification_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · NotificationResponse

```json
{
  "id": "41",
  "type": "robotAssignmentApproved",
  "title": "로봇 배정이 완료되었어요",
  "body": "예시공원에 로봇 2대를 배정했어요",
  "parkId": "5",
  "robotId": null,
  "position": null,
  "occurredAt": "2026-11-18T07:00:00Z",
  "isRead": false
}
```

주요 업무 오류: 404 notification_not_found; 503 notifications_unavailable. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.54. 내 알림 읽음 처리

### PATCH /notifications/{notification_id}/read

기능: 본문 없이 호출합니다. 반복해도 읽음 상태를 유지하며 발생 시각은 바꾸지 않습니다. 처리 완료·로봇 재확인 명령은 포함하지 않습니다.

권한: 승인된 manager 또는 super_admin Bearer 토큰

#### 요청

```http
PATCH /notifications/41/read
```

| 위치 | 이름 | 필수 | 타입 | 제약·기본값 |
| --- | --- | --- | --- | --- |
| path | notification_id | 필수 | integer | 최솟값: 1; 최댓값: 9223372036854775807 |

요청 본문: 없음.

#### 응답

성공: HTTP 200 · NotificationResponse

```json
{
  "id": "41",
  "type": "robotAssignmentApproved",
  "title": "로봇 배정이 완료되었어요",
  "body": "예시공원에 로봇 2대를 배정했어요",
  "parkId": "5",
  "robotId": null,
  "position": null,
  "occurredAt": "2026-11-18T07:00:00Z",
  "isRead": true
}
```

주요 업무 오류: 404 notification_not_found; 503 notifications_unavailable. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.55. Expo 기기 토큰 등록·갱신

### PUT /push-tokens

기능: ExpoPushToken 또는 ExponentPushToken 형식과 android/ios를 받습니다. 같은 토큰은 upsert하고 createdAt은 유지하며 updatedAt·현재 소유자·플랫폼·활성 상태를 갱신합니다. 같은 기기로 계정을 바꾸면 새 로그인 계정에 연결합니다. 여러 기기를 등록할 수 있고 토큰 원문은 응답하지 않습니다. userId 같은 추가 입력은 거부합니다.

권한: 승인된 manager 또는 super_admin Bearer 토큰

#### 요청

```http
PUT /push-tokens
```

본문: PushTokenInput — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "token": "ExpoPushToken[example-device-token]",
  "platform": "android"
}
```

#### 응답

성공: HTTP 200 · PushTokenResponse

```json
{
  "id": "7",
  "platform": "android",
  "isActive": true,
  "createdAt": "2026-11-18T07:00:00Z",
  "updatedAt": "2026-11-18T07:05:00Z"
}
```

주요 업무 오류: 503 notifications_unavailable. 공통 인증·입력 검증 오류는 5장을 함께 적용합니다.

## 3.56. 현재 기기 토큰 해제

### DELETE /push-tokens

기능: 본문 token으로 자신의 토큰만 비활성화합니다. 없는 토큰·다른 계정 소유 토큰도 동일하게 204입니다. 로그아웃 전 인증 토큰이 유효할 때 호출하고 재등록하면 다시 활성화됩니다.

권한: 승인된 manager 또는 super_admin Bearer 토큰

#### 요청

```http
DELETE /push-tokens
```

본문: PushTokenReference — 필드 상세는 4장 공통 데이터 계약에 모두 기재했습니다.

```json
{
  "token": "ExpoPushToken[example-device-token]"
}
```

#### 응답

성공: HTTP 204 · 응답 본문 없음

주요 오류: 503 notifications_unavailable. 공통 인증·입력 검증 오류를 함께 적용합니다.

## 4. 공통 데이터 계약 — 모든 요청·응답 필드

각 API의 요청·응답 타입 이름은 이 표의 객체를 가리킵니다. 필수는 JSON 키 존재 조건이며 null 허용 여부는 타입에 별도 표기합니다. 응답의 기본값이 있는 필드도 FastAPI 기본 직렬화에서는 일반적으로 포함됩니다. 가입·재신청·배정 요청·배정 요청 승인·푸시 토큰 입력은 추가 필드를 거부하며, 나머지는 기본적으로 정의되지 않은 필드를 무시합니다.

### AdminParkResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | string | 필수 | - | 해당 객체 ID. PointInput·ScheduleInput의 임시 ID는 식별 권한으로 쓰지 않음 |
| catalogId | string | 필수 | - | 공원 목록 ID. 운영 공원 ID와 다름 |
| name | string | 필수 | - | 이름. 요청에서 공백 제거 적용 여부는 해당 API 규칙 참고 |
| address | string | 필수 | - | 공원 주소 |
| managerId | string | 필수 | - | 담당 관리자 계정 ID |
| managerName | string | 필수 | - | 담당 관리자 이름 |
| managerLoginId | string | 필수 | - | 담당 관리자 로그인 아이디 |
| status | string | 필수 | 허용: pending, approved, rejected | 상태 코드. 허용 값은 타입별 제약 참고 |
| robotCount | integer | 필수 | - | 배정 요청: 추가 요청 대수 / AdminParkResponse: 실제 배정 로봇 수 |

### ApprovalInput

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| robotIds | string[] | 선택/기본값 | 최대 항목 수: 100 | 중복 불가. 양의 bigint ID 문자열 목록 |

### AssignmentInput

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| parkId | string / null | 필수 | 정규식: ^[1-9][0-9]{0,18}$ | 운영 공원 ID |

### ConfigInput

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| catalogId | string / null | 선택/기본값 | 정규식: ^[1-9][0-9]{0,18}$ | 공원 목록 ID. 운영 공원 ID와 다름 |
| defaultStationId | string / null | 선택/기본값 | 정규식: ^[1-9][0-9]{0,18}$ | 해당 API 기능 설명 참고 |
| points | PointInput[] | 필수 | 최소 항목 수: 1; 최대 항목 수: 100 | 순찰 순서대로 정렬된 지점 목록 |
| station | LatLng / null | 선택/기본값 | - | 공원 공유 분리수거장 좌표 |
| schedule | ScheduleInput[] | 필수 | 최소 항목 수: 1; 최대 항목 수: 100 | 로봇별 시간표 목록 |

### ConfigResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| catalogId | string | 필수 | - | 공원 목록 ID. 운영 공원 ID와 다름 |
| robotId | string / null | 선택/기본값 | - | 로봇 ID. null은 미배정 초안 |
| defaultStationId | string / null | 선택/기본값 | - | 해당 API 기능 설명 참고 |
| stations | StationResponse[] | 선택/기본값 | - | 해당 API 기능 설명 참고 |
| parkName | string | 필수 | - | 담당 공원 이름. 로봇 응답에서는 총관리자 목록·배정 응답에 보강 |
| bounds | ParkBounds | 필수 | - | 지도 표시 범위 |
| area | ParkArea | 필수 | - | 공원 다각형 경계 |
| station | LatLng / null | 필수 | - | 공원 공유 분리수거장 좌표 |
| points | PointResponse[] | 필수 | - | 순찰 순서대로 정렬된 지점 목록 |
| schedule | ScheduleResponse[] | 필수 | - | 로봇별 시간표 목록 |

### ErrorResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| status | integer | 필수 | - | 상태 코드. 허용 값은 타입별 제약 참고 |
| message | string | 필수 | - | 사용자 안내 오류 문구 |
| code | string | 필수 | - | 분기용 오류 코드 |
| details | object / null | 선택/기본값 | - | 검증 오류에서는 field/reason 배열, 일부 업무 오류에서는 객체. 항상 배열은 아님 |

### HealthResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| status | string | 필수 | 고정값: ok | 상태 코드. 허용 값은 타입별 제약 참고 |
| db | string | 필수 | 고정값: ok | DB 연결 상태 |

### LatLng

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| latitude | number | 필수 | 최솟값: -90.0; 최댓값: 90.0 | 위도. -90~90, NaN·무한대 불가 |
| longitude | number | 필수 | 최솟값: -180.0; 최댓값: 180.0 | 경도. -180~180, NaN·무한대 불가 |

### LoginRequest

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| loginId | string | 필수 | 최소 문자 수: 1; 최대 문자 수: 128 | 로그인 아이디(대소문자 구분) |
| password | string (password) | 필수 | 최소 문자 수: 1; 최대 문자 수: 128 | 영문·숫자를 각각 포함. 서버는 Argon2 해시로 저장하며 응답하지 않음 |

### LoginResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| accessToken | string | 필수 | - | 업무 API Bearer 인증 |
| tokenType | string | 선택/기본값 | 기본값: "bearer" | bearer |
| expiresIn | integer | 필수 | - | 초 단위 유효 시간 |
| isFirstLogin | boolean | 필수 | - | 순찰 초기 설정 필요 여부, 로그인 횟수가 아님 |
| role | string | 필수 | 허용: super_admin, manager | manager / super_admin |
| parkStatus | string / null | 필수 | 허용: pending, approved, rejected | 호환용 승인 상태. 총관리자 null |
| routeSetupDone | boolean | 필수 | - | 순찰 초기 설정 완료 여부 |
| registrationStatus | string / null | 필수 | 허용: pending, approved, rejected | 가입 승인 상태 |

### ManagedPark

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | string | 필수 | - | 해당 객체 ID. PointInput·ScheduleInput의 임시 ID는 식별 권한으로 쓰지 않음 |
| catalogId | string | 필수 | - | 공원 목록 ID. 운영 공원 ID와 다름 |
| name | string | 필수 | - | 이름. 요청에서 공백 제거 적용 여부는 해당 API 규칙 참고 |
| address | string | 필수 | - | 공원 주소 |
| center | LatLng | 필수 | - | 공원 중심 위도·경도 |
| bounds | ParkBounds | 필수 | - | 지도 표시 범위 |
| area | ParkArea | 필수 | - | 공원 다각형 경계 |
| status | string | 필수 | 허용: pending, approved, rejected | 상태 코드. 허용 값은 타입별 제약 참고 |
| reviewedBy | string / null | 필수 | - | 승인·반려·승인 취소 처리자 계정 ID. pending은 null. 신청 취소 시 요청자 ID |
| reviewedAt | string (date-time) / null | 필수 | - | 승인·반려·승인 취소 처리 시각. pending은 null. 신청 취소 시 취소 시각 |
| rejectReason | string / null | 필수 | - | 반려 사유. 반려 전 또는 반려가 아니면 null 가능 |
| routeSetupDone | boolean | 필수 | - | 순찰 초기 설정 완료 여부 |
| anchorPoints | object[] | 선택/기본값 | - | 좌표 기준점 목록. 현재 별도 쓰기 API 없음 |

### NotificationResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | string | 필수 | - | 해당 객체 ID. PointInput·ScheduleInput의 임시 ID는 식별 권한으로 쓰지 않음 |
| type | string | 필수 | - | 알림 종류. 예: robotAssignmentApproved, robotAssignmentRejected |
| title | string | 필수 | - | 해당 API 기능 설명 참고 |
| body | string | 필수 | - | 알림 상세 내용 |
| parkId | string / null | 필수 | - | 운영 공원 ID |
| robotId | string / null | 필수 | - | 로봇 ID. null은 미배정 초안 |
| position | LatLng / null | 필수 | - | 해당 순찰 지점의 지도 좌표 |
| occurredAt | string (date-time) | 필수 | - | 알림 발생 시각(ISO 8601) |
| isRead | boolean | 필수 | - | 읽음 여부. 목록·상세 조회만으로 바뀌지 않음 |

### ParkArea

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| outer | LatLng[] | 필수 | 최소 항목 수: 4 | 외곽 좌표(최소 4개) |
| holes | LatLng[][] | 선택/기본값 | - | 외곽 내부의 제외 영역 좌표 목록 |

### ParkBounds

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| southWest | LatLng | 필수 | - | 지도 남서 좌표 |
| northEast | LatLng | 필수 | - | 지도 북동 좌표 |

### ParkChangeInput

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| catalogId | string | 필수 | 정규식: ^[1-9][0-9]{0,18}$ | 공원 목록 ID. 운영 공원 ID와 다름 |
| reason | string | 필수 | 최소 문자 수: 1; 최대 문자 수: 200 | 신청 또는 반려·취소 사유. 길이는 요청 타입별로 다름 |

### ParkChangeResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | string | 필수 | - | 해당 객체 ID. PointInput·ScheduleInput의 임시 ID는 식별 권한으로 쓰지 않음 |
| parkId | string | 필수 | - | 운영 공원 ID |
| userId | string | 필수 | - | 계정 ID |
| applicantName | string | 필수 | - | 신청자 이름 |
| applicantLoginId | string | 필수 | - | 신청자 로그인 아이디 |
| currentCatalogId | string | 필수 | - | 변경 신청 당시 원본 공원 목록 ID |
| currentParkName | string | 필수 | - | 변경 신청 당시 원본 공원 이름 |
| requestedCatalogId | string | 필수 | - | 신청한 대상 공원 목록 ID |
| requestedParkName | string | 필수 | - | 신청한 대상 공원 이름 |
| requestedParkAddress | string | 필수 | - | 대상 공원 주소 |
| reason | string | 필수 | - | 신청 또는 반려·취소 사유. 길이는 요청 타입별로 다름 |
| status | string | 필수 | 허용: pending, approved, rejected, cancelled | 상태 코드. 허용 값은 타입별 제약 참고 |
| rejectReason | string / null | 필수 | - | 반려 사유. 반려 전 또는 반려가 아니면 null 가능 |
| createdAt | string (date-time) | 필수 | - | 원본 행 생성 시각 |
| reviewedAt | string (date-time) / null | 필수 | - | 승인·반려·승인 취소 처리 시각. pending은 null. 신청 취소 시 취소 시각 |
| conflictingManagerName | string / null | 필수 | - | 대상 공원에 이미 승인된 관리자가 있으면 이름, 없으면 null |

### ParkRequestResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | string | 필수 | - | 해당 객체 ID. PointInput·ScheduleInput의 임시 ID는 식별 권한으로 쓰지 않음 |
| catalogId | string | 필수 | - | 공원 목록 ID. 운영 공원 ID와 다름 |
| name | string | 필수 | - | 이름. 요청에서 공백 제거 적용 여부는 해당 API 규칙 참고 |
| address | string | 필수 | - | 공원 주소 |
| center | LatLng | 필수 | - | 공원 중심 위도·경도 |
| bounds | ParkBounds | 필수 | - | 지도 표시 범위 |
| area | ParkArea | 필수 | - | 공원 다각형 경계 |
| status | string | 필수 | 허용: pending, approved, rejected | 상태 코드. 허용 값은 타입별 제약 참고 |
| reviewedBy | string / null | 필수 | - | 승인·반려·승인 취소 처리자 계정 ID. pending은 null. 신청 취소 시 요청자 ID |
| reviewedAt | string (date-time) / null | 필수 | - | 승인·반려·승인 취소 처리 시각. pending은 null. 신청 취소 시 취소 시각 |
| rejectReason | string / null | 필수 | - | 반려 사유. 반려 전 또는 반려가 아니면 null 가능 |
| routeSetupDone | boolean | 필수 | - | 순찰 초기 설정 완료 여부 |
| anchorPoints | object[] | 선택/기본값 | - | 좌표 기준점 목록. 현재 별도 쓰기 API 없음 |
| userId | string | 필수 | - | 계정 ID |
| applicantName | string | 필수 | - | 신청자 이름 |
| applicantLoginId | string | 필수 | - | 신청자 로그인 아이디 |
| applicantEmail | string | 필수 | - | 신청자 이메일 |
| applicantPhone | string | 필수 | - | 신청자 전화번호 |
| registrationStatus | string | 필수 | 허용: pending, approved, rejected | 가입 승인 상태 |
| createdAt | string (date-time) | 필수 | - | 원본 행 생성 시각 |

### ParkResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | string | 필수 | - | 해당 객체 ID. PointInput·ScheduleInput의 임시 ID는 식별 권한으로 쓰지 않음 |
| name | string | 필수 | - | 이름. 요청에서 공백 제거 적용 여부는 해당 API 규칙 참고 |
| address | string | 필수 | - | 공원 주소 |
| distance | string | 필수 | - | 현재 공원 검색 서버는 빈 문자열 |
| bounds | ParkBounds | 필수 | - | 지도 표시 범위 |
| area | ParkArea | 필수 | - | 공원 다각형 경계 |

### ParkSelection

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| catalogId | string | 필수 | 정규식: ^[1-9][0-9]{0,18}$ | 공원 목록 ID. 운영 공원 ID와 다름 |

### PointInput

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | string / null | 선택/기본값 | 최대 문자 수: 100 | 해당 객체 ID. PointInput·ScheduleInput의 임시 ID는 식별 권한으로 쓰지 않음 |
| name | string | 필수 | 최소 문자 수: 1; 최대 문자 수: 100 | 이름. 요청에서 공백 제거 적용 여부는 해당 API 규칙 참고 |
| position | LatLng | 필수 | - | 해당 순찰 지점의 지도 좌표 |

### PointResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | string | 필수 | - | 해당 객체 ID. PointInput·ScheduleInput의 임시 ID는 식별 권한으로 쓰지 않음 |
| name | string | 필수 | 최소 문자 수: 1; 최대 문자 수: 100 | 이름. 요청에서 공백 제거 적용 여부는 해당 API 규칙 참고 |
| position | LatLng | 필수 | - | 해당 순찰 지점의 지도 좌표 |

### ProfileResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| name | string | 필수 | - | 이름. 요청에서 공백 제거 적용 여부는 해당 API 규칙 참고 |
| email | string | 필수 | - | 가입·재신청 시 소문자로 정규화 |
| role | string | 선택/기본값 | 허용: super_admin, manager; 기본값: "manager" | manager / super_admin |
| parkStatus | string / null | 선택/기본값 | 허용: pending, approved, rejected | 호환용 승인 상태. 총관리자 null |
| routeSetupDone | boolean | 선택/기본값 | 기본값: false | 순찰 초기 설정 완료 여부 |
| registrationStatus | string / null | 선택/기본값 | 허용: pending, approved, rejected | 가입 승인 상태 |

### PushTokenInput

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| token | string (password) | 필수 | 최소 문자 수: 1; 최대 문자 수: 4096 | ExpoPushToken[...] 또는 ExponentPushToken[...]. 요청 전용 |
| platform | string | 필수 | 허용: android, ios | android 또는 ios |

### PushTokenReference

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| token | string (password) | 필수 | 최소 문자 수: 1; 최대 문자 수: 4096 | ExpoPushToken[...] 또는 ExponentPushToken[...]. 요청 전용 |

### PushTokenResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | string | 필수 | - | 해당 객체 ID. PointInput·ScheduleInput의 임시 ID는 식별 권한으로 쓰지 않음 |
| platform | string | 필수 | 허용: android, ios | android 또는 ios |
| isActive | boolean | 필수 | - | 기기 토큰 활성 여부 |
| createdAt | string (date-time) | 필수 | - | 원본 행 생성 시각 |
| updatedAt | string (date-time) | 필수 | - | 마지막 토큰 등록·갱신 시각 |

### ReapplicationSession

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| reapplicationToken | string | 필수 | - | 재신청 전용. 30분 유효, 본문에 전달 |
| expiresIn | integer | 필수 | - | 초 단위 유효 시간 |
| loginId | string | 필수 | - | 로그인 아이디(대소문자 구분) |
| name | string | 필수 | - | 이름. 요청에서 공백 제거 적용 여부는 해당 API 규칙 참고 |
| email | string | 필수 | - | 가입·재신청 시 소문자로 정규화 |
| phone | string | 필수 | - | 가입·재신청에서 하이픈·공백 제거 후 숫자 9~15자 |
| catalogId | string | 필수 | - | 공원 목록 ID. 운영 공원 ID와 다름 |
| rejectReason | string | 필수 | - | 반려 사유. 반려 전 또는 반려가 아니면 null 가능 |
| park | ParkResponse / null | 필수 | - | 재신청 시 기존 활성 공원 선택 정보. 비활성 공원은 null |

### ReapplyRequest

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| password | string (password) | 필수 | 최소 문자 수: 8; 최대 문자 수: 128 | 영문·숫자를 각각 포함. 서버는 Argon2 해시로 저장하며 응답하지 않음 |
| name | string | 필수 | 최소 문자 수: 1; 최대 문자 수: 100 | 이름. 요청에서 공백 제거 적용 여부는 해당 API 규칙 참고 |
| phone | string | 필수 | 최소 문자 수: 9; 최대 문자 수: 30 | 가입·재신청에서 하이픈·공백 제거 후 숫자 9~15자 |
| email | string (email) | 필수 | 최대 문자 수: 254 | 가입·재신청 시 소문자로 정규화 |
| catalogId | string | 필수 | 정규식: ^[1-9][0-9]{0,18}$ | 공원 목록 ID. 운영 공원 ID와 다름 |
| reapplicationToken | string (password) | 필수 | 최소 문자 수: 1; 최대 문자 수: 4096 | 재신청 전용. 30분 유효, 본문에 전달 |

### RegisterRequest

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| password | string (password) | 필수 | 최소 문자 수: 8; 최대 문자 수: 128 | 영문·숫자를 각각 포함. 서버는 Argon2 해시로 저장하며 응답하지 않음 |
| name | string | 필수 | 최소 문자 수: 1; 최대 문자 수: 100 | 이름. 요청에서 공백 제거 적용 여부는 해당 API 규칙 참고 |
| phone | string | 필수 | 최소 문자 수: 9; 최대 문자 수: 30 | 가입·재신청에서 하이픈·공백 제거 후 숫자 9~15자 |
| email | string (email) | 필수 | 최대 문자 수: 254 | 가입·재신청 시 소문자로 정규화 |
| catalogId | string | 필수 | 정규식: ^[1-9][0-9]{0,18}$ | 공원 목록 ID. 운영 공원 ID와 다름 |
| loginId | string | 필수 | 정규식: ^[A-Za-z0-9]{4,16}$ | 로그인 아이디(대소문자 구분) |

### RegisterResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| name | string | 필수 | - | 이름. 요청에서 공백 제거 적용 여부는 해당 API 규칙 참고 |
| email | string | 필수 | - | 가입·재신청 시 소문자로 정규화 |
| role | string | 선택/기본값 | 허용: super_admin, manager; 기본값: "manager" | manager / super_admin |
| parkStatus | string / null | 선택/기본값 | 허용: pending, approved, rejected | 호환용 승인 상태. 총관리자 null |
| routeSetupDone | boolean | 선택/기본값 | 기본값: false | 순찰 초기 설정 완료 여부 |
| registrationStatus | string / null | 선택/기본값 | 허용: pending, approved, rejected | 가입 승인 상태 |
| id | string | 필수 | - | 해당 객체 ID. PointInput·ScheduleInput의 임시 ID는 식별 권한으로 쓰지 않음 |

### RejectionInput

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| reason | string | 필수 | 최소 문자 수: 1; 최대 문자 수: 1000 | 신청 또는 반려·취소 사유. 길이는 요청 타입별로 다름 |

### RobotAssignmentApprovalInput

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| robotIds | string[] | 필수 | 최소 항목 수: 1; 최대 항목 수: 100 | 중복 불가. 양의 bigint ID 문자열 목록 |

### RobotAssignmentRequestInput

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| robotCount | integer | 필수 | 최솟값: 1.0; 최댓값: 100.0 | 배정 요청: 추가 요청 대수 / AdminParkResponse: 실제 배정 로봇 수 |
| reason | string | 필수 | 최소 문자 수: 1; 최대 문자 수: 1000 | 신청 또는 반려·취소 사유. 길이는 요청 타입별로 다름 |

### RobotAssignmentRequestResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | string | 필수 | - | 해당 객체 ID. PointInput·ScheduleInput의 임시 ID는 식별 권한으로 쓰지 않음 |
| userId | string | 필수 | - | 계정 ID |
| parkId | string | 필수 | - | 운영 공원 ID |
| catalogId | string | 필수 | - | 공원 목록 ID. 운영 공원 ID와 다름 |
| parkName | string | 필수 | - | 담당 공원 이름. 로봇 응답에서는 총관리자 목록·배정 응답에 보강 |
| applicantName | string | 필수 | - | 신청자 이름 |
| applicantLoginId | string | 필수 | - | 신청자 로그인 아이디 |
| robotCount | integer | 필수 | - | 배정 요청: 추가 요청 대수 / AdminParkResponse: 실제 배정 로봇 수 |
| reason | string | 필수 | - | 신청 또는 반려·취소 사유. 길이는 요청 타입별로 다름 |
| status | string | 필수 | 허용: pending, approved, rejected, cancelled | 상태 코드. 허용 값은 타입별 제약 참고 |
| rejectReason | string / null | 필수 | - | 반려 사유. 반려 전 또는 반려가 아니면 null 가능 |
| reviewedBy | string / null | 필수 | - | 승인·반려·승인 취소 처리자 계정 ID. pending은 null. 신청 취소 시 요청자 ID |
| reviewedAt | string (date-time) / null | 필수 | - | 승인·반려·승인 취소 처리 시각. pending은 null. 신청 취소 시 취소 시각 |
| createdAt | string (date-time) | 필수 | - | 원본 행 생성 시각 |
| assignedRobotIds | string[] | 필수 | - | 요청 승인 당시 배정된 로봇 ID. 회수 이후에도 이력 보존 |

### RobotInput

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| name | string | 필수 | 최소 문자 수: 1; 최대 문자 수: 100 | 이름. 요청에서 공백 제거 적용 여부는 해당 API 규칙 참고 |
| serialNo | string | 필수 | 최소 문자 수: 1; 최대 문자 수: 100 | 변경되지 않는 고유 기기 식별 번호 |

### RobotNameInput

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| name | string | 필수 | 최소 문자 수: 1; 최대 문자 수: 100 | 이름. 요청에서 공백 제거 적용 여부는 해당 API 규칙 참고 |

### RobotResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | string | 필수 | - | 해당 객체 ID. PointInput·ScheduleInput의 임시 ID는 식별 권한으로 쓰지 않음 |
| name | string | 필수 | - | 이름. 요청에서 공백 제거 적용 여부는 해당 API 규칙 참고 |
| serialNo | string | 필수 | - | 변경되지 않는 고유 기기 식별 번호 |
| parkId | string / null | 필수 | - | 운영 공원 ID |
| status | string | 필수 | 허용: idle, working, emptying, offline, error | 상태 코드. 허용 값은 타입별 제약 참고 |
| assignedAt | string (date-time) / null | 필수 | - | 공원 배정 시각. 미배정 null |
| createdAt | string (date-time) | 필수 | - | 원본 행 생성 시각 |
| slamX | number / null | 선택/기본값 | - | 로봇 SLAM x 좌표. 측정 전 null |
| slamY | number / null | 선택/기본값 | - | 로봇 SLAM y 좌표. 측정 전 null |
| lat | number / null | 선택/기본값 | - | 로봇 지도 위도. 측정 전 null |
| lng | number / null | 선택/기본값 | - | 로봇 지도 경도. 측정 전 null |
| batteryVoltage | number / null | 선택/기본값 | - | 배터리 전압(V). 퍼센트가 아님. 미수신 null |
| lastSeenAt | string (date-time) / null | 선택/기본값 | - | 최근 로봇 데이터 수신 시각 |
| parkName | string / null | 선택/기본값 | - | 담당 공원 이름. 로봇 응답에서는 총관리자 목록·배정 응답에 보강 |
| managerId | string / null | 선택/기본값 | - | 담당 관리자 계정 ID |
| managerName | string / null | 선택/기본값 | - | 담당 관리자 이름 |
| managerLoginId | string / null | 선택/기본값 | - | 담당 관리자 로그인 아이디 |

### RouteInput

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| catalogId | string / null | 선택/기본값 | 정규식: ^[1-9][0-9]{0,18}$ | 공원 목록 ID. 운영 공원 ID와 다름 |
| defaultStationId | string / null | 선택/기본값 | 정규식: ^[1-9][0-9]{0,18}$ | 해당 API 기능 설명 참고 |
| points | PointInput[] | 필수 | 최소 항목 수: 1; 최대 항목 수: 100 | 순찰 순서대로 정렬된 지점 목록 |

### RouteResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| catalogId | string | 필수 | - | 공원 목록 ID. 운영 공원 ID와 다름 |
| robotId | string / null | 선택/기본값 | - | 로봇 ID. null은 미배정 초안 |
| defaultStationId | string / null | 선택/기본값 | - | 해당 API 기능 설명 참고 |
| id | string / null | 필수 | - | 해당 객체 ID. PointInput·ScheduleInput의 임시 ID는 식별 권한으로 쓰지 않음 |
| start | LatLng / null | 필수 | - | 경로 출발 분리수거장 좌표 |
| points | PointResponse[] | 필수 | - | 순찰 순서대로 정렬된 지점 목록 |
| end | LatLng / null | 필수 | - | 경로 복귀 분리수거장 좌표 |
| appliesFrom | string | 선택/기본값 | 고정값: nextPatrol; 기본값: "nextPatrol" | nextPatrol: 다음 순찰 적용 |

### ScheduleInput

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | string / null | 선택/기본값 | 최대 문자 수: 100 | 해당 객체 ID. PointInput·ScheduleInput의 임시 ID는 식별 권한으로 쓰지 않음 |
| time | string | 필수 | 정규식: ^(?:[01][0-9]\|2[0-3]):[0-5][0-9]$ | 현지 시각 HH:mm |
| label | string | 필수 | 최소 문자 수: 1; 최대 문자 수: 100 | 시간표 이름 |
| on | boolean | 필수 | - | 시간표 사용 여부 |
| repeat | string | 선택/기본값 | 허용: daily, weekdays, weekends; 기본값: "daily" | daily 매일 / weekdays 평일 / weekends 주말 |

### ScheduleResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | string | 필수 | - | 해당 객체 ID. PointInput·ScheduleInput의 임시 ID는 식별 권한으로 쓰지 않음 |
| time | string | 필수 | 정규식: ^(?:[01][0-9]\|2[0-3]):[0-5][0-9]$ | 현지 시각 HH:mm |
| label | string | 필수 | 최소 문자 수: 1; 최대 문자 수: 100 | 시간표 이름 |
| on | boolean | 필수 | - | 시간표 사용 여부 |
| repeat | string | 선택/기본값 | 허용: daily, weekdays, weekends; 기본값: "daily" | daily 매일 / weekdays 평일 / weekends 주말 |

### SetupResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| routeSetupDone | boolean | 필수 | - | 순찰 초기 설정 완료 여부 |

### StationInput

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| catalogId | string / null | 선택/기본값 | 정규식: ^[1-9][0-9]{0,18}$ | 공원 목록 ID. 운영 공원 ID와 다름 |
| name | string | 필수 | 최소 문자 수: 1; 최대 문자 수: 100 | 이름. 요청에서 공백 제거 적용 여부는 해당 API 규칙 참고 |
| position | LatLng | 필수 | - | 해당 순찰 지점의 지도 좌표 |

### StationResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | string | 필수 | - | 해당 객체 ID. PointInput·ScheduleInput의 임시 ID는 식별 권한으로 쓰지 않음 |
| name | string | 필수 | - | 이름. 요청에서 공백 제거 적용 여부는 해당 API 규칙 참고 |
| position | LatLng | 필수 | - | 해당 순찰 지점의 지도 좌표 |

### UnreadCountResponse

| 필드 | 타입·null | 키 필수 | 제약·기본값 | 설명 |
| --- | --- | --- | --- | --- |
| count | integer | 필수 | 최솟값: 0.0 | 내 전체 미확인 알림 개수 |

## 5. 오류 응답 전체

API의 성공 응답만 보고 오류를 판단하지 않습니다. HTTP 상태와 code를 함께 사용합니다. OpenAPI에 공통 오류 상태가 일괄 등록되어 있으므로 모든 경로에서 나열된 모든 업무 오류가 실제로 발생한다는 뜻은 아닙니다.

```json
{
  "status": 403,
  "message": "총관리자의 회원가입 승인을 기다리고 있어요. 승인 후 로그인해 주세요",
  "code": "registration_pending"
}
```

```json
{
  "status": 422,
  "message": "입력값을 확인해 주세요",
  "code": "validation_error",
  "details": [
    {
      "field": "body.email",
      "reason": "입력값의 형식이 올바르지 않아요"
    }
  ]
}
```

```json
{
  "status": 422,
  "message": "기존 지점과 약 1.2km 떨어져 있어요. 1km 이내로 지정해 주세요",
  "code": "point_too_far",
  "details": {
    "distanceMeters": 1200,
    "maxDistanceMeters": 1000
  }
}
```

details는 값이 있을 때만 포함합니다. 검증 오류 field는 body.email, query.robotId, path.robot_id 같은 위치를 나타냅니다. 401의 경우 WWW-Authenticate: Bearer 헤더를 포함할 수 있습니다.

| HTTP | code | 발생 조건·안내 |
| --- | --- | --- |
| 401 | invalid_credentials | 아이디 또는 비밀번호를 확인해 주세요 |
| 401 | invalid_token | 로그인이 필요하거나 인증이 만료됐어요. 다시 로그인해 주세요 |
| 403 | manager_required | 하위관리자 계정으로 공원을 신청해 주세요 |
| 403 | park_not_approved | 총관리자의 공원 승인을 기다려 주세요 |
| 403 | registration_incomplete | 담당 공원이 포함된 가입 신청이 필요해요. 총관리자에게 문의해 주세요 |
| 403 | registration_pending | 총관리자의 회원가입 승인을 기다리고 있어요. 승인 후 로그인해 주세요 |
| 403 | registration_rejected | 회원가입 신청이 반려되었어요. 총관리자에게 문의해 주세요 |
| 403 | super_admin_required | 총관리자만 사용할 수 있어요 |
| 404 | detection_not_found | 이 공원의 탐지 정보를 찾을 수 없어요 |
| 404 | not_found | 요청한 주소를 찾을 수 없어요 |
| 404 | notification_not_found | 알림을 찾을 수 없어요 |
| 404 | park_change_not_found | 공원 변경 요청을 찾을 수 없어요 |
| 404 | park_not_found | 선택한 공원을 찾을 수 없어요 |
| 404 | park_request_not_found | 공원 신청을 찾을 수 없어요 |
| 404 | photo_not_found | 등록된 R2 사진이 없어요 |
| 404 | registration_not_found | 회원가입 신청을 찾을 수 없어요 |
| 404 | robot_assignment_request_not_found | 로봇 배정 요청을 찾을 수 없어요 |
| 404 | robot_not_found | 선택한 로봇을 찾을 수 없어요 |
| 404 | station_not_found | 이 공원의 분리수거장을 찾을 수 없어요 |
| 405 | method_not_allowed | 허용되지 않는 요청 방식이에요 |
| 409 | account_exists | 이미 사용 중인 아이디 또는 이메일이에요 |
| 409 | approved_park_change_forbidden | 승인된 공원은 임의로 변경할 수 없어요. 총관리자에게 문의해 주세요 |
| 409 | default_station_required | 여러 분리수거장 중 기본 장소를 선택해 주세요 |
| 409 | invalid_applicant_role | 하위관리자의 신청만 승인할 수 있어요 |
| 409 | park_already_approved | 이미 담당 관리자가 있는 공원이에요 |
| 409 | park_catalog_inactive | 현재 운영할 수 없는 공원이에요 |
| 409 | park_change_not_pending | 대기 중인 공원 변경 요청만 처리할 수 있어요 |
| 409 | park_change_pending | 이미 대기 중인 공원 변경 요청이 있어요 |
| 409 | park_change_stale | 담당 공원 상태가 변경됐어요. 요청을 다시 확인해 주세요 |
| 409 | park_changed | 담당 공원이 변경됐어요. 새 공원 설정을 다시 불러와 주세요 |
| 409 | park_not_approved | 승인된 담당 공원이 필요해요 |
| 409 | park_request_not_pending | 대기 중인 신청만 처리할 수 있어요 |
| 409 | park_required | 먼저 관리할 공원을 선택해 주세요 |
| 409 | photo_already_exists | 이미 사진이 등록된 탐지예요 |
| 409 | photo_conflict | 사진 정보가 변경되었어요. 다시 조회해 주세요 |
| 409 | registration_not_approved | 승인된 관리자만 승인을 취소할 수 있어요 |
| 409 | registration_not_rejected | 이미 처리된 가입 신청이에요. 다시 로그인해 주세요 |
| 409 | robot_already_assigned | 이미 공원에 배정된 로봇이 있어요 |
| 409 | robot_assignment_changed | 로봇 배정이 변경됐어요. 다시 불러와 주세요 |
| 409 | robot_assignment_request_not_pending | 대기 중인 로봇 배정 요청만 처리할 수 있어요 |
| 409 | robot_assignment_request_pending | 이미 대기 중인 로봇 배정 요청이 있어요 |
| 409 | robot_assignment_request_stale | 신청 당시 공원 상태가 변경됐어요. 요청을 다시 확인해 주세요 |
| 409 | robot_not_available | 대기 또는 오프라인 상태의 로봇만 배정할 수 있어요 |
| 409 | robot_serial_exists | 이미 등록된 기기 식별 번호예요 |
| 409 | settings_conflict | 설정이 변경됐어요. 다시 불러온 뒤 저장해 주세요 |
| 409 | setup_incomplete | 분리수거장·순찰 지점·시간표를 먼저 저장해 주세요 |
| 409 | station_in_use | 기본 분리수거장으로 사용 중이에요. 다른 장소를 먼저 선택해 주세요 |
| 409 | station_position_exists | 같은 위치의 분리수거장이 이미 있어요 |
| 409 | station_required | 먼저 분리수거장 위치를 등록해 주세요 |
| 413 | photo_too_large | 사진 파일이 너무 커요 |
| 415 | photo_type_unsupported | JPEG 또는 PNG 사진을 보내 주세요 |
| 422 | duplicate_schedule | 겹치는 순찰 시각은 한 번만 지정해 주세요 |
| 422 | photo_invalid | 올바른 사진 파일을 보내 주세요 |
| 422 | point_outside_park | 공원 경계 안의 위치를 선택해 주세요 |
| 422 | point_too_far | 기존 지점과 거리가 멀어요(계산한 거리 포함) |
| 422 | robot_assignment_count_mismatch | 요청한 대수만큼 로봇을 선택해 주세요 |
| 422 | robot_required | 경로를 설정할 로봇을 선택해 주세요 |
| 422 | same_park | 현재 공원과 다른 공원을 선택해 주세요 |
| 422 | station_limit_exceeded | 분리수거장은 공원당 100곳까지 등록할 수 있어요 |
| 422 | station_position_mismatch | 선택한 분리수거장과 좌표가 달라요 |
| 422 | validation_error | 입력값을 확인해 주세요 |
| 500 | internal_error | 서버에서 문제가 생겼어요 |
| 503 | auth_not_configured | 서버의 JWT_SECRET 설정을 확인해 주세요 |
| 503 | db_unavailable | DB에 연결하지 못했어요. .env 의 DATABASE_URL을 확인해 주세요 |
| 503 | notifications_unavailable | 알림 정보를 처리하지 못했어요. 다시 시도해 주세요 |
| 503 | park_catalog_unavailable | 공원 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요 |
| 503 | patrol_unavailable | 순찰 설정을 처리하지 못했어요. 잠시 후 다시 시도해 주세요 |
| 503 | photo_db_unavailable | 사진 정보를 저장하지 못했어요 |
| 503 | photo_storage_not_configured | R2 사진 저장소 설정을 확인해 주세요 |
| 503 | photo_storage_unavailable | 사진 주소를 만들지 못했어요 |
| 503 | registration_unavailable | 재신청을 저장하지 못했어요. 다시 시도해 주세요 |

공통 인증: 401 invalid_token(누락·만료·변조·잘못된 용도), 403 registration_pending/rejected/incomplete(가입 승인 상태), 403 manager_required 또는 super_admin_required(역할), 503 auth_not_configured(JWT 설정). 순찰·운영·승인 서비스의 DB 오류는 503 patrol_unavailable, DB 유일 제약 등의 저장 충돌은 409 settings_conflict로 변환될 수 있습니다. 네트워크 연결 실패의 status=0/network_error는 앱·웹 클라이언트 자체 오류로 HTTP 응답 코드가 아닙니다.

## 6. 화면별 호출 순서

| 흐름 | 호출 순서·분기 |
| --- | --- |
| 신규 가입 | GET /parks → POST /auth/register → pending 안내 → 총관리자 승인 → POST /auth/login → GET /me·GET /park·GET /robots |
| 반려 재신청 | POST /auth/login(403 registration_rejected) → POST /auth/reapplication-session → 반려 사유 안내 → 정보 수정·공원 확인 → POST /auth/reapply → pending 안내 → 총관리자 재승인 → 로그인 |
| 가입 승인 | 총관리자 로그인 → GET /admin/registrations?status=pending → 필요 시 GET /admin/robots?unassigned=true → POST /admin/registrations/{user_id}/approve |
| 초기 순찰 설정 | GET /park·GET /robots → 대상 robotId 선택 → GET /route?robotId=... → PUT /route?robotId=... (body.catalogId 포함) → 홈 |
| 분리 저장 | PUT /station?catalogId=... → PUT /routes?robotId=... (body.catalogId) → PUT /schedules?robotId=...&catalogId=... → POST /route/complete?robotId=...&catalogId=... |
| 공원 변경 | GET /parks → POST /park-change-requests → 총관리자 목록·승인 → 기존 편집 저장은 409 park_changed → 새 /park·/route 조회 → 새 공원 순찰 설정 |
| 로봇 배정 | GET /admin/parks·GET /admin/robots → PATCH /admin/robots/{robot_id}/assignment → 앱에서 GET /robots 재조회 |
| 최초·추가 로봇 요청 | POST /robot-assignment-requests → GET /robot-assignment-requests → 총관리자 GET /admin/robot-assignment-requests → 미배정 로봇 선택 → POST /admin/robot-assignment-requests/{request_id}/approve → GET /robots 재조회. 프론트는 이번 변경에서 미수정. |

## 7. 구현 범위·제거된 API·별도 구현 예정

| 구분 | 현재 상태 |
| --- | --- |
| 구현된 HTTP API | 위에 전부 작성한 56개. 서버 상태·검색·계정·재신청·순찰 설정·승인·공원 변경·로봇 관리·배정 요청. |
| 배정 요청 알림 | 승인·반려 시 알림과 Expo 기기별 발송 대기열을 함께 저장합니다. 커밋 후 발송하며 프론트는 미수정입니다. 실제 수신에는 앱 기기 토큰·Expo 자격 증명·서버 설정이 필요합니다. |
| 제거됨 | GET /admin/parks/{park_id}/reports: 현재 라우터에서 제거됨. daily_reports, agent_runs, agent_steps 테이블과 해당 서버 사용 코드도 제거됨. |
| DB만 생성됨 | detections(탐지), robot_tasks(작업 이력)는 테이블만 있고 수신·조회 HTTP API는 아직 없습니다. notifications·push_tokens는 본인 조회·읽음·기기 등록·해제 API를 구현했습니다. |
| 탐지·이미지 | Cloudflare 이미지 경로 저장 필드만 존재. 업로드·서명 URL·이미지 조회 API는 미구현. |
| 푸시·알림 | 알림 API와 Expo 발송·재시도·영수증 처리를 구현했습니다. EXPO_PUSH_ENABLED 기본 false이며 주기 워커 python -m app.scripts.send_notification_pushes --watch가 필요합니다. 공개 임의 발송 API는 없고 프론트 연결은 별도입니다. |
| 로봇 실제 실행·실시간 | 순찰 시작/중지/분리수거장 이동 명령, 센서 상태 수신, 작업/탐지 결과 수신, 지도 마커, 배터리 % 계산, 실시간 영상·원격 조종·WebSocket 상태 API는 위 서버 라우터에 없음. |
| 경로 계산 | POST /routes/preview 및 실제 주행 가능한 polyline·예상 시간·도달 불가 사유 API는 미구현. 순찰 지점 저장과 다름. KAN-23의 프론트 요청사항은 구현 완료로 표기하지 않음. |
| 계정 기타 | 서버 로그아웃·토큰 갱신·비밀번호 찾기·계정 삭제·일반 프로필 수정 API는 미구현. 재신청은 반려 계정에 한정. |
| 앱 목업 | EXPO_PUBLIC_API_URL이 비면 목업. 주소가 있으면 SERVER_READY(auth, me, parks, park, route)만 서버 연결하며 나머지 알림·보고·지도 등은 목업일 수 있음. 앱 화면 존재를 서버 API 구현으로 해석하지 않음. |
| 호환 경로 4개 | PUT /park, GET /admin/park-requests, POST /admin/parks/{park_id}/approve, POST /admin/parks/{park_id}/reject. 현재 라우터에는 남아 있으며 새 가입·승인 흐름을 우선 사용. |

## 8. 명세 검증 기준

- server/app/main.py와 routers/api.py가 실제 등록한 전체 HTTP 경로를 FastAPI OpenAPI와 대조했습니다. Method+Path 조합 56개가 모두 명세에 존재하는지 자동 확인했습니다.
- 각 요청·응답 예시는 실제 Pydantic 모델로 검증했습니다. 입력 검증기, 권한·업무 오류·상태 전환은 services/auth.py, patrol.py, approval.py, operations.py, parks.py, health.py 및 core/security.py·errors.py와 대조했습니다.
- 공원·로봇 DB의 실제 계정 정보나 인증 키는 문서에 넣지 않았습니다. 모든 계정·좌표·토큰은 형식 설명용 예시입니다.
- DB 테이블이 있다는 이유만으로 HTTP API를 구현 완료로 적지 않았습니다. 원격 서버 버전·배포 주소·HTTPS·프록시 구성은 실제 배포 환경에서 별도 확인합니다.
