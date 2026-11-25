import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import type { ScheduleRepeat } from '@/api/types';
import { colors, radius, space, typography } from '@/theme';
import { REPEAT_LABEL } from '@/utils/route';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { FilterChip } from './FilterChip';
import { Text } from './Text';

type AddTimeSheetProps = {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (value: { time: string; repeat: ScheduleRepeat }) => void;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** 지금부터 가장 가까운 10분 단위 시각 */
function nextRoundTime() {
  const d = new Date(Date.now() + 10 * 60 * 1000);
  return { hour: d.getHours(), minute: Math.floor(d.getMinutes() / 10) * 10 };
}

/** 숫자만 남기고 범위 안으로 (빈 칸은 그대로 두어 다시 입력할 수 있게) */
const clampInput = (text: string, max: number) => {
  const digits = text.replace(/\D/g, '').slice(0, 2);
  if (digits === '') return '';
  return String(Math.min(Number(digits), max));
};

/** 순찰 시간 추가 (Figma "A-04 순찰 경로 편집 - 순찰 시간 추가") */
export function AddTimeSheet({ visible, onCancel, onSubmit }: AddTimeSheetProps) {
  const [hour, setHour] = useState(() => pad(nextRoundTime().hour));
  const [minute, setMinute] = useState(() => pad(nextRoundTime().minute));
  const [repeat, setRepeat] = useState<ScheduleRepeat>('daily');
  const valid = hour !== '' && minute !== '';

  const reset = () => {
    const t = nextRoundTime();
    setHour(pad(t.hour));
    setMinute(pad(t.minute));
    setRepeat('daily');
  };

  return (
    <BottomSheet
      visible={visible}
      title="순찰 시간을 추가해요"
      description="순찰할 시각을 선택해요"
      onClose={() => {
        reset();
        onCancel();
      }}
    >
      <View style={s.timeBox}>
        <TextInput
          value={hour}
          onChangeText={(t) => setHour(clampInput(t, 23))}
          onBlur={() => hour !== '' && setHour(pad(Number(hour)))}
          keyboardType="number-pad"
          maxLength={2}
          style={s.timeInput}
          accessibilityLabel="시"
        />
        <Text variant="30-bold" color="brandText">
          :
        </Text>
        <TextInput
          value={minute}
          onChangeText={(t) => setMinute(clampInput(t, 59))}
          onBlur={() => minute !== '' && setMinute(pad(Number(minute)))}
          keyboardType="number-pad"
          maxLength={2}
          style={s.timeInput}
          accessibilityLabel="분"
        />
      </View>
      <Text variant="14-bold">반복</Text>
      <View style={s.chips}>
        {(Object.keys(REPEAT_LABEL) as ScheduleRepeat[]).map((r) => (
          <FilterChip
            key={r}
            label={REPEAT_LABEL[r]}
            selected={repeat === r}
            onPress={() => setRepeat(r)}
            minWidth={98}
          />
        ))}
      </View>
      <View style={s.actions}>
        <View style={s.flex}>
          <Button
            label="취소"
            variant="soft"
            onPress={() => {
              reset();
              onCancel();
            }}
          />
        </View>
        <View style={s.flex}>
          <Button
            label="추가"
            disabled={!valid}
            onPress={() => {
              onSubmit({ time: `${pad(Number(hour))}:${pad(Number(minute))}`, repeat });
              reset();
            }}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  timeBox: {
    height: 68,
    borderRadius: radius[16],
    backgroundColor: colors.bgBrandSoft,
    paddingHorizontal: space[16],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
  },
  // 안드로이드 입력칸 여백을 빼서 큰 숫자가 칸 안에 들어가게 해요
  timeInput: {
    ...typography['30-bold'],
    color: colors.brandText,
    width: 48,
    padding: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
    textAlign: 'center',
    outlineStyle: 'none',
  } as object,
  chips: { flexDirection: 'row', gap: space[8] },
  actions: { flexDirection: 'row', gap: 10, marginTop: space[4] },
  flex: { flex: 1 },
});
