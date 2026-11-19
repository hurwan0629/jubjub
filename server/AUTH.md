# 로그인·인증 API (KAN-88)

서버는 Supabase PostgreSQL의 `users`를 사용해요. Supabase Auth는 사용하지 않아요.
비밀번호는 Argon2로 저장하고, 서버가 HS256 JWT를 발급해요.

## 실행 준비

`server/`에서 가상환경을 활성화하고 실행해요.

```powershell
pip install -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0
```

`.env`에 `DATABASE_URL`과 32바이트 이상의 무작위 `JWT_SECRET`을 넣어요.
키가 없거나 너무 짧으면 로그인·토큰 검증은 503 `auth_not_configured`를 반환해요.
키를 바꾸면 기존 토큰을 사용할 수 없어요. 설정 변경 후 서버를 다시 켜 주세요.

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

- `JWT_ACCESS_TOKEN_MINUTES=60`: 토큰 유효 시간 (1~1440분).
- 서명 키와 DB 비밀번호는 커밋하지 않아요.

## 회원가입

### 반려 후 재신청

반려 계정의 로그인은 `403 registration_rejected`를 반환해요. 앱은 아래 순서로 다시 신청해요.

1. `POST /auth/reapplication-session`: `{loginId, password}`로 본인 확인 후 기존 아이디·이름·이메일·전화번호·catalogId·반려 사유와 `reapplicationToken`, `expiresIn`을 받아요. 비밀번호는 반환하지 않아요.
2. 반려 사유 안내에서 **정보 고쳐 다시 신청하기**를 누르면 기존 정보를 채운 양식을 열어요. 아이디는 고정이고 비밀번호와 확인은 새로 입력해요. 공원을 확인한 뒤 제출해요.
3. `POST /auth/reapply`: `{reapplicationToken, password, name, email, phone, catalogId}`를 보내요. 같은 사용자와 공원 신청 행을 수정하고 상태를 `pending`으로 바꿔요. 반려·승인 정보는 초기화해요. 공원이 바뀌면 이전 경로·지점·시간표·좌표 기준점을 초기화하고 미처리 공원 변경 요청을 취소해요.
4. 성공 응답은 가입 응답과 같으며 HTTP 200이에요. 총관리자가 다시 승인해야 로그인할 수 있어요.

재신청 토큰은 30분간 유효하며 업무 API 인증에는 사용할 수 없어요. 일반 로그인 토큰으로 재신청할 수도 없어요. 제출 후에는 이전 재신청 토큰을 재사용할 수 없고, 만료 시 다시 로그인해요. 재신청 토큰과 비밀번호를 기기에 영구 저장하지 않아요. DB 스키마 변경은 필요하지 않아요.

`POST /auth/register` (토큰 없이 호출, 성공 201)

프로젝트에서 사용하는 하위관리자 회원가입이에요. 역할은 항상 manager이고 role 입력은 거부해요.
총관리자는 별도 콘솔 명령으로 생성해요([ADMIN.md](ADMIN.md)). 가입 정보는 Supabase의 `users`에 저장되며,
선택한 공원은 `parks`에 같은 트랜잭션으로 저장해요. 총관리자가 회원가입을 승인해야 로그인할 수 있어요.

```json
{
  "loginId": "admin01",
  "password": "ExamplePass123!",
  "name": "관리자",
  "phone": "010-1234-5678",
  "email": "admin@example.com",
  "catalogId": "1"
}
```

- 아이디: 영문·숫자 4~16자, 대소문자를 구분해요.
- 비밀번호: 영문·숫자를 포함해 8~128자. 공백을 임의로 제거하지 않아요.
- 이름: 앞뒤 공백을 제거하고 1~100자.
- 전화번호: 하이픈·공백을 제거해 숫자 9~15자로 저장해요.
- 이메일: 형식을 검증하고 소문자로 저장해요.
- 담당 공원: 공개 `GET /parks?query=...` 검색 결과의 `id`를 `catalogId`로 보내요. 없는 공원이면 404이며 계정도 생성하지 않아요.
- 비밀번호 확인은 앱에서 비교하고 전송하지 않아요.
- 아이디·이메일 중복: 409 `account_exists`. 동시 요청도 DB 유일 제약으로 막아요.
- 입력 오류: 422 `validation_error`.

응답에는 비밀번호·해시를 넣지 않아요.

```json
{"id":"1","name":"관리자","email":"admin@example.com","role":"manager","registrationStatus":"pending","parkStatus":"pending","routeSetupDone":false}
```

## 로그인

클라이언트는 역할별로 분리돼요. `app/`는 로그인 응답의 role이 super_admin이면 토큰을 저장하지 않고 웹 로그인 안내를 표시해요.
`web/`는 super_admin만 웹 세션에 저장하며 manager 계정에는 모바일 앱 이용을 안내해요. 서버는 두 클라이언트에서 같은 /auth/login과 권한 검사 API를 사용해요.

`POST /auth/login` (토큰 없이 호출)

```json
{"loginId":"admin01","password":"ExamplePass123!"}
```

```json
{
  "accessToken": "서버가 발급한 JWT",
  "tokenType": "bearer",
  "expiresIn": 3600,
  "isFirstLogin": true
}
```

로그인 응답에 role, registrationStatus, parkStatus, routeSetupDone을 함께 반환해요.
관리자는 가입 정보와 담당 공원을 함께 신청하고, 총관리자 승인 후 로그인 → 경로 설정 순으로 이동해요.
승인 전에는 403 `registration_pending`, 반려 후에는 403 `registration_rejected`이며 토큰을 발급하지 않아요.
이전 버전의 미완료 계정(담당 공원 없음)은 403 `registration_incomplete`로 담당자 문의를 안내해요.
기존 토큰으로도 `/me`·순찰 등 업무 API에 접근할 수 없도록 매 요청 승인 상태를 확인해요.
앱은 role → registrationStatus → routeSetupDone 순으로 분기해야 해요.
isFirstLogin은 호환 필드로, 승인된 공원에서 설정을 마친 하위관리자와 총관리자는 false예요.
완료 여부는 users가 아닌 parks.route_setup_done에 저장하며 로그인 자체로 상태를 바꾸지 않아요.

아이디·비밀번호가 틀리면 모두 같은 응답을 반환해요.

```json
{"status":401,"message":"아이디 또는 비밀번호를 확인해 주세요","code":"invalid_credentials"}
```

앱은 401을 받아 입력칸 오류 표시를 하고, 성공하면 기존 `setAuthToken(accessToken)`을 호출해요.
앱 화면의 API 연결·빨간 테두리 표시는 KAN-31/KAN-50에서 처리해요.

## 인증이 필요한 API

```http
GET /me
Authorization: Bearer <accessToken>
```

성공 시 name/email과 role/parkStatus/routeSetupDone을 반환해요.
토큰 누락·만료·변조·잘못된 알고리즘·삭제된 계정은 401 `invalid_token`이에요.
JWT는 사용자 번호(`sub`), 발급 시각(`iat`), 만료 시각(`exp`)만 포함해요.
JWT는 암호화가 아니라 서명이므로 비밀번호·연락처를 담지 않아요.
만료 시 다시 로그인해요. 리프레시 토큰은 이 작업 범위에 포함하지 않아요.

이후 업무 라우터는 `app/routers/api.py`의 `router.include_router(...)`에 등록해요.
공통 `get_current_user`가 토큰 서명·만료와 계정 존재 여부를 확인해요.
`/health`, `/docs`, `/redoc`, `/openapi.json`, 로그인·가입과 CORS preflight는 공개예요.
Swagger의 Authorize에 로그인 응답의 `accessToken`을 입력하면 `/me`를 호출할 수 있어요.

## 시드 계정

```powershell
python -m app.scripts.seed_user --login-id admin01 --name "관리자" --phone 01012345678 --email admin@example.com --catalog-id 1
```

비밀번호와 확인값은 터미널에서 숨겨 입력받아요. 명령 인자·파일에 평문 비밀번호를 남기지 않아요.
가입 API와 같은 검증·해시·필드를 사용하며, 이미 있는 아이디·이메일은 덮어쓰지 않아요.
시드 명령은 초기 계정을 터미널에서 직접 만들 때 사용하는 보조 도구예요.

## 완료 조건과 검증

| 완료 조건 | 구현·검증 |
| --- | --- |
| 아이디·비밀번호 확인, JWT 발급, 해시 저장 | 가입→로그인→인증 조회 테스트 |
| 첫 로그인 여부 | 설정 완료 전 반복 로그인 true, 완료 후 false |
| 틀리면 401 안내 | 없는 아이디·틀린 비밀번호가 같은 응답 |
| Bearer 인증 | `/me`, 공통 업무 라우터; 만료·변조·누락·삭제된 사용자 거부 |
| 회원가입 범위 결정 | 프로젝트의 정식 관리자 회원가입 API |
| 가입 필드·중복 409 | 다섯 입력값 검증, DB 유일 제약, 실패 후 로그인 정상 |
| 시드 계정 필드 | 동일 서비스 사용, CLI로 생성·중복 거부 테스트 |

자동 테스트는 격리 SQLite에서 실제 ORM 쿼리와 트랜잭션을 실행해요.
PostgreSQL 전용 identity/RLS는 Alembic 마이그레이션으로 관리해요.

참고: [FastAPI JWT·Argon2 안내](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/),
[PyJWT 검증 옵션](https://pyjwt.readthedocs.io/en/latest/usage.html).
