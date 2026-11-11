import { Platform } from 'react-native';

// 글꼴: 영문은 Inter, 한글은 Noto Sans KR.
// 웹은 CSS 폰트 대체 목록을 쓸 수 있지만, 네이티브는 한 가족만 지정할 수 있어서 한글 굵기가 맞도록 Noto Sans KR을 써요.
const pair = (inter: string, noto: string) => (Platform.OS === 'web' ? `${inter}, ${noto}` : noto);

export const font = {
  regular: pair('Inter_400Regular', 'NotoSansKR_400Regular'), // Figma "기본"
  medium: pair('Inter_500Medium', 'NotoSansKR_500Medium'), // Figma "중간"
  semibold: pair('Inter_600SemiBold', 'NotoSansKR_600SemiBold'), // Figma "강조"
  bold: pair('Inter_700Bold', 'NotoSansKR_700Bold'), // Figma "굵게"
  brand: 'Fredoka_700Bold', // JUBJUB 워드마크
  // 숫자만 쓰는 자리(번호 원, 배지). 폰에서 한글 글꼴(Noto Sans KR)은 위아래 여백이 커서
  // 작은 원 안의 숫자가 아래로 밀려요. 숫자는 Figma처럼 Inter로 써서 가운데에 오게 해요.
  digitsRegular: 'Inter_400Regular',
  digitsBold: 'Inter_700Bold',
} as const;

export type FontWeight = keyof typeof font;

/** 줄 높이 배수. Figma에서 줄 높이가 지정된 글(여러 줄 본문)에만 써요. */
export const lineHeights = {
  tight: 1.2, // 큰 제목 (JUBJUB/25 · 굵게)
  normal: 1.4, // 알림 본문 (JUBJUB/11 · 기본)
  relaxed: 1.5, // 안내 문장 (JUBJUB/13 · 기본)
  loose: 1.6, // 긴 설명 (JUBJUB/12 · 기본)
} as const;

export type LineHeight = keyof typeof lineHeights;

const style = (fontSize: number, weight: FontWeight, extra?: { letterSpacing?: number; lineHeight?: LineHeight }) => ({
  fontSize,
  fontFamily: font[weight],
  ...(extra?.letterSpacing !== undefined ? { letterSpacing: extra.letterSpacing } : null),
  ...(extra?.lineHeight ? { lineHeight: Math.round(fontSize * lineHeights[extra.lineHeight]) } : null),
});

/**
 * 타이포 토큰. 이름은 Figma 텍스트 변수 "JUBJUB/<크기> · <굵기>"와 같아요.
 *   기본 → regular, 중간 → medium, 강조 → semibold, 굵게 → bold
 * 예) Figma "JUBJUB/13 · 굵게" → <Text variant="13-bold">
 * 없는 조합이 필요하면 디자이너와 확인한 뒤 여기에 추가해요.
 */
export const typography = {
  '10-regular': style(10, 'regular'),
  '10-semibold': style(10, 'semibold'),
  '10-bold': style(10, 'bold'),
  '11-regular': style(11, 'regular'),
  '11-medium': style(11, 'medium'),
  '11-semibold': style(11, 'semibold'),
  '11-bold': style(11, 'bold'),
  '12-regular': style(12, 'regular'),
  '12-semibold': style(12, 'semibold'),
  '12-bold': style(12, 'bold'),
  '13-regular': style(13, 'regular'),
  '13-medium': style(13, 'medium'),
  '13-semibold': style(13, 'semibold'),
  '13-bold': style(13, 'bold'),
  '14-regular': style(14, 'regular'),
  '14-semibold': style(14, 'semibold'),
  '14-bold': style(14, 'bold'),
  '15-bold': style(15, 'bold'),
  '16-bold': style(16, 'bold'),
  '17-bold': style(17, 'bold'),
  '18-bold': style(18, 'bold'),
  '20-bold': style(20, 'bold'), // 지점 이름 입력 (C-03 · A-04)
  '22-bold': style(22, 'bold'),
  '24-bold': style(24, 'bold'),
  '25-bold': style(25, 'bold', { letterSpacing: -0.7, lineHeight: 'tight' }),
  '30-bold': style(30, 'bold'),
  logo: style(22, 'brand', { letterSpacing: 0.88 }),
  // 숫자 전용 (번호 원 · 지도 마커). 한글을 넣지 마세요.
  '13-regular-digits': style(13, 'digitsRegular'),
  '14-bold-digits': style(14, 'digitsBold'),
} as const;

export type TextVariant = keyof typeof typography;
