// 모서리 둥글기 토큰 (Figma "모서리/N"). 카드는 16~20.
export const radius = {
  16: 16,
  20: 20,
  pill: 100, // 칩·배지처럼 양 끝이 둥근 모양
} as const;

export type Radius = keyof typeof radius;
