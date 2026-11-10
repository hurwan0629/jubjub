import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radius, softShadow, space } from '@/theme';

type CardProps = {
  children: ReactNode;
  /** 누를 수 있는 카드면 넘겨요 */
  onPress?: () => void;
  /** 부드러운 그림자 (기본 꺼짐) */
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** 흰 카드 (Figma 표면/카드 · 모서리 20 · 안쪽 여백 16) */
export function Card({ children, onPress, shadow, style }: CardProps) {
  const cardStyle = [s.card, shadow ? softShadow : null, style];
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={cardStyle}>
        {children}
      </Pressable>
    );
  }
  return <View style={cardStyle}>{children}</View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius[20], padding: space[16], overflow: 'hidden' },
});
