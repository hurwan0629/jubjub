# JUBJUB 서버 (FastAPI · PostgreSQL)

관리자 앱(`app/`)과 로봇·에이전트를 잇는 API 서버예요. DB는 팀이 같이 쓰는 Supabase(PostgreSQL) 프로젝트 하나를 써요. 개발할 때 도커는 필요 없어요.

- Jira: KAN-84 백엔드 에픽 / KAN-85 기본 세팅
- 문서: Confluence "시스템 아키텍처 설계서", "DB 설계서 (ERD)"

## 처음 실행하기

Python 3.11 이상이 필요해요. 명령은 모두 `server/` 폴더에서 실행해요.

```bash
cd server
python -m venv .venv
```

가상환경을 켜요. 터미널을 새로 열 때마다 다시 켜야 해요.

```bash
# Windows (Git Bash)
source .venv/Scripts/activate
# Windows (PowerShell)
.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate
```

패키지를 설치하고 `.env`를 만들어요.

```bash
pip install -r requirements-dev.txt
cp .env.example .env
```

`.env`의 `DATABASE_URL`에 Supabase 연결 문자열을 넣어요. 비밀번호는 팀 채널에서 받아요. 아래 [DB 연결](#db-연결-supabase)을 참고해 주세요.

서버를 켜요.

```bash
uvicorn app.main:app --reload --host 0.0.0.0
```

- API 문서(Swagger): http://localhost:8000/docs
- 상태 확인: http://localhost:8000/health → `{"status":"ok","db":"ok"}`가 나오면 DB까지 연결된 거예요.
- `--host 0.0.0.0`을 붙여야 같은 Wi-Fi의 휴대폰(Expo Go)에서 `http://<내 PC IP>:8000`으로 부를 수 있어요.

앱과 연결하려면 `app/.env`에 `EXPO_PUBLIC_API_URL=http://<내 PC IP>:8000`을 넣어요. 비워 두면 앱은 목업 데이터를 써요.

## DB 연결 (Supabase)

Supabase 대시보드 > 프로젝트 > **Connect** 버튼에서 연결 문자열을 복사해요. `postgresql://`로 시작하는 주소를 그대로 붙여 넣으면 서버가 알아서 psycopg 드라이버 주소로 바꿔요.

| 방식 | 포트 | 언제 쓰나 |
|---|---|---|
| Direct connection | 5432 | IPv6 네트워크에서만 돼요. 집·학원 Wi-Fi는 대부분 IPv4라 안 될 수 있어요 |
| **Session pooler** (권장) | 5432 | IPv4에서도 돼요. 개발·시연 기본값 |
| Transaction pooler | 6543 | 연결이 아주 많을 때. 서버에서 prepared statement를 꺼 둬서 이것도 동작해요 |

`/health`가 503 `db_unavailable`을 돌려주면 다음을 확인해 주세요.

1. 주소와 비밀번호. 비밀번호에 특수문자가 있으면 URL 인코딩이 필요해요 (예: `@` → `%40`).
2. Direct로 안 되면 Session pooler 주소로 바꿔 보기.
3. 학교·회사 네트워크가 5432/6543 포트를 막는지 확인. 휴대폰 핫스팟으로 바꿔 보면 빨리 알 수 있어요.

Supabase는 DB로만 써요. Supabase Auth와 자동 REST API는 쓰지 않고, 로그인은 이 서버의 JWT로 해요(KAN-88).

## 폴더 구조

```
server/
├─ app/
│  ├─ main.py        앱 생성, CORS, 라우터 등록
│  ├─ core/          설정(config), DB 연결(db), 에러 형식(errors)
│  ├─ routers/       URL과 요청·응답만 담당 (얇게)
│  ├─ schemas/       Pydantic 요청·응답 모양
│  ├─ services/      실제 로직 (DB 조회, 로봇 명령, 판단)
│  └─ models/        SQLAlchemy 테이블 정의
├─ alembic/          DB 마이그레이션
├─ tests/            pytest
├─ requirements.txt  서버 패키지 (버전 고정)
└─ requirements-dev.txt  + ruff, pytest
```

## API 추가하는 순서

`GET /health`가 이 순서대로 짜여 있어요. 그대로 따라 하면 돼요.

1. `schemas/<자원>.py`: 요청·응답 Pydantic 모델
2. `models/<자원>.py`: 테이블이 필요하면 SQLAlchemy 모델을 만들고 `models/__init__.py`에서 import
3. `services/<자원>.py`: 로직. 에러는 `raise AppError(404, "순찰 지점을 찾을 수 없어요", code="point_not_found")`
4. `routers/<자원>.py`: `APIRouter`를 만들고 `main.py`에서 `app.include_router(...)`
5. `tests/test_<자원>.py`: 테스트

## 에러 응답 형식

모든 에러는 같은 모양이에요. 앱의 `ApiError`가 `status`·`message`·`code`를 읽어요.

```json
{ "status": 404, "message": "순찰 지점을 찾을 수 없어요", "code": "point_not_found" }
```

입력값 검사 실패(422)는 `details`에 `[{ "field": "body.name", "reason": "..." }]`가 붙어요. 예상 못 한 에러는 500 `internal_error`로 내려가고, 자세한 내용은 서버 로그에만 남아요.

## DB 마이그레이션 (Alembic)

로그인·회원가입 API와 시드 계정 실행 방법은 [AUTH.md](AUTH.md)를 참고해 주세요.
서울 공원 검색 API·경계 데이터 적재와 프론트 연결 안내는 [PARKS.md](PARKS.md)에 있어요.

테이블은 Supabase 대시보드에서 직접 바꾸지 않고 Alembic으로만 바꿔요.

```bash
alembic revision --autogenerate -m "points 테이블 추가"   # models 변경을 보고 파일 생성
alembic upgrade head                                     # DB에 적용
alembic downgrade -1                                     # 하나 되돌리기
```

생성된 `alembic/versions/` 파일은 꼭 열어서 확인하고 커밋해요. DB를 같이 쓰기 때문에 `upgrade`는 팀에 알리고 실행해요.

## 린트 · 포맷 · 테스트

```bash
ruff check --fix .   # 린트 (import 정렬 포함)
ruff format .        # 포맷
pytest               # 테스트 (실제 DB 없이 돌아가요)
```

VS Code에 Ruff 확장을 설치하면 저장할 때 자동으로 포맷돼요.

## 환경 변수

모든 설정은 `.env`에서 읽어요 (`app/core/config.py`). 코드에 주소·키를 직접 쓰지 않아요.

`--reload`는 `.py` 파일만 지켜봐요. `.env`를 고친 뒤에는 서버를 껐다 켜야(Ctrl+C 후 다시 실행) 새 값이 적용돼요.

| 이름 | 설명 |
|---|---|
| `DATABASE_URL` | Supabase 연결 문자열 (필수) |
| `CORS_ORIGIN_REGEX` | 호출을 허용할 웹 주소. 기본값은 localhost와 사설 IP(같은 Wi-Fi) |
| `JWT_SECRET` | 로그인 토큰 서명 키 |
| `ROBOT_BRIDGE_URL` | 로봇 rosbridge 주소 (`ws://<로봇 IP>:9090`) |
| `USE_SIMULATOR` | `true`면 실제 로봇 없이 시뮬레이터 사용 |
| `PHOTO_DIR` | 사진 저장 폴더 (git에 안 올라가요) |
| `LLM_API_KEY`, `LLM_MODEL` | 운영 에이전트 LLM |

새 설정이 필요하면 `config.py`의 `Settings`와 `.env.example`에 같이 추가해요.

## 의존성 바꾸기

`requirements.txt`는 버전을 고정해요. 패키지를 추가하면 `pip install <패키지>==<버전>` 후 파일에 한 줄 추가하고, PR에 적어 주세요.
