import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { icons } from '@/icons';
import { colors, layout, radius, space } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type FilterChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  minWidth?: number;
};

/** 필터 칩 (선택하면 체크 아이콘). Figma Page 5 "필터 칩" */
export function FilterChip({ label, selected, onPress, minWidth }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[s.chip, selected ? s.chipOn : s.chipOff, minWidth ? { minWidth } : null]}
    >
      {selected ? <Icon source={icons.check} size={16} /> : null}
      <Text variant="13-semibold" color={selected ? 'card' : 'chipIdleText'}>
        {label}
      </Text>
    </Pressable>
  );
}

/** 필터 칩을 가로로 늘어놓는 흰 띠 */
export function FilterBar({ children }: { children: ReactNode }) {
  return <View style={s.bar}>{children}</View>;
}

const s = StyleSheet.create({
  bar: {
    backgroundColor: colors.card,
    paddingHorizontal: space[16],
    paddingVertical: space[12],
    flexDirection: 'row',
    gap: space[8],
  },
  chip: {
    height: layout.touchMin,
    minWidth: 78,
    paddingHorizontal: space[16],
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  // Page 5: 선택 안 된 칩은 테두리 없이 옅은 파랑으로 채워요
  chipOn: { backgroundColor: colors.brand },
  chipOff: { backgroundColor: colors.chipIdle },
});
