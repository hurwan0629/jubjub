import type { ImageSource } from 'expo-image';
import { Pressable, StyleSheet } from 'react-native';

import { colors, space } from '@/theme';
import type { ColorName } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type Variant = 'primary' | 'soft' | 'danger';

type ButtonProps = {
  label: string;
  /**
   * primary: 화면에서 가장 중요한 행동 (한 영역에 하나)
   * soft: 부담 없이 살펴보는 보조 행동
   * danger: 멈추거나 되돌리기 어려운 행동
   */
  variant?: Variant;
  icon?: ImageSource;
  disabled?: boolean;
  onPress?: () => void;
};

const VARIANT: Record<Variant, { bg: ColorName; fg: ColorName }> = {
  primary: { bg: 'brand', fg: 'card' },
  soft: { bg: 'bgBrandSoft', fg: 'brandText' },
  danger: { bg: 'error', fg: 'card' },
};

/** 버튼 (Figma 구성표/06: 높이 52 · 모서리 14 · 아이콘 간격 8) */
export function Button({ label, variant = 'primary', icon, disabled, onPress }: ButtonProps) {
  const v = disabled ? ({ bg: 'bgDisabled', fg: 'textDisabled' } as const) : VARIANT[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [s.button, { backgroundColor: colors[v.bg], opacity: pressed ? 0.85 : 1 }]}
    >
      {icon ? <Icon source={icon} size={19} /> : null}
      <Text variant="15-bold" color={v.fg}>
        {label}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: 14, // Figma 버튼 모서리 14 (카드보다 작아요)
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[8],
  },
});
