# JUBJUB 총관리자 웹

`app/`의 모바일 화면과 독립된 React · TypeScript · Vite 프로젝트예요. 같은 `server/` API와 DB를 사용해요.

## 실행

Node.js 22.13 이상이 필요해요. PowerShell에서 실행하세요.

```powershell
cd C:\wooki\jubjub\web
npm.cmd install
npm.cmd run dev
```

접속 주소: **http://localhost:5173**

다른 터미널에서 공통 API 서버를 실행해야 해요.

```powershell
cd C:\wooki\jubjub\server
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0
```

개발 중 `/api` 요청은 Vite가 `http://127.0.0.1:8000`으로 전달해요. 서버 포트가 달라지면 `vite.config.ts`의 proxy target을 수정하세요.
다른 API 도메인을 사용하려면 `.env.example`을 `.env`로 복사하고 `VITE_API_URL`을 설정한 후 웹을 다시 실행하세요. 이 값은 브라우저에 공개되는 주소이므로 비밀 키를 넣지 마세요.

## 계정과 기능

- 서버에 등록된 `super_admin` 계정만 로그인할 수 있어요. 공개 회원가입은 제공하지 않아요.
- 하위관리자 계정으로 로그인하면 모바일 앱 이용을 안내해요.
- 총관리자가 모바일 앱에서 로그인하면 “총관리자는 웹페이지에서 로그인해 주세요”를 표시하며 앱 세션에 토큰을 저장하지 않아요.
- 관리자 목록, 전체/승인 대기/승인 완료/반려 필터, 로봇 선택 후 승인, 사유 입력 후 반려·승인 취소를 제공해요.
- 앱과 웹은 독립된 메모리 토큰을 사용해요. 새로고침하면 다시 로그인해야 해요. 쿠키·자동 갱신은 이번 구현 범위에 포함하지 않아요.
- 홈 대시보드, 공원별 보고 및 독립 로봇 관리 화면은 후속 구현 범위예요.

총관리자 계정 생성과 서버 API는 [server/ADMIN.md](../server/ADMIN.md)를 참고하세요.

## 검증·빌드

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
```

빌드 결과는 `web/dist/`에 생성돼요. 실제 배포에서는 HTTPS와 `/api` → 공통 서버의 리버스 프록시를 구성하거나 `VITE_API_URL`을 지정해야 해요. Vite 개발 프록시는 빌드 결과에 포함되지 않아요.

앱·웹의 실제 API 모듈을 함께 사용하는 HTTP 통합 검증:

```powershell
cd ..\server
.\.venv\Scripts\python.exe -m pytest -q tests/registration_approval_test.py -k app_and_web -s -p no:cacheprovider
```

임시 HTTP 서버와 격리 DB를 사용하며 공유 Supabase 데이터는 변경하지 않아요. 테스트 스크립트의 app/ 참조는 통합 검증용이고 웹 실행·빌드는 app/를 참조하지 않아요.
