import { Platform } from 'react-native';

// Figma "JUBJUB" 디자인 변수
export const colors = {
  text: '#222e45', // 글자/기본
  textSub: '#748198', // 글자/보조
  textDone: '#208260', // 글자/완료
  textWarn: '#856019', // 글자/주의
  textDisabled: '#8390a3', // 글자/비활성
  bgDone: '#e9f8f1', // 배경/완료
  bgDisabled: '#e8ecf2', // 버튼 유형=비활성 · 표면/막대
  kakao: '#fee500', // 카카오 브랜드 가이드
  kakaoText: '#191919',
  brand: '#748bff', // 브랜드/기본
  brandText: '#5268d4', // 브랜드/강조 글자
  brandDeep: '#3f4fa8', // 워드마크
  bg: '#f3f6fb', // 배경/기본
  bgBrandSoft: '#eef1ff', // 배경/브랜드 옅게
  bgSelected: '#dde3ff', // 배경/선택
  bgError: '#fff0f2', // 배경/오류
  bgPhoto: '#edf1f7', // 배경/사진
  card: '#ffffff', // 표면/카드
  border: '#e5eaf3', // 테두리/기본
  error: '#ef6472', // 상태/오류
  warn: '#ffc94a', // 상태/주의
  done: '#36b88b', // 상태/완료
  map: '#e3eddf',
  data: {
    pet: '#5268d4',
    can: '#a3b0ff',
    paper: '#c1caff',
    general: '#8390a3',
  },
} as const;

export const space = { 4: 4, 8: 8, 12: 12, 16: 16, 20: 20 } as const;
export const radius = { 16: 16, 20: 20, pill: 100 } as const;

// 영문은 Inter, 한글은 Noto Sans KR.
// 웹은 CSS 폰트 대체 목록을 쓸 수 있지만, 네이티브는 한 가족만 지정할 수 있어서 한글 굵기가 맞도록 Noto Sans KR을 써요.
const pair = (inter: string, noto: string) => (Platform.OS === 'web' ? `${inter}, ${noto}` : noto);

export const font = {
  regular: pair('Inter_400Regular', 'NotoSansKR_400Regular'),
  medium: pair('Inter_500Medium', 'NotoSansKR_500Medium'),
  semibold: pair('Inter_600SemiBold', 'NotoSansKR_600SemiBold'),
  bold: pair('Inter_700Bold', 'NotoSansKR_700Bold'),
  brand: 'Fredoka_700Bold',
} as const;

// JUBJUB/부드러운 그림자 1
export const softShadow = {
  shadowColor: '#243d7e',
  shadowOpacity: 0.03,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 4 },
  elevation: 1,
} as const;
