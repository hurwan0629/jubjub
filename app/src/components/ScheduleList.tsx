import { Pressable, StyleSheet, View } from 'react-native';

import type { PatrolSlot } from '@/api/types';
import { icons } from '@/icons';
import { colors, radius, space } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';
import { Toggle } from './Toggle';

type ScheduleListProps = {
  slots: PatrolSlot[];
  onChange: (slots: PatrolSlot[]) => void;
  /** "+ 순찰 시간 추가"를 눌렀을 때 (시간 추가 시트를 열어요) */
  onAddPress: () => void;
};

/** 순찰 시간표 목록 (C-03 처음 설정 6단계 · A-04 시간표 설정 탭) */
export function ScheduleList({ slots, onChange, onAddPress }: ScheduleListProps) {
  const toggle = (id: string, on: boolean) => onChange(slots.map((x) => (x.id === id ? { ...x, on } : x)));

  return (
    <View style={s.list}>
      <View style={s.head}>
        <Text variant="17-bold">순찰 시간표</Text>
        <Text variant="12-regular" color="textSub">
          {slots.length}개 항목
        </Text>
      </View>
      {slots.map((slot) => (
        <View key={slot.id} style={s.slot}>
          <Toggle value={slot.on} onChange={(on) => toggle(slot.id, on)} accessibilityLabel={`${slot.time} 순찰`} />
          <View style={s.timeChip}>
            <Text variant="15-bold" color={slot.on ? 'brandText' : 'textDisabled'}>
              {slot.time}
            </Text>
          </View>
          <View style={s.info}>
            <Text variant="13-bold" color={slot.on ? 'text' : 'textDisabled'}>
              전체 경로
            </Text>
            <Text variant="12-regular" color="textSub">
              {slot.label}
            </Text>
          </View>
          {/* 시간 고치기는 다음 작업에서 이어 붙여요 */}
          <Icon source={icons.pencil} size={22} />
        </View>
      ))}
      <Pressable style={s.add} onPress={onAddPress} accessibilityRole="button">
        <Text variant="15-bold" color="card">
          + 순찰 시간 추가
        </Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  list: { gap: space[12] },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  slot: {
    backgroundColor: colors.card,
    borderRadius: radius[16],
    padding: space[12],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
  },
  timeChip: {
    backgroundColor: colors.bgBrandSoft,
    borderRadius: 12,
    width: 64,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 3 },
  add: { height: 52, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
});
