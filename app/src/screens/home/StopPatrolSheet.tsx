// A-01 홈 - 순찰 멈추기 확인: 잘못 눌러도 바로 멈추지 않게 확인 시트를 띄워요.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet, Icon, Text } from '@/components';
import { icons } from '@/icons';
import { colors, space } from '@/theme';

type Mode = 'here' | 'return';

type Props = {
  visible: boolean;
  robotName: string;
  activity: string;
  sending?: boolean;
  onClose: () => void;
  onStop: (mode: Mode) => void;
};

/**
 * 순찰 멈추기 확인 시트.
 * 지금 서버(POST /robots/{id}/patrol/stop)는 "그 자리에서 멈추기"만 받아서,
 * "이번 순찰 끝내고 돌아가기"는 서버가 준비될 때까지 고를 수 없게 보여 줘요.
 */
export function StopPatrolSheet({ visible, robotName, activity, sending, onClose, onStop }: Props) {
  const [mode, setMode] = useState<Mode>('here');
  return (
    <BottomSheet
      visible={visible}
      title={`${robotName} 순찰을 멈출까요?`}
      description={`지금 ${activity}. 주운 쓰레기는 적재함에 그대로 있어요.`}
      onClose={onClose}
    >
      <Option
        selected={mode === 'here'}
        title="그 자리에서 멈추기"
        body="다시 시작하면 남은 순찰 지점부터 이어서 돌아요"
        onPress={() => setMode('here')}
      />
      <Option
        selected={mode === 'return'}
        disabled
        title="이번 순찰 끝내고 돌아가기"
        body="분리수거장으로 돌아가 쓰레기를 비우고 다음 순찰을 기다려요 · 로봇 서버 준비 중이라 아직 고를 수 없어요"
        onPress={() => setMode('return')}
      />
      <View style={s.note}>
        <Text variant="12-regular" color="textSub">
          멈춘 동안에는 다음 순찰 시간이 되어도 자동으로 다시 시작하지 않아요.
        </Text>
      </View>
      <View style={s.actions}>
        <Pressable style={[s.action, s.cancel]} onPress={onClose} disabled={sending} accessibilityRole="button">
          <Text variant="16-bold" color="brandText">
            취소
          </Text>
        </Pressable>
        <Pressable
          style={[s.action, s.stop]}
          onPress={() => onStop(mode)}
          disabled={sending}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!sending }}
        >
          <Text variant="16-bold" color="card">
            {sending ? '보내는 중…' : '멈추기'}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

function Option({
  selected,
  disabled,
  title,
  body,
  onPress,
}: {
  selected: boolean;
  disabled?: boolean;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[s.option, selected ? s.optionOn : null, disabled ? s.optionDisabled : null]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!disabled }}
    >
      <Icon source={selected ? icons.radioOn : icons.radioOff} size={20} />
      <View style={s.optionText}>
        <Text variant="15-bold" color={selected ? 'brandText' : disabled ? 'textDisabled' : 'text'}>
          {title}
        </Text>
        <Text variant="12-regular" color="textSub">
          {body}
        </Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    paddingHorizontal: space[16],
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  optionOn: { backgroundColor: colors.bgBrandSoft, borderColor: colors.brand, borderWidth: 1.5 },
  optionDisabled: { opacity: 0.6 },
  optionText: { flex: 1, gap: 3 },
  note: { backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: space[12], paddingVertical: 10 },
  actions: { flexDirection: 'row', gap: space[8] },
  action: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: colors.bgBrandSoft },
  stop: { backgroundColor: colors.brand },
});
