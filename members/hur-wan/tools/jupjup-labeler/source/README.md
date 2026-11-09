# 줍줍 라벨러 — 소스 (exe 다시 만들 때만 필요)

**쓰는 사람은 이 폴더가 필요 없어요.** 한 단계 위의 `jupjup-labeler.exe` 하나만 실행하면 됩니다.
이 폴더는 프로그램을 고친 뒤 exe 를 다시 만들 때 쓰는 원본입니다.

## exe 다시 만들기

`build.bat` 을 더블클릭하면 끝입니다.

1. 빌드용 가상환경을 `%LOCALAPPDATA%\JupJupLabeler\build-env` 에 만들고 `requirements.txt` 를 설치해요.
2. `build.py` 가 PyInstaller 로 `../jupjup-labeler.exe` 한 개를 만들어요. 1~2분 걸려요.

Python 3.10 이상이 필요합니다. 테스트할 때는 3.12 를 썼어요.

## 구조

| 파일 | 하는 일 |
|------|---------|
| `main.py` | 시작점. 작은 로컬 서버를 띄우고 WebView2 창(pywebview)을 엽니다 |
| `api.py` | 화면(JS)에서 부르는 기능: 폴더 열기, 라벨 읽기/저장, 내보내기, 설정 |
| `core.py` | 데이터 폴더 규격, YOLO·COCO 읽기/쓰기, 내보내기 (BBox Labeler 와 같은 규격) |
| `server.py` | `127.0.0.1` 전용 서버. 화면 파일, 원본 이미지, 썸네일을 제공합니다 (토큰 필요) |
| `sample.py` | '예제로 체험하기' 샘플 이미지와 AI 라벨을 만듭니다 |
| `web/` | 화면: `index.html`, `css/app.css`, `js/app.js`(편집기), `js/guide.js`(움직이는 가이드) |
| `assets/` | 아이콘(`icon.ico`), 로고 PNG, 시작 화면(`splash.png`) |

## 개발 중 바로 실행

```
python main.py
```

`requirements.txt` 를 설치한 환경에서 실행하세요.

- `JUPJUP_HOME=<폴더>`: 설정과 오류 기록 위치를 바꿔요. 기본은 `%APPDATA%\JupJupLabeler`.
- `JUPJUP_DEBUG=1`: WebView2 개발자 도구를 켜요.

## 참고

- 글꼴: Pretendard (SIL Open Font License, `web/fonts/OFL.txt`)
- 실행에는 Microsoft Edge WebView2 런타임이 필요해요. Windows 11 에는 기본으로 있고, 없으면 프로그램이 설치 페이지를 안내해요.
- 작업 상태 파일(`<데이터 폴더>/.bbox_labeler/state.json`)은 이전 버전 BBox Labeler 와 같아서, 두 프로그램을 번갈아 써도 확인(✔) 기록이 이어져요.
