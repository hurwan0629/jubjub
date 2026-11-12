# JUBJUB 앱 (Expo · React Native · TypeScript)

공원 쓰레기 수거 로봇 관리자 앱. 자세한 규칙은 [CONVENTIONS.md](CONVENTIONS.md), 예시 화면은 `src/screens/HomeScreen.tsx`.

## 반드시 지킬 규칙

- 색은 `@/theme`의 `colors` 토큰만 쓴다. `'#…'`, `'rgba(…)'` 금지 (ESLint 에러).
- 글자는 `@/components`의 `Text`만 쓴다: `<Text variant="13-bold" color="textSub">`. variant 이름 = Figma "JUBJUB/13 · 굵게". react-native `Text` import 금지.
- 간격·둥글기·그림자는 `space[N]`, `radius[N]`, `softShadow`. 토큰에 없는 고정 크기(아이콘, 높이)만 숫자 허용.
- `Txt`는 deprecated. 새 코드에 쓰지 말고, 건드린 화면의 `Txt`는 `Text`로 바꾼다.
- 서버 데이터: `api/types.ts` 타입 → `api/mock/` 목업 → `api/<자원>.ts` 함수(`USE_MOCK` 분기) → `hooks/` 훅. 화면은 훅으로만 조회한다.
- 공통 UI는 `src/components/`에 만들고 `components/index.ts`에서 export. 한 화면 전용 부품은 화면 폴더 안에.
- import는 `@/` 경로 별칭 사용. named export만 (`export default` 금지). 스타일은 파일 맨 아래 `const s = StyleSheet.create`.
- 파일 이름: 컴포넌트·화면 PascalCase.tsx, 훅 useX.ts, 그 외 camelCase.ts, 폴더 kebab-case.
- 화면 글자·주석은 한국어, 부드러운 해요체("~했어요"). 화면 파일 맨 위 주석에 화면 ID(A-01 등).

## 작업 후 확인

- `cd app && npm run check` (eslint + tsc + prettier) 가 통과해야 한다.
- 커밋: `type(app): 내용 (KAN-번호)` — type은 feat/fix/refactor/style/docs/chore. PR은 `dev`로.

## 참고 문서

- 화면 동작·예외: Confluence "화면설계서 v2.3"
- API 경로·데이터: Confluence "시스템 아키텍처 설계서" 8·9장 (API 명세서 KAN-23 나오면 그쪽 우선)
- 디자인: Figma `8jxiaGJ8smbceYuXug5roD` (Page 2 화면 시안, Page 1 디자인 시스템)
