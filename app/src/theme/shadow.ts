import { colors } from './colors';

// 그림자 토큰. iOS·웹은 shadow*, 안드로이드는 elevation으로 그려져요.

/** JUBJUB/부드러운 그림자 1: 0 · 4 · 16, #243D7E 3% (카드) */
export const softShadow = {
  shadowColor: colors.shadow,
  shadowOpacity: 0.03,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 4 },
  elevation: 1,
} as const;

/** 끌어서 옮기는 중인 항목처럼 떠 있는 요소 */
export const liftedShadow = {
  shadowColor: colors.shadow,
  shadowOpacity: 0.12,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
} as const;

export const shadows = { soft: softShadow, lifted: liftedShadow } as const;
