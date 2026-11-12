# JUBJUB 앱 코드 규칙

팀원 모두가 같은 모양으로 코드를 쓰기 위한 규칙이에요. 처음이라면 **1, 2, 4장**만 먼저 읽어도 돼요.
자동으로 지켜지는 규칙(포맷, import 순서, 색·글자 토큰)은 저장하거나 커밋할 때 도구가 잡아 줘요.

- 기획 문서: Confluence **화면설계서 v2.3**, **요구사항 정의서 v0.4**, **시스템 아키텍처 설계서**
- 디자인: [Figma JUBJUB](https://www.figma.com/design/8jxiaGJ8smbceYuXug5roD/Untitled) (Page 2 = 화면 시안, Page 1 = 디자인 시스템 구성표)
- 이슈: Jira `KAN` 프로젝트

---

## 1. 꼭 지킬 세 가지

1. **색·글자·간격은 토큰만 써요.** `'#748bff'`, `fontSize: 13` 대신 `colors.brand`, `<Text variant="13-bold">`, `space[12]`.
2. **글자는 `@/components`의 `Text`로 써요.** react-native의 `Text`를 직접 import하면 ESLint 에러가 나요.
3. **화면은 api를 직접 부르지 않고 훅(`@/hooks`)으로 데이터를 받아요.** 백엔드가 없어도 목업으로 화면이 떠요.

## 2. 폴더 구조

```
app/src/
├─ api/          서버 통신. 화면 단위가 아니라 "자원" 단위 파일 (robot, notifications, decisions, reports, auth)
│  ├─ client.ts    공통 fetch, 목업 스위치(USE_MOCK)
│  ├─ types.ts     서버 데이터 타입 (화면은 이 타입만 보고 만들어요)
│  └─ mock/        목업 데이터
├─ components/   여러 화면에서 쓰는 공통 UI (index.ts에서 모두 내보내요)
├─ hooks/        데이터 훅 (useRobotStatus, useNotifications …) + 공통 useApi
├─ navigation/   화면 이동 (스택 · 하단 탭), 화면 파라미터 타입
├─ screens/      화면. 화면이 커지면 기능 폴더로 묶어요 (예: route-setup/)
├─ theme/        디자인 토큰 (colors, typography, spacing, radius, shadow)
├─ utils/        순수 함수 (날짜 포맷, 코드→한국어 이름)
└─ icons.ts      SVG 아이콘 목록 (assets/icons)
```

**어디에 둘까?**

| 만들려는 것                | 위치                                                          |
| -------------------------- | ------------------------------------------------------------- |
| 두 화면 이상에서 쓰는 UI   | `components/` (+ `components/index.ts`에 export 추가)         |
| 한 화면에서만 쓰는 부품    | 그 화면 파일 안, 또는 `screens/<기능>/parts.tsx`              |
| 서버에서 받는 데이터       | `api/<자원>.ts` + `api/mock/<자원>.ts` + `hooks/use<자원>.ts` |
| 화면에 안 그리는 계산·변환 | `utils/`                                                      |
| 새 색·글자 스타일          | `theme/` (디자이너와 Figma 변수 확인 후)                      |

경로는 `@/`로 시작해요: `import { colors } from '@/theme';` (`../../theme` 대신)

## 3. 이름 규칙

| 대상               | 규칙                                                   | 예                                  |
| ------------------ | ------------------------------------------------------ | ----------------------------------- |
| 폴더               | kebab-case                                             | `route-setup/`                      |
| 컴포넌트·화면 파일 | PascalCase.tsx, 화면은 `…Screen`                       | `StatusBadge.tsx`, `HomeScreen.tsx` |
| 훅 파일            | `use…`.ts                                              | `useNotifications.ts`               |
| 그 밖의 ts 파일    | camelCase                                              | `client.ts`, `labels.ts`            |
| 컴포넌트·타입      | PascalCase                                             | `AlertCard`, `RobotStatus`          |
| 함수·변수          | camelCase                                              | `getRobotStatus`, `unreadCount`     |
| 고정 표·상수       | UPPER_SNAKE_CASE                                       | `SLOT_LABEL`, `ROBOT_STATE`         |
| boolean            | `is/has/can…` 또는 형용사                              | `isLoading`, `unread`, `disabled`   |
| 이벤트             | prop은 `on…`, 내부 함수는 `handle…`                    | `onPress`, `handleSave`             |
| 서버 코드값        | 영어 camelCase, 화면 글자는 `utils/labels.ts`에서 변환 | `'robotError'` → `'로봇 오류'`      |

화면 ID(C-01, A-04 …)는 화면 파일 맨 위 주석에 적어 화면설계서와 연결해요.

## 4. 스타일과 디자인 토큰

스타일은 **React Native `StyleSheet` + `@/theme` 토큰**으로 써요. 파일 맨 아래에 `const s = StyleSheet.create({...})`.

| Figma에서 보이는 것                | 코드                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| 색 변수 `브랜드/기본`              | `colors.brand` (이름 대응은 `theme/colors.ts` 주석)                              |
| 텍스트 변수 `JUBJUB/13 · 굵게`     | `<Text variant="13-bold">` (기본→regular, 중간→medium, 강조→semibold, 굵게→bold) |
| 줄 높이 140% / 150% / 160%         | `<Text lineHeight="normal" / "relaxed" / "loose">`                               |
| 간격 변수 `간격/12`                | `space[12]`                                                                      |
| 모서리 변수 `모서리/20`            | `radius[20]`                                                                     |
| 효과 `JUBJUB/부드러운 그림자 1`    | `...softShadow`                                                                  |
| 상태 색 짝 (옅은 배경 + 진한 글자) | `tones.done` → `{ fg: 'textDone', bg: 'bgDone' }`                                |

- 색은 `colors`만 써요. `'#…'`, `'rgba(…)'`는 ESLint 에러예요. 필요한 색이 없으면 `theme/colors.ts`에 Figma 변수 이름과 함께 추가해요.
- `Text`의 `color`는 토큰 이름으로 받아요: `<Text color="textSub">`.
- 숫자를 그대로 써도 되는 곳: 아이콘 크기, 버튼·카드 높이 같은 **고정 크기**, Figma에 토큰이 없는 값(예: 버튼 모서리 14). 간격·둥글기·색·글자 크기는 토큰을 먼저 찾아봐요.
- 터치 영역은 최소 44 × 44 (`layout.touchMin`), 화면 좌우 여백은 24 (`layout.screenPadding`).
- 상태는 색만으로 구분하지 않고 글자·아이콘을 함께 써요 (Figma 디자인 원칙).

## 5. 컴포넌트 작성법

```tsx
// components/StatusBadge.tsx
import { StyleSheet, View } from 'react-native';

import { colors, radius, space, tones } from '@/theme';
import type { Tone } from '@/theme';

import { Text } from './Text';

// ① props 타입은 컴포넌트 바로 위에
type BadgeProps = { label: string; tone?: Tone };

// ② 한 줄 설명(JSDoc) ③ 이름 있는 function + named export
/** 작은 배지. 색만으로 상태를 구분하지 않도록 항상 글자를 함께 써요. */
export function Badge({ label, tone = 'brand' }: BadgeProps) {
  const t = tones[tone];
  return (
    <View style={[s.badge, { backgroundColor: colors[t.bg] }]}>
      <Text variant="10-semibold" color={t.fg}>
        {label}
      </Text>
    </View>
  );
}

// ④ 스타일은 파일 맨 아래, 이름은 s
const s = StyleSheet.create({
  badge: { borderRadius: radius.pill, paddingHorizontal: space[8], paddingVertical: 3 },
});
```

- `export default` 대신 **named export**를 써요 (이름이 어디서나 같아져요).
- 공통 컴포넌트에는 화면 고유 글자나 데이터를 넣지 않고 props로 받아요.
- 누를 수 있는 요소는 `Pressable` + `accessibilityRole` (+ 아이콘만 있으면 `accessibilityLabel`).
- 공통 컴포넌트 목록: `Text`, `Button`, `Card`, `Header`, `StatusBadge`/`Badge`, `SectionHeader`, `AlertCard`, `FilterChip`/`FilterBar`, `StatRow`, `Icon`, `TextField`/`Checkbox`/`LinkRow`, `TabBar`
  - `Txt`는 예전 컴포넌트예요(@deprecated). 새 코드에서는 `Text`를 쓰고, 기존 화면을 고칠 때 바꿔 주세요.

## 6. 데이터 (api → hooks → screens)

```
screens/HomeScreen.tsx   const { data: robot } = useRobotStatus();
        ↓
hooks/useRobot.ts        useApi(() => getRobotStatus(), [], { refreshMs: 5000 })
        ↓
api/robot.ts             USE_MOCK ? mockResponse(mockRobot) : request('/robot/status')
```

- `app/.env`의 `EXPO_PUBLIC_API_URL`이 비어 있으면 목업, 주소가 있으면 실제 서버를 불러요.
- **새 API 추가 순서**: ① `api/types.ts`에 타입 → ② `api/mock/`에 목업 데이터 → ③ `api/<자원>.ts`에 함수 (주석에 `METHOD /경로`) → ④ `hooks/`에 훅.
- 버튼을 눌러 서버에 무언가를 시키는 동작(확인, 로봇 보내기)은 화면에서 api 함수를 바로 불러도 돼요. 그 뒤 `reload()`로 목록을 다시 불러와요.
- 경로·필드 이름은 시스템 아키텍처 설계서 8·9장 초안 기준이에요. API 명세서(KAN-23)가 나오면 `types.ts`와 `api/`만 고치면 돼요.

## 7. import 순서 (저장하면 자동 정렬)

```tsx
import { useState } from 'react'; // 1. 외부 라이브러리
import { View } from 'react-native';

import { Card, Text } from '@/components'; // 2. @/ 내부 모듈
import { colors } from '@/theme';

import { Footer } from './parts'; // 3. 같은 폴더·상대 경로
```

그룹 사이에 빈 줄 하나, 그룹 안은 알파벳순이에요. 직접 맞출 필요 없이 저장(또는 `npm run lint:fix`)하면 돼요.

## 8. 브랜치 · 커밋 · PR

루트 [README](../README.md)의 팀 규칙을 따르고, Jira 이슈 키(`KAN-번호`)를 붙여요.

- **브랜치**: `dev`에서 따요. `feature/app-<내용>` (예: `feature/app-alert-detail`)
- **커밋 메시지**: `type(app): 내용 (KAN-번호)`
  - type: `feat` 기능 · `fix` 버그 · `refactor` 구조 개선 · `style` 화면 모양만 · `docs` 문서 · `chore` 설정
  - 예) `feat(app): 알림 상세 화면 추가 (KAN-31)`
  - 이슈가 없는 작은 작업이면 키는 빼도 돼요.
- **PR**: `dev`로 올리고, 제목에 이슈 키를 넣어요 (예: `[KAN-31] 알림 상세 화면`). 화면을 바꿨으면 스크린샷을 붙여요.

## 9. PR 올리기 전 체크리스트

- [ ] `npm run check` 통과 (린트 · 타입 · 포맷)
- [ ] 폰(Expo Go) 또는 웹에서 바꾼 화면을 직접 열어 봤다
- [ ] 색·글자·간격에 토큰을 썼다 (`#`색, `fontSize` 숫자 없음)
- [ ] 새 공통 컴포넌트는 `components/index.ts`에 export했다
- [ ] 서버 데이터는 `api/` + 목업 + 훅으로 받았다 (화면에 데이터 하드코딩 없음)
- [ ] 바꾼 기존 화면의 `Txt`는 `Text`로 바꿨다
- [ ] 커밋 메시지·PR 제목에 Jira 키를 넣었다
- [ ] 화면을 바꿨다면 PR에 스크린샷을 붙였다

## 10. 알아 두면 좋은 것

- 커밋하면 husky가 바뀐 파일만 `eslint --fix` + `prettier`로 고쳐요. 에러가 남으면 커밋이 멈추니 메시지를 보고 고쳐요.
- 지금 남아 있는 ESLint 경고 4개(`route-setup/parts.tsx`, `ReportScreen.tsx`)는 React Compiler 규칙 경고예요. 해당 화면을 손볼 때 같이 정리해요.
- 기존 화면(지도, 보고, 로그인, 경로 설정)은 아직 `Txt`와 숫자 스타일이 남아 있어요. 그 화면 담당자가 작업할 때 `HomeScreen.tsx`를 참고해 하나씩 옮겨요.
