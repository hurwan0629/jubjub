import { Text as RNText } from 'react-native';
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
        { color: colors[color] },
        lineHeight ? { lineHeight: Math.round(base.fontSize * lineHeights[lineHeight]) } : null,
        style,
      ]}
    />
  );
}
