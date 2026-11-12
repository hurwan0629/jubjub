import type { StyleProp, TextProps, TextStyle } from 'react-native';

import { colors, font } from '@/theme';
import type { FontWeight } from '@/theme';

import { Text } from './Text';

/**
 * @deprecated 숫자 크기를 직접 받는 예전 글자 컴포넌트예요. 새 코드는 `Text`(variant 토큰)를 쓰세요.
 * 기존 화면을 고칠 때 Txt → Text로 하나씩 바꿔 주세요.
 *   <Txt size={13} weight="bold" color={colors.textSub}>  →  <Text variant="13-bold" color="textSub">
 */
export function Txt({
  size = 14,
  weight = 'regular',
  color = colors.text,
  lineHeight,
  style,
  ...rest
}: TextProps & {
  size?: number;
  weight?: FontWeight;
  color?: string;
  lineHeight?: number;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      {...rest}
      style={[
        { fontSize: size, fontFamily: font[weight], color },
        lineHeight ? { lineHeight: size * lineHeight } : null,
        style,
      ]}
    />
  );
}
