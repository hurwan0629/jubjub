# JUBJUB 관리자 앱

공원 관리자가 쓰레기 수거 로봇 한 대를 운영하는 모바일 앱이에요.
로봇 상태 대시보드, 지도·순찰 경로 편집, 알림, 일일 보고 화면이 있어요.

- 기술: Expo (SDK 58) · React Native · TypeScript
- 코드 규칙: [CONVENTIONS.md](CONVENTIONS.md) · Claude Code 규칙: [CLAUDE.md](CLAUDE.md)

## 처음 실행하기

### 1. 준비물

- [Node.js](https://nodejs.org/) **22.13 이상** (LTS 24 권장). `node -v`로 확인해요.
- [VS Code](https://code.visualstudio.com/) + 확장 **Prettier**, **ESLint** (레포를 열면 설치하라고 안내가 떠요)
- 휴대폰에서 볼 거라면 **Expo Go** 앱 (App Store / Play 스토어)

### 2. 받기와 설치

```bash
git clone <레포 주소>
cd parkkeeper-jupjup
git checkout dev
cd app
npm install
```

`npm install`이 끝나면 커밋 전 자동 검사(husky)도 함께 설치돼요.

### 3. 환경 변수 (선택)

백엔드가 아직 없어서 **아무것도 안 해도 목업 데이터로 화면이 떠요.**
서버가 생기면 `.env.example`을 `.env`로 복사하고 주소를 넣어요.

```bash
cp .env.example .env
```

### 4. 실행

```bash
npm start
```

- 휴대폰: 터미널에 뜬 QR 코드를 Expo Go(안드로이드) 또는 카메라 앱(iOS)으로 찍어요. 컴퓨터와 같은 Wi-Fi여야 해요.
- 웹 브라우저: 터미널에서 `w`를 누르거나 `npm run web`
- 처음 화면은 시작화면 → 로그인이에요. 아이디·비밀번호 아무거나 넣고 로그인하면 홈으로 가요.

### 5. VS Code에서 열기

**레포 최상위 폴더(`parkkeeper-jupjup`)를 열어요.** 저장하면 자동으로 포맷되고 import가 정렬돼요 (`.vscode/settings.json`).

## 자주 쓰는 명령

| 명령               | 하는 일                                   |
| ------------------ | ----------------------------------------- |
| `npm start`        | 개발 서버 실행 (QR 코드)                  |
| `npm run web`      | 웹 브라우저로 실행                        |
| `npm run check`    | 린트 + 타입 검사 + 포맷 검사 (PR 전에 꼭) |
| `npm run lint:fix` | 고칠 수 있는 린트 문제 자동 수정          |
| `npm run format`   | 전체 파일 포맷                            |

## 폴더 한눈에 보기

```
app/
├─ App.tsx          글꼴 불러오기, 내비게이션 시작
├─ assets/icons/    Figma에서 내려받은 SVG 아이콘
├─ src/
│  ├─ api/          서버 통신 + 목업 (mock/)
│  ├─ components/   공통 UI (Text, Button, Card, Header, StatusBadge …)
│  ├─ hooks/        데이터 훅
│  ├─ navigation/   화면 이동
│  ├─ screens/      화면
│  ├─ theme/        디자인 토큰 (Figma 변수)
│  └─ utils/        포맷 함수
├─ eslint.config.js · .prettierrc.json   코드 검사·포맷 설정
└─ .husky/pre-commit                    커밋 전 자동 검사
```

## 문제가 생기면

- **커밋이 막혀요**: husky가 린트 에러를 찾은 거예요. 터미널 메시지의 파일·줄을 고친 뒤 다시 커밋해요.
- **저장해도 포맷이 안 돼요**: VS Code에 Prettier·ESLint 확장이 설치됐는지, 레포 최상위 폴더를 열었는지 확인해요.
- **휴대폰에서 연결이 안 돼요**: 같은 Wi-Fi인지 확인하고, 안 되면 `npx expo start --tunnel`을 써요.
- **이상하게 동작해요**: `npx expo start -c`로 캐시를 지우고 다시 실행해요.
