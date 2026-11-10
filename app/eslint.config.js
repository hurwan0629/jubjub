// ESLint 설정 (Expo 권장 규칙 + 팀 규칙). 규칙 설명은 CONVENTIONS.md 참고.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig, // 줄바꿈·따옴표 같은 모양 규칙은 Prettier에 맡겨요
  { ignores: ['node_modules/*', '.expo/*', 'dist/*', 'web-build/*'] },
  {
    settings: {
      // '@/theme' 같은 경로 별칭을 ESLint도 이해하도록
      'import/resolver': { typescript: true, node: true },
    },
    rules: {
      // useApi(() => ..., [deps]) 의 deps 빠짐도 useEffect처럼 검사해요
      'react-hooks/exhaustive-deps': ['warn', { additionalHooks: '(useApi)' }],
      // React Compiler 규칙: 기존 코드(경로 설정 드래그, 보고 도넛)에 걸리는 곳이 있어 우선 경고로 둬요.
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      // 경로 대소문자는 TypeScript가 검사해요 (Windows 경로에서 잘못 잡히는 것 방지)
      'import/no-unresolved': ['error', { caseSensitive: false }],
      // import 순서: 외부 라이브러리 → @/ 내부 모듈 → 상대 경로. 저장하면 자동 정렬돼요.
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      // 색은 theme 토큰만 써요
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message: '색을 직접 쓰지 말고 @/theme 의 colors 토큰을 쓰세요.',
        },
        {
          selector: 'Literal[value=/^rgba?\\(/]',
          message: '색을 직접 쓰지 말고 @/theme 의 colors 토큰을 쓰세요.',
        },
      ],
      // 글자는 타이포 토큰이 적용된 공통 Text 컴포넌트로 써요
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text'],
              message: "글자는 '@/components' 의 Text를 쓰세요 (타이포 토큰 적용).",
            },
          ],
        },
      ],
    },
  },
  {
    // 토큰을 정의하는 곳과 Text 컴포넌트 자체는 예외
    files: ['src/theme/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['src/components/Text.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
]);
