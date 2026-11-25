import { Platform, Text as RNText } from 'react-native';
import type { TextProps as RNTextProps } from 'react-native';

import { colors, lineHeights, typography } from '@/theme';
import type { ColorName, LineHeight, TextVariant } from '@/theme';

export type TextProps = RNTextProps & {
  /** Figma 텍스트 변수 이름. 예) "JUBJUB/13 · 굵게" → '13-bold' */
  variant?: TextVariant;
  /** 색 토큰 이름. 예) 'textSub', 'brandText' */
  color?: ColorName;
  /** 여러 줄 본문일 때만 지정해요 (Figma에서 줄 높이가 있는 글) */
  lineHeight?: LineHeight;
};

// 안드로이드는 글자 위아래에 글꼴 여백을 더 넣어서, 한글 글꼴(Noto Sans KR)에서는 줄 사이가 벌어지고
// 칸 안에서 글자가 아래로 치우쳐 보여요. 그 여백을 빼서 Figma처럼 가운데에 모이게 해요.
const ANDROID_TIGHT =
  Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' as const } : null;

/**
 * 모든 글자는 이 컴포넌트로 써요. (react-native의 Text를 직접 쓰면 ESLint가 막아요)
 *
 * @example
 * <Text variant="18-bold">Jubi가 순찰 중이에요</Text>
 * <Text variant="12-regular" color="textSub" lineHeight="loose">설명</Text>
 */
export function Text({ variant = '14-regular', color = 'text', lineHeight, style, ...rest }: TextProps) {
  const base = typography[variant];
  return (
    <RNText
      {...rest}
      style={[
        base,
        ANDROID_TIGHT,
        { color: colors[color] },
        lineHeight ? { lineHeight: Math.round(base.fontSize * lineHeights[lineHeight]) } : null,
        style,
      ]}
    />
  );
}
