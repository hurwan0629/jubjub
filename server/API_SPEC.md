# JUBJUB API 명세서 — 현재 구현 기준

# API 명세서 1/3 — 공통·서버 상태·공원 검색·회원가입·로그인

기준일: **2026-11-14 (KST)**. 현재 로컬 FastAPI 라우터·스키마·서비스와 생성 OpenAPI를 대조했습니다. 전체 HTTP API는 **25개(기존 호환 API 4개 포함)**입니다. 문서 갱신이 서버 배포·재시작 완료를 뜻하지는 않습니다.

## 1. 공통 규칙

- 기본 주소: `http://localhost:8000`. 휴대폰에서는 서버 PC의 사설 IP와 포트 8000을 사용합니다.
- Swagger: `/docs`, OpenAPI: `/openapi.json`.
- 요청·응답은 JSON, 필드명은 camelCase입니다. ID는 JSON에서 문자열로 전달합니다.
- JSON 요청: `Content-Type: application/json`.
- 인증 요청: `Authorization: Bearer <accessToken>`.
- 공개 API: `GET /health`, `GET /parks`, `POST /auth/register`, `POST /auth/login`.
- 역할: 관리자 `manager`, 총관리자 `super_admin`. 총관리자는 공개 가입으로 생성할 수 없습니다.
- 아래 계정·ID·주소·좌표는 형식 설명용 예시입니다. 실제 가입은 검색 결과의 ID를, 설정 저장은 해당 공원 경계 안 좌표를 사용합니다.
- 목록은 별도 포장 없이 배열 `[]`로 응답합니다. 날짜·시각은 ISO 8601이며 표시 시 KST로 변환합니다. 시간표 `HH:mm`은 한국 현지 시각 계약입니다.

## 2. 서버 상태 — GET /health

**요청:** 본문·토큰 없음.

**응답 200:**

```json
{
  "status": "ok",
  "db": "ok"
}
```

DB 연결 실패는 `503 db_unavailable`입니다. 로봇이나 외부 서비스의 정상 동작까지 보장하지는 않습니다.

## 3. 공원 검색 — GET /parks

**요청:** `GET /parks?query=예시공원&limit=20&offset=0` (토큰 불필요).

| Query | 기본값 | 조건 |
| --- | --- | --- |
| query | 빈 문자열 | 이름·주소, 최대 100자 |
| limit | 20 | 1~100 |
| offset | 0 | 0~10000 |

이름 또는 주소로 검색하고, 공백으로 나눈 단어가 모두 일치해야 합니다. 활성 공원만 이름·ID 순으로 반환합니다. 검색어가 비었거나 결과가 없으면 `200 []`입니다. 내 위치 검색·거리순 정렬은 지원하지 않으며 `distance`는 빈 문자열입니다.

**응답 200:**

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

`bounds`: 남서·북동 지도 범위. `area.outer`: 바깥 경계, `area.holes`: 제외 영역입니다. 오류: `422 validation_error`, `503 park_catalog_unavailable`.

## 4. 회원가입 신청 — POST /auth/register

**요청:** 토큰 없이 계정 정보와 담당 공원을 함께 제출합니다.

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

| 필드 | 조건 |
| --- | --- |
| loginId | 영문·숫자 4~16자, 대소문자 구분 |
| password | 영문·숫자 포함 8~128자 |
| name | 앞뒤 공백 제거 후 1~100자 |
| phone | 하이픈·공백 제거 후 숫자 9~15자 |
| email | 유효한 이메일, 최대 254자, 소문자 저장 |
| catalogId | GET /parks 결과의 id, 양의 정수 형태 문자열 |

비밀번호 확인과 필수 개인정보 동의는 프론트에서 확인합니다. 정의되지 않은 요청 필드(예: role)는 422입니다.

**응답 201:**

```json
{
  "id": "12",
  "name": "공원 관리자",
  "email": "manager@example.com",
  "role": "manager",
  "registrationStatus": "pending",
  "parkStatus": "pending",
  "routeSetupDone": false
}
```

**계정(users)과 지정 공원(parks)을 한 트랜잭션으로 저장하고, 가입 승인 대기 상태로 둡니다. 자동 로그인하지 않으며 토큰도 발급하지 않습니다.** 없는/비활성 공원은 404이고 불완전한 계정은 생성하지 않습니다. 중복 계정은 409이며 일부만 저장되지 않습니다.

오류: `404 park_not_found`, `409 account_exists`, `422 validation_error`, `503 registration_unavailable`.

## 5. 로그인 — POST /auth/login

**요청:**

```json
{
  "loginId": "manager01",
  "password": "ExamplePass123!"
}
```

**가입 승인 후 응답 200:**

```json
{
  "accessToken": "<JWT>",
  "tokenType": "bearer",
  "expiresIn": 3600,
  "isFirstLogin": true,
  "role": "manager",
  "registrationStatus": "approved",
  "parkStatus": "approved",
  "routeSetupDone": false
}
```

| 필드 | 의미 |
| --- | --- |
| accessToken | 이후 요청의 Bearer 토큰 |
| expiresIn | 유효 시간(초), 기본 3600 |
| role | manager 또는 super_admin |
| registrationStatus | 가입 승인 상태 |
| parkStatus | 이전 앱 호환용 상태 |
| routeSetupDone | 순찰 초기 설정 완료 여부 |
| isFirstLogin | 관리자 최초 순찰 설정이 필요하면 true. 총관리자는 false |

승인 대기: `403 registration_pending`, 반려: `403 registration_rejected`. 기존 버전의 담당 공원 없는 계정은 `403 registration_incomplete`로 담당자 문의를 안내합니다. 이 경우 JWT를 발급하지 않으며, 기존 JWT로 업무 API에 접근해도 차단합니다.

아이디·비밀번호가 틀리면 `401 invalid_credentials`, 서명 설정 문제는 `503 auth_not_configured`입니다. 비밀번호는 Argon2 해시로 저장하고 JWT는 HS256, sub/iat/exp를 사용합니다. refresh API는 없습니다.

## 6. 내 계정 — GET /me

**요청:** 본문 없음, 로그인 토큰 필요.

**응답 200:**

```json
{
  "name": "공원 관리자",
  "email": "manager@example.com",
  "role": "manager",
  "registrationStatus": "approved",
  "parkStatus": "approved",
  "routeSetupDone": false
}
```

관리자: `routeSetupDone=false`이면 5단계 초기 설정, true이면 홈으로 이동합니다. 총관리자는 별도 관리 화면으로 분기합니다. 총관리자 관리 UI는 아직 안내 화면만 있습니다.

## 7. 담당 공원 — GET /park

**요청:** 본문 없음, 승인된 관리자 토큰 필요.

**응답 200 — ManagedPark:**

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
  "approvedBy": "8",
  "approvedAt": "2026-11-14T03:00:00Z",
  "rejectReason": null,
  "routeSetupDone": false
}
```

**ID 구분:** `id`는 운영 공원 행 ID, `catalogId`는 공원 검색 목록 ID, 가입 신청의 `userId`는 계정 ID입니다. 서로 바꿔 사용하지 않습니다.

가입 승인 상태는 관리자-담당 공원의 1:1 관계에 있는 parks.status를 단일 원천으로 사용합니다. 응답의 registrationStatus는 이를 가입 승인 의미로 명시한 필드입니다.

---

# API 명세서 2/3 — 순찰 설정·총관리자 가입 승인·로봇 관리

기준일: **2026-11-14 (KST)**. 인증·공통 응답 규칙은 명세서 1/3을 참고합니다.

## 8. 순찰 설정 전체 조회·저장

| 기능 | API | 성공 |
| --- | --- | --- |
| 전체 설정 조회 | GET /route | 200 RouteConfig |
| 전체 설정 저장·초기 설정 완료 | PUT /route | 200 RouteConfig |

둘 다 승인된 관리자 토큰이 필요합니다. 현재 프론트의 초기 설정과 경로 편집은 전체 저장 방식을 사용합니다.

### PUT /route 요청

```json
{
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

| 항목 | 의미 |
| --- | --- |
| station | 분리수거장 위치, 필수 |
| points | 이름·좌표를 가진 순찰 지점 배열, 순찰 순서대로 1~100개 |
| schedule | 시간표 배열, 전체 저장에서는 1~100개 |
| time | 00:00~23:59, HH:mm |
| label | 시간표 표시 이름 |
| on | 해당 시간표 사용 여부 |
| repeat | daily(매일), weekdays(평일), weekends(주말). 기본 daily |

### GET /route 및 PUT /route 응답 200 — RouteConfig

```json
{
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
      "id": "101",
      "name": "정문",
      "position": {
        "latitude": 37.5435,
        "longitude": 127.0334
      }
    }
  ],
  "schedule": [
    {
      "id": "30",
      "time": "10:00",
      "label": "오전 순찰",
      "on": true,
      "repeat": "daily"
    }
  ]
}
```

미설정 항목은 station=null, points/schedule=[]입니다. 응답의 지점·시간표 id는 서버 발급값으로 갱신합니다.

### 저장 규칙

- 분리수거장과 순찰 지점은 지정 공원 경계 안이어야 합니다(제외 영역도 검사).
- 분리수거장 포함 기존 지점들과 1km 이내로 연결되지 않는 지점은 거부합니다. 단순 순찰 배열 순서가 아닌 연결성을 검사합니다.
- 같은 좌표의 순찰 지점은 중복 저장할 수 없습니다.
- 같은 시각에 반복 요일이 겹치면 duplicate_schedule입니다. daily는 weekdays/weekends와 겹치고 weekdays와 weekends는 서로 겹치지 않습니다. on=false 항목도 중복 검사 대상입니다.
- 전체 설정 저장은 분리수거장·경로·시간표·변경 로그·초기 완료 여부를 한 번에 커밋합니다. 하나라도 실패하면 모두 롤백합니다.
- 성공하면 parks.route_setup_done=true이며 다음 로그인에서 초기 설정을 반복하지 않습니다. 모든 시간표가 꺼져 있어도 항목이 하나 이상이면 완료 가능합니다.
- 경로는 새 버전으로 저장하고 이전 경로는 비활성화하며 과거 지점 이력을 보존합니다. 관리자 경로 수정 로그를 같은 트랜잭션으로 기록합니다.
- appliesFrom=nextPatrol은 다음 순찰용 설정 계약입니다. 실제 자동 순찰 스케줄러·로봇 실행은 아직 미구현입니다.
- 요청의 parkName/bounds/area로 담당 공원을 바꾸지 않습니다. 서버는 지정 공원 카탈로그를 사용합니다.
- 프론트는 성공 응답 후 완료 안내, 실패 시 입력 유지·오류 표시를 합니다.

## 9. 항목별 순찰 설정

| API | 요청 본문 | 응답 200 |
| --- | --- | --- |
| GET /station | 없음 | 좌표 또는 null |
| PUT /station | {latitude,longitude} | 저장 좌표 |
| GET /routes | 없음 | RouteResponse |
| PUT /routes | {points:[...]} | RouteResponse |
| GET /schedules | 없음 | 시간표 배열 |
| PUT /schedules | 시간표 배열 [...] | 저장된 시간표 배열 |
| POST /route/complete | 없음 | {routeSetupDone:true} |

### 분리수거장 저장 — PUT /station

```json
{
  "latitude": 37.5433,
  "longitude": 127.0332
}
```

공원마다 한 곳이며 변경 시 기존 순찰 지점 연결성도 검사합니다.

### 지점·순서 저장 — PUT /routes

```json
{
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

**GET/PUT /routes 응답 200:**

```json
{
  "id": "20",
  "start": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "points": [
    {
      "id": "101",
      "name": "정문",
      "position": {
        "latitude": 37.5435,
        "longitude": 127.0334
      }
    }
  ],
  "end": {
    "latitude": 37.5433,
    "longitude": 127.0332
  },
  "appliesFrom": "nextPatrol"
}
```

start와 end는 분리수거장입니다. points에는 순찰 지점만 있으며 앱은 분리수거장을 목록의 앞뒤에 고정 표시해야 합니다. 경로 미등록 시 id=null, points=[], start/end는 등록된 분리수거장 또는 null입니다. 분리수거장 없이 경로를 저장하면 `409 station_required`입니다.

### 시간표 저장 — PUT /schedules

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

**GET/PUT /schedules 응답 200:**

```json
[
  {
    "id": "30",
    "time": "10:00",
    "label": "오전 순찰",
    "on": true,
    "repeat": "daily"
  }
]
```

시간표는 전체 교체이며 시각·ID 순으로 조회합니다. 항목별 PUT /schedules는 빈 배열도 허용하고, 빈 배열 저장 시 초기 설정 완료 상태를 false로 바꿉니다.

### 개별 저장 후 완료 — POST /route/complete

**요청:** 본문 없음.

**응답 200:**

```json
{
  "routeSetupDone": true
}
```

분리수거장·활성 경로·시간표가 있어야 하며 없으면 `409 setup_incomplete`입니다. 이 완료 API는 최신 카탈로그 경계로 기존 좌표를 재검증하지 않습니다. 다시 검증·저장하려면 PUT /route를 사용합니다. PUT /route는 완료 처리까지 포함하므로 별도 complete 호출이 필요 없습니다.

## 10. 총관리자 — 회원가입 신청 목록

**GET /admin/registrations?status=pending&limit=20&offset=0**

총관리자 토큰 필수. status=pending/approved/rejected, 생략 시 pending. limit=20(1~100), offset=0(0~10000). 결과는 생성 시각·ID 순이며 없으면 []입니다.

**응답 200:** 각 항목은 명세서 1/3의 ManagedPark 전체 필드에 다음 필드가 추가된 배열입니다.

| 추가 필드 | 설명 |
| --- | --- |
| userId | 신청자 계정 ID |
| applicantName | 신청자 이름 |
| applicantLoginId | 로그인 아이디 |
| applicantEmail | 이메일 |
| applicantPhone | 전화번호 |
| registrationStatus | pending/approved/rejected |
| createdAt | 가입 신청 시각 |

## 11. 총관리자 — 회원가입 승인

**POST /admin/registrations/{userId}/approve**

주소에는 신청자의 userId를 넣습니다. 총관리자 토큰 필수입니다.

**요청 — 로봇 없이 승인:**

```json
{}
```

**요청 — 로봇도 함께 배정:**

```json
{
  "robotIds": [
    "1",
    "2"
  ]
}
```

**응답 200:** ManagedPark 전체 형식. status=approved, approvedBy/approvedAt 채움, rejectReason=null입니다.

- 담당 공원을 지정한 관리자의 가입 신청 전체를 승인합니다. 공원 단독 승인을 뜻하지 않습니다.
- pending 신청만 처리하며, 신청자의 현재 역할은 manager, 카탈로그 공원은 활성 상태여야 합니다.
- 로봇 배정은 선택입니다. 지정 시 최대 100개·중복 불가이며 모두 미배정 상태의 idle/offline 로봇이어야 합니다.
- 같은 공원에 승인된 관리자는 한 명만 허용합니다.
- 로봇을 지정하면 가입 승인과 로봇 할당을 한 트랜잭션으로 처리합니다. 실제 온라인 연결·주행은 시작하지 않습니다.

## 12. 총관리자 — 회원가입 반려

**POST /admin/registrations/{userId}/reject**

**요청:**

```json
{
  "reason": "담당 공원 확인이 필요합니다."
}
```

**응답 200:** ManagedPark 전체 형식. status=rejected, rejectReason은 위 사유, approvedBy/approvedAt은 null입니다. reason은 공백 제거 후 1~1000자입니다. 이미 처리한 신청은 `409 park_request_not_pending`입니다.

현재 반려 계정의 재신청·승인 취소 전용 API는 없습니다. 앱은 총관리자 문의를 안내합니다.

## 13. 로봇 등록·조회

| 기능 | API | 권한 | 성공 |
| --- | --- | --- | --- |
| 로봇 등록 | POST /admin/robots | 총관리자 | 201 RobotResponse |
| 전체·미배정 조회 | GET /admin/robots | 총관리자 | 200 RobotResponse[] |
| 내 담당 공원의 로봇 조회 | GET /robots | 승인된 관리자 | 200 RobotResponse[] |

### POST /admin/robots 요청

```json
{
  "name": "Jubi",
  "serialNo": "JUBI-EXAMPLE-001"
}
```

name/serialNo는 공백 제거 후 1~100자이며 serialNo는 유일해야 합니다.

**등록 응답 201 — RobotResponse:**

```json
{
  "id": "1",
  "name": "Jubi",
  "serialNo": "JUBI-EXAMPLE-001",
  "parkId": null,
  "status": "offline",
  "assignedAt": null,
  "createdAt": "2026-11-14T03:00:00Z"
}
```

조회 응답은 위 형식의 배열이며 없으면 []입니다. GET /admin/robots는 unassigned=false(기본)/true, limit=20(1~100), offset=0(0~10000)를 받습니다. unassigned=true는 parkId=null만 반환하며 로봇 가용 상태 필터는 아닙니다. 로봇 상태는 idle/working/charging/offline/error입니다.

중복 기기 번호는 `409 robot_serial_exists`입니다. 등록만으로 로봇을 공원에 배정하지 않으며, 기존 승인 이후 별도 배정·회수·재배치 API는 아직 없습니다.

---

# API 명세서 3/3 — 오류·전체 흐름·호환 API·남은 작업

기준일: **2026-11-14 (KST)**. 새 기능은 현재 로컬 구현 기준이며 배포·재시작 여부와는 구분합니다.

## 14. 공통 오류 응답

```json
{
  "status": 403,
  "message": "총관리자의 회원가입 승인을 기다리고 있어요. 승인 후 로그인해 주세요",
  "code": "registration_pending"
}
```

입력 검증 실패의 details는 필드·이유 배열입니다.

```json
{
  "status": 422,
  "message": "입력값을 확인해 주세요",
  "code": "validation_error",
  "details": [
    {
      "field": "body.email",
      "reason": "입력 조건을 확인해 주세요"
    }
  ]
}
```

거리 오류의 details는 객체입니다.

```json
{
  "status": 422,
  "message": "기존 지점과 약 1.5km 떨어져 있어요. 1km 이내로 지정해 주세요",
  "code": "point_too_far",
  "details": {
    "distanceMeters": 1500,
    "maxDistanceMeters": 1000
  }
}
```

message/reason 예시는 설명용입니다. 프론트는 HTTP 상태·code로 분기하고 message를 표시합니다. details를 항상 배열이라고 가정하지 않습니다.

| HTTP | code | 의미 |
| --- | --- | --- |
| 401 | invalid_credentials | 아이디·비밀번호 불일치 |
| 401 | invalid_token | 토큰 누락·만료·변조·삭제된 계정 |
| 403 | registration_pending | 회원가입 승인 대기 |
| 403 | registration_rejected | 회원가입 반려 |
| 403 | registration_incomplete | 기존 계정의 담당 공원 지정 누락 |
| 403 | super_admin_required | 총관리자 전용 |
| 403 | manager_required | 관리자 전용 |
| 403 | park_not_approved | 서비스 내부 공원 승인 검증 |
| 404 | park_not_found | 공원 없음·비활성 |
| 404 | registration_not_found | 가입 신청 없음 |
| 404 | park_request_not_found | 기존 호환 신청 번호 없음 |
| 404 | robot_not_found | 로봇 없음 |
| 409 | account_exists | 아이디·이메일 중복 |
| 409 | park_required | 담당 공원 없음 |
| 409 | station_required | 분리수거장 없음 |
| 409 | setup_incomplete | 초기 설정 필수 항목 없음 |
| 409 | approved_park_change_forbidden | 승인된 공원 변경 시도 |
| 409 | park_request_not_pending | 이미 처리한 신청 |
| 409 | invalid_applicant_role | 신청자 역할이 manager가 아님 |
| 409 | park_catalog_inactive | 운영 불가 공원 |
| 409 | park_already_approved | 이미 승인된 담당자가 있는 공원 |
| 409 | robot_already_assigned | 이미 배정된 로봇 |
| 409 | robot_not_available | 배정 불가 로봇 상태 |
| 409 | robot_serial_exists | 기기 식별 번호 중복 |
| 409 | settings_conflict | 동시 변경·DB 제약 충돌 |
| 422 | validation_error | 입력 형식·범위 오류 |
| 422 | point_outside_park | 공원 경계 밖 좌표 |
| 422 | point_too_far | 1km 연결 조건 위반 |
| 422 | duplicate_schedule | 겹치는 시간표 |
| 503 | auth_not_configured | JWT 서명 설정 오류 |
| 503 | registration_unavailable | 가입 신청 DB 처리 실패 |
| 503 | park_catalog_unavailable | 공원 목록 DB 조회 실패 |
| 503 | patrol_unavailable | 설정·승인·로봇 DB 처리 실패 |
| 503 | db_unavailable | 서버 상태 확인 DB 연결 실패 |
| 500 | internal_error | 예상하지 못한 서버 오류 |

## 15. 전체 연결 흐름

```text
관리자: 가입 정보 입력
  → GET /parks로 담당 공원 검색·지정
  → POST /auth/register에 계정 정보+catalogId 함께 제출
  → 가입 승인 대기(토큰 없음)

총관리자: POST /auth/login
  → GET /admin/registrations
  → 신청자 정보·지정 공원 확인
  → POST /admin/registrations/{userId}/approve 또는 /reject

승인된 관리자: POST /auth/login
  → GET /me, GET /park, GET /route
  → routeSetupDone=false: 최초 순찰 설정 5단계
  → PUT /route 성공 후 완료·홈
  → 재로그인 시 routeSetupDone=true: 홈
  → 지도 > 경로 편집에서 GET /route, PUT /route
```

가입 정보 입력 후 다음 버튼은 서버에 쓰지 않습니다. 공원을 확정할 때 가입 신청 전체를 저장합니다. 순찰 저장이 실패해도 이미 승인된 가입과 담당 공원은 유지합니다. 로봇 없이 가입 승인은 가능하지만 실제 순찰 실행은 별도 연동입니다.

## 16. 기존 호환 API 4개

| API | 요청 | 응답·주의 |
| --- | --- | --- |
| PUT /park | {catalogId:"69"} | 200 ManagedPark. 승인된 관리자는 같은 공원 유지, 다른 공원 변경은 409. 새 가입 흐름에서는 사용하지 않음 |
| GET /admin/park-requests | status?, limit=20, offset=0 | 200 가입 신청 배열. status 생략 시 전체(신규 /admin/registrations의 기본 pending과 다름) |
| POST /admin/parks/{parkId}/approve | {} 또는 {robotIds:["1"]} | 200 ManagedPark. 주소에는 운영 공원 id 사용 |
| POST /admin/parks/{parkId}/reject | {reason:"사유"} | 200 ManagedPark. 주소에는 운영 공원 id 사용 |

총관리자 호환 경로도 동일한 역할·상태·트랜잭션 검사를 합니다. 신규 관리 화면은 userId 기준 /admin/registrations를 사용합니다. pending/rejected 계정은 로그인·업무 API가 차단되므로 PUT /park로 스스로 재신청하지 못합니다.

## 17. 현재 구현·미구현 구분

| 항목 | 현재 상태 |
| --- | --- |
| 가입 정보+담당 공원 동시 제출 | 구현. POST /auth/register에 catalogId 필수 |
| 승인 전 로그인·기존 토큰 차단 | 구현. registration_pending/rejected/incomplete |
| 총관리자 가입 목록·승인·반려 API | 구현. 로봇 배정 선택 |
| 초기 순찰 5단계·전체 설정 저장 | 프론트 연결. 성공 후에만 완료 표시 |
| 총관리자 승인 관리 화면 | API와 진입 안내만 있음. 목록·승인 버튼 UI 미구현 |
| 가입 승인 푸시 알림 | 미구현. [KAN-139](https://kdt-3team-finalterm.atlassian.net/browse/KAN-139) |
| 승인 완료 팝업·알림 수신 화면 | Figma와 추가 정합성 확인 필요 |
| 프론트 분리수거장 출발·종료 고정 표시 | 추가 수정 필요. [KAN-32](https://kdt-3team-finalterm.atlassian.net/browse/KAN-32), [KAN-39](https://kdt-3team-finalterm.atlassian.net/browse/KAN-39) |
| 프론트 1km 초과 핀 추가 차단 | 추가 수정 필요. 서버 저장 검증은 구현 |
| 프론트 다음 순찰 안내 | 평일·주말 반복 조건 반영 추가 수정 필요 |
| 내 위치 공원 검색·거리순 정렬 | 미지원. 이름·주소 검색만 사용. Figma의 내 위치 버튼·거리 표시와 차이 |
| 실제 주행 경로 미리보기 | 미구현. [KAN-94](https://kdt-3team-finalterm.atlassian.net/browse/KAN-94). /routes는 주행 polyline이 아님 |
| 로봇 실시간 상태·작업 대기열·로봇 보내기·히트맵 | API 미구현. 앱 목업과 구분 |
| 알림·판단 로그 조회·일일 보고·WebSocket | API 미구현. 경로 수정 로그 DB 저장만 구현 |
| 자동 순찰 실행·SLAM 좌표 변환 | 미구현. 현재는 설정 저장 |
| 승인 취소·반려 재신청·담당자 변경·로봇 회수/재배치 | 별도 API 미구현 |
| 머무는 시간 | KAN-39에서 구현하지 않는 것으로 명시. Figma의 잔여 표시는 무시 |

공원 카탈로그 경계가 변경되어도 기존 저장 지점을 자동 이동·비활성화하지 않습니다. 실행기 연동 시 실행 전 재검증이 필요합니다.

현재 서버 테스트 106개·프론트 테스트 8개 통과 기록이 있지만, 운영 DB를 이용한 전체 GUI 흐름 검증과 실제 로봇 운용 검증을 뜻하지는 않습니다. 기존 린트 경고 4개가 남아 있습니다.

## 18. 문서·관련 작업

- 저장소 사본: `server/API_SPEC.md`. 상세 설명: `server/AUTH.md`, `PARKS.md`, `PATROL.md`, `ADMIN.md`.
- [KAN-88 로그인·인증](https://kdt-3team-finalterm.atlassian.net/browse/KAN-88), [KAN-93 순찰 설정 API](https://kdt-3team-finalterm.atlassian.net/browse/KAN-93), [KAN-139 승인 알림](https://kdt-3team-finalterm.atlassian.net/browse/KAN-139).
- [Figma Page 2 회원가입](https://www.figma.com/design/8jxiaGJ8smbceYuXug5roD/Untitled?node-id=211-2653).
- 기존 경로 미리보기 요청 댓글(10001)은 보존합니다. 댓글의 제안 경로를 구현된 API로 간주하지 않습니다.
- DB 구조는 기존 Alembic 20261113_0004 기준을 재사용합니다. 이번 가입 흐름 정정에서 추가 DB 마이그레이션이나 기존 데이터 일괄 변경은 하지 않았습니다.
