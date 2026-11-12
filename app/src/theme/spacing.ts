// 간격 토큰 (Figma "간격/N"). 4의 배수로 여유 있게 써요.
// 키 = Figma 값(px)이라 Figma에서 12를 보면 space[12]를 쓰면 돼요.
//   아이콘과 글 사이 8 · 카드 안쪽 16~20 · 영역 사이 24 · 화면 여백 24
export const space = {
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  20: 20,
  24: 24,
  32: 32,
} as const;

export type Space = keyof typeof space;

/** 자주 쓰는 레이아웃 값 */
export const layout = {
  screenPadding: space[24], // 화면 좌우 여백
  touchMin: 44, // 터치 영역 최소 44 × 44
} as const;
