import { Pressable, StyleSheet } from 'react-native';

import { Text } from './Text';

type SectionHeaderProps = {
  title: string;
  /** 오른쪽 작은 글자 (예: 더보기, 3개 예정) */
  action?: string;
  onPress?: () => void;
};

/** 영역 제목 줄: 왼쪽 제목 · 오른쪽 행동 */
export function SectionHeader({ title, action, onPress }: SectionHeaderProps) {
  return (
    <Pressable style={s.row} onPress={onPress} disabled={!onPress}>
      <Text variant="17-bold">{title}</Text>
      {action ? (
        <Text variant="12-regular" color="brandText">
          {action}
        </Text>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
