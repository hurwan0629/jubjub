import { StyleSheet, View } from 'react-native';

import { colors, radius, space } from '@/theme';

import { Text } from './Text';

type StatRowProps = {
  items: { label: string; value: string }[];
  /** 보고 화면처럼 좌우 여백을 좁게 */
  compact?: boolean;
};

/** 요약 수치 한 줄 (홈 오늘 요약, 보고 운영 통계) */
export function StatRow({ items, compact }: StatRowProps) {
  return (
    <View style={[s.row, compact ? s.compact : s.regular]}>
      {items.map((it) => (
        <View key={it.label} style={s.item}>
          <Text variant="12-regular" color="textSub">
            {it.label}
          </Text>
          <Text variant="22-bold" color="brandText">
            {it.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { backgroundColor: colors.card, borderRadius: radius[20], flexDirection: 'row', gap: space[8] },
  regular: { paddingHorizontal: space[12], paddingVertical: space[20] },
  compact: { paddingHorizontal: space[8], paddingVertical: 18 },
  item: { flex: 1, alignItems: 'center', gap: space[8] },
});
