# JUBJUB 서버 (FastAPI · SQLAlchemy 2 · Supabase PostgreSQL)

실행법·구조는 [README.md](README.md). 예시 흐름은 `GET /health` (routers/health.py → services/health.py → schemas/health.py).

## 반드시 지킬 규칙

- 라우터는 얇게: 요청 받기 → services 호출 → schemas로 응답. 로직·DB 쿼리는 `services/`에.
- 인증이 필요한 업무 라우터는 `app/routers/api.py`의 공통 `router`에 등록한다. `get_current_user`가 Bearer JWT를 검증한다. 로그인·가입·health는 공개 API다.
- 에러는 `raise AppError(status, "해요체 문장", code="snake_case")`. `HTTPException`을 직접 쓰지 않는다. 응답 형식 `{status, message, code}`를 바꾸지 않는다 (앱 `api/client.ts`가 읽음).
- DB 세션은 `db: Session = Depends(get_db)`. 테이블 변경은 `app/models/` 수정 후 Alembic 마이그레이션으로만.
- 설정은 `get_settings()`로만 읽는다. 주소·키·경로를 코드에 쓰지 않는다. 새 설정은 `Settings`와 `.env.example`에 같이 추가.
- 응답 필드 이름은 앱 `app/src/api/types.ts`와 맞춘다 (camelCase가 필요하면 Pydantic alias로).
- 메시지·주석은 한국어 해요체. 파일·함수 이름은 snake_case.
- `alembic.ini`는 ASCII만 (Windows cp949에서 읽기 실패).

## 작업 후 확인

```bash
cd server && ruff check . && ruff format --check . && pytest
```

- 테스트는 실제 DB 없이 돈다 (`tests/conftest.py`의 FakeSession). DB가 꼭 필요한 테스트는 따로 표시.
- 커밋: `type(server): 내용 (KAN-번호)`
