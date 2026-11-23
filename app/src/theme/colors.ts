// 색상 토큰. Figma "JUBJUB" 디자인 변수와 1:1로 맞춰요 (주석 = Figma 변수 이름).
// 화면 코드에서는 '#...' 같은 색을 직접 쓰지 말고 항상 여기 있는 이름을 써요. (ESLint가 막아요)
export const colors = {
  // 글자
  text: '#222e45', // 글자/기본
  textSub: '#748198', // 글자/보조
  textDone: '#208260', // 글자/완료
  textWarn: '#856019', // 글자/주의
  textDisabled: '#8390a3', // 글자/비활성

  // 브랜드
  brand: '#748bff', // 브랜드/기본 (메인 블루: 주요 버튼·선택·로봇 위치)
  brandText: '#5268d4', // 브랜드/강조 글자 (작은 글씨용 진한 블루)
  brandDeep: '#3f4fa8', // 워드마크

  // 배경·표면
  bg: '#f3f6fb', // 배경/기본
  bgBrandSoft: '#eef1ff', // 배경/브랜드 옅게
  bgSelected: '#dde3ff', // 배경/선택
  bgDone: '#e9f8f1', // 배경/완료
  bgWarn: '#fff7df', // 배경/주의
  bgError: '#fff0f2', // 배경/오류
  bgDisabled: '#e8ecf2', // 버튼 유형=비활성 · 표면/막대
  bgPhoto: '#edf1f7', // 배경/사진
  card: '#ffffff', // 표면/카드
  border: '#e5eaf3', // 테두리/기본
  map: '#e3eddf', // 지도 바탕
  parkArea: 'rgba(116, 139, 255, 0.12)', // 지도 위 공원 경계 안쪽 (브랜드/기본 12%)

  // 상태 (색만으로 구분하지 않고 아이콘·문구를 함께 써요)
  done: '#36b88b', // 상태/완료 (완료 그린)
  warn: '#ffc94a', // 상태/주의 (주의 옐로: 적재율 80% 이상 등)
  error: '#ef6472', // 상태/오류 (오류 레드)

  // 외부 브랜드
  kakao: '#fee500', // 카카오 브랜드 가이드
  kakaoText: '#191919',

  // 그림자 색 (JUBJUB/부드러운 그림자)
  shadow: '#243d7e',

  // 모달·바텀시트 뒤를 어둡게 덮는 막 (글자/기본 색 + 투명도)
  overlay: 'rgba(34, 46, 69, 0.45)', // 가운데 모달
  overlaySoft: 'rgba(34, 46, 69, 0.3)', // 바텀시트

  // 차트: 재질별 수거량
  data: {
    pet: '#5268d4',
    can: '#a3b0ff',
    paper: '#c1caff',
    general: '#8390a3',
  },
} as const;

/** 단색 토큰 이름 ('data' 묶음 제외). 컴포넌트의 color prop 타입으로 써요. */
export type ColorName = Exclude<keyof typeof colors, 'data'>;

/**
 * 상태 톤: 배지·알림 아이콘 원처럼 "옅은 배경 + 진한 글자" 짝.
 * 새 상태 색이 필요하면 화면에서 만들지 말고 여기에 추가해요.
 */
export const tones = {
  brand: { fg: 'brandText', bg: 'bgBrandSoft' },
  done: { fg: 'textDone', bg: 'bgDone' },
  warn: { fg: 'textWarn', bg: 'bgWarn' },
  error: { fg: 'error', bg: 'bgError' },
  neutral: { fg: 'textSub', bg: 'bgPhoto' },
} as const satisfies Record<string, { fg: ColorName; bg: ColorName }>;

export type Tone = keyof typeof tones;
