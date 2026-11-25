import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, space, typography } from '@/theme';

import { BottomSheet } from './BottomSheet';
import { Text } from './Text';

type RobotRequestSheetProps = {
  visible: boolean;
  /** assign: 로봇 배정 요청 (A-01 홈, 메모 선택) · add: 로봇 추가 요청 (A-13, 이유 필수) */
  kind: 'assign' | 'add';
  parkName: string;
  /** 지금 배정된 로봇 수 (추가 요청에서 "지금 2대 → 3대"로 보여요) */
  currentCount?: number;
  sending?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (robotCount: number, reason: string) => void;
};

const MAX_ROBOTS = 10;

/** 로봇 배정 · 추가 요청 시트. 보낸 요청은 총관리자 웹(W-04 로봇 목록)의 "배정 요청"에서 보고 배정해요. */
export function RobotRequestSheet({
  visible,
  kind,
  parkName,
  currentCount = 0,
  sending,
  error,
  onClose,
  onSubmit,
}: RobotRequestSheetProps) {
  const [count, setCount] = useState(1);
  const [memo, setMemo] = useState('');
  const add = kind === 'add';
  const reason = memo.trim();
  const canSend = !sending && (!add || reason.length > 0);

  const close = () => {
    if (sending) return;
    setCount(1);
    setMemo('');
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      title={add ? '로봇 추가 요청' : '로봇 배정 요청'}
      description={
        add
          ? `지금 ${parkName}에서 로봇 ${currentCount}대가 일하고 있어요. 총관리자가 확인하면 알림으로 알려 드려요.`
          : '총관리자에게 요청이 가요. 배정되면 알림으로 알려 드려요.'
      }
      onClose={close}
    >
      <View style={s.field}>
        <Text variant="13-bold">공원</Text>
        <View style={s.readonly}>
          <Text variant="15-regular" color="textSub">
            {parkName}
          </Text>
        </View>
      </View>

      <View style={s.countRow}>
        <View style={s.flex1}>
          <Text variant="13-bold">{add ? '추가로 필요한 로봇 수' : '필요한 로봇 수'}</Text>
          <Text variant="11-regular" color="textSub">
            {add ? `지금 ${currentCount}대 → ${currentCount + count}대` : '공원 크기에 맞게 골라 주세요'}
          </Text>
        </View>
        <View style={s.stepper}>
          <Pressable
            style={s.stepButton}
            onPress={() => setCount((c) => Math.max(1, c - 1))}
            disabled={count <= 1}
            accessibilityRole="button"
            accessibilityLabel="로봇 수 줄이기"
          >
            <Text variant="18-bold" color={count <= 1 ? 'textDisabled' : 'brandText'}>
              −
            </Text>
          </Pressable>
          <Text variant="15-bold" accessibilityLabel={`${count}대`}>
            {count}대
          </Text>
          <Pressable
            style={s.stepButton}
            onPress={() => setCount((c) => Math.min(MAX_ROBOTS, c + 1))}
            disabled={count >= MAX_ROBOTS}
            accessibilityRole="button"
            accessibilityLabel="로봇 수 늘리기"
          >
            <Text variant="18-bold" color={count >= MAX_ROBOTS ? 'textDisabled' : 'brandText'}>
              +
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={s.field}>
        <View style={s.labelRow}>
          <Text variant="13-bold">{add ? '요청 이유' : '요청 메모'}</Text>
          <Text variant="11-semibold" color={add ? 'error' : 'textSub'}>
            {add ? '필수' : '선택'}
          </Text>
        </View>
        <TextInput
          style={[s.memo, add && reason ? s.memoFilled : null]}
          value={memo}
          onChangeText={setMemo}
          placeholder={
            add
              ? '예) 주말에 방문객이 많아 한 바퀴 도는 데 오래 걸려요'
              : '예) 공원 입구가 두 군데라 오전부터 순찰이 필요해요'
          }
          placeholderTextColor={colors.textDisabled}
          multiline
          maxLength={1000}
          accessibilityLabel={add ? '요청 이유' : '요청 메모'}
        />
      </View>

      {error ? (
        <Text variant="13-regular" color="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <View style={s.actions}>
        <Pressable style={[s.action, s.cancel]} onPress={close} disabled={sending} accessibilityRole="button">
          <Text variant="15-bold" color="brandText">
            취소
          </Text>
        </Pressable>
        <Pressable
          style={[s.action, s.send, !canSend ? s.sendDisabled : null]}
          disabled={!canSend}
          onPress={() => onSubmit(count, reason || (add ? reason : '로봇 배정 요청'))}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
        >
          <Text variant="15-bold" color={canSend ? 'card' : 'textDisabled'}>
            {sending ? '보내는 중…' : '요청 보내기'}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  flex1: { flex: 1, gap: 3 },
  field: { gap: space[8] },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readonly: {
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
    borderRadius: 12,
    backgroundColor: colors.bg,
    paddingHorizontal: space[4],
  },
  stepButton: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  memo: {
    minHeight: 84,
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.bg,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    textAlignVertical: 'top',
    ...typography['13-regular'],
    color: colors.text,
    outlineStyle: 'none',
  } as object,
  memoFilled: { backgroundColor: colors.card, borderColor: colors.brand },
  actions: { flexDirection: 'row', gap: space[8], marginTop: space[4] },
  action: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cancel: { flex: 1, backgroundColor: colors.bgBrandSoft },
  send: { flex: 2.5, backgroundColor: colors.brand },
  sendDisabled: { backgroundColor: colors.bgDisabled },
});
