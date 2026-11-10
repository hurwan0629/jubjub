import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { icons } from '@/icons';
import { colors, layout, radius, space } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type HeaderProps = {
  title: string;
  /** 있으면 왼쪽에 뒤로 가기 버튼을 보여 줘요 */
  onBack?: () => void;
  /** 오른쪽 자리 (설정 버튼 등). 없으면 비워서 제목을 가운데에 둬요 */
  right?: ReactNode;
};

/** 화면 헤더 (Figma "화면 헤더"): 뒤로 가기 · 가운데 제목 · 오른쪽 행동 */
export function Header({ title, onBack, right }: HeaderProps) {
  return (
    <View style={s.bar}>
      {onBack ? (
        <Pressable style={s.side} onPress={onBack} accessibilityRole="button" accessibilityLabel="뒤로 가기">
          <Icon source={icons.chevronLeft} size={22} />
        </Pressable>
      ) : (
        <View style={s.side} />
      )}
      <Text variant="17-bold" style={s.title} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      <View style={s.side}>{right}</View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    height: 64,
    backgroundColor: colors.card,
    borderRadius: radius[16],
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[8],
    gap: space[8],
  },
  title: { flex: 1, textAlign: 'center' },
  side: { width: layout.touchMin, height: layout.touchMin, alignItems: 'center', justifyContent: 'center' },
});
