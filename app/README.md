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

`EXPO_PUBLIC_API_URL`이 비어 있으면 목업 데이터로 화면이 떠요.
실제 로그인·공원 검색·승인 신청·순찰 저장을 사용하려면 `.env.example`을 `.env`로 복사하고 주소를 넣어요.

```bash
cp .env.example .env
```

같은 PC의 웹 브라우저는 `EXPO_PUBLIC_API_URL=http://localhost:8000`, 휴대폰은 `localhost` 대신 PC의 Wi-Fi IPv4 주소를 사용해요. 환경변수 변경 후 Expo를 재시작하세요.
웹은 네이버 지도 인증값 없이 Leaflet · OpenStreetMap 실제 지도를 사용해요. 공원 선택 시 해당 위치와 경계를 표시하며, 지도 확대·축소와 꾹 누르기(또는 마우스 오른쪽 버튼)로 지점을 설정할 수 있어요. 지도 타일을 불러오려면 인터넷 연결이 필요해요.

### 4. 실행

```bash
npm start
```

- 휴대폰: 터미널에 뜬 QR 코드를 Expo Go(안드로이드) 또는 카메라 앱(iOS)으로 찍어요. 컴퓨터와 같은 Wi-Fi여야 해요.
- 웹 브라우저: 터미널에서 `w`를 누르거나 `npm run web`
- 실제 서버: 회원가입 정보 → 공원 검색·지정 → 가입 신청 제출 → 총관리자 승인 → 로그인 → 최초 순찰 설정 5단계 → 홈 순서예요.
- 계정 정보와 담당 공원을 한 번에 제출하며 승인 전에는 로그인 토큰이 발급되지 않아요. 로그인 시 승인 대기·반려 안내를 확인할 수 있어요.
- 순찰 설정은 서버 저장에 성공한 뒤에만 완료로 표시해요. 승인된 공원 변경은 총관리자에게 요청해야 해요.
- 목업: 기존 데모 로그인은 홈으로 이동해요. 새로 가입한 계정은 담당 공원과 함께 가입 승인 대기 상태를 유지하며 자동 승인하지 않아요. 실제 승인 과정은 서버 연결 후 확인하세요.
- 홈의 로봇 현황·알림·보고는 아직 목업이에요. 총관리자 승인·로봇 배정 API 사용법은 [server/ADMIN.md](../server/ADMIN.md)를 참고하세요.

### 5. VS Code에서 열기

**레포 최상위 폴더(`parkkeeper-jupjup`)를 열어요.** 저장하면 자동으로 포맷되고 import가 정렬돼요 (`.vscode/settings.json`).

## 자주 쓰는 명령

| 명령               | 하는 일                                   |
| ------------------ | ----------------------------------------- |
| `npm start`        | 개발 서버 실행 (QR 코드)                  |
| `npm run web`      | 웹 브라우저로 실행                        |
| `npm test`         | 승인 흐름·순찰 저장 회귀 테스트           |
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
