import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, space, typography } from '@/theme';

import { BottomSheet } from './BottomSheet';
import { Text } from './Text';

const MIN_COUNT = 1;
const MAX_COUNT = 5;

type RobotRequestSheetProps = {
  visible: boolean;
  /** 'assign' 로봇 배정 요청 (A-01 배정 전) · 'add' 로봇 추가 요청 (A-13) */
  kind: 'assign' | 'add';
  parkName: string;
  /** 요청을 보내는 중이면 버튼을 잠가요 */
  sending?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (input: { count: number; memo?: string }) => void;
};

/** 로봇 배정 · 추가 요청 시트 (Figma Page 5 "요청 시트"): 공원 · 필요한 로봇 수 · 요청 메모 */
export function RobotRequestSheet({
  visible,
  kind,
  parkName,
  sending,
  error,
  onClose,
  onSubmit,
}: RobotRequestSheetProps) {
  const [count, setCount] = useState(MIN_COUNT);
  const [memo, setMemo] = useState('');

  const handleClose = () => {
    setCount(MIN_COUNT);
    setMemo('');
    onClose();
  };
  const handleSubmit = () => onSubmit({ count, memo: memo.trim() || undefined });

  return (
    <BottomSheet
      visible={visible}
      title={kind === 'assign' ? '로봇 배정 요청' : '로봇 추가 요청'}
      description="총관리자에게 요청이 가요. 배정되면 알림으로 알려 드려요."
      titleVariant="19-bold"
      descriptionColor="textBody"
      onClose={handleClose}
    >
      <View style={s.field}>
        <Text variant="13-semibold">공원</Text>
        <View style={s.valueBox}>
          <Text variant="15-semibold" color="textBody">
            {parkName}
          </Text>
        </View>
      </View>

      <View style={s.countRow}>
        <View style={s.countText}>
          <Text variant="13-semibold">{kind === 'assign' ? '필요한 로봇 수' : '더 필요한 로봇 수'}</Text>
          <Text variant="11-regular" color="textBody">
            공원 크기에 맞게 골라 주세요
          </Text>
        </View>
        <View style={s.stepper}>
          <Pressable
            style={s.stepButton}
            onPress={() => setCount((c) => Math.max(MIN_COUNT, c - 1))}
            disabled={count <= MIN_COUNT}
            accessibilityRole="button"
            accessibilityLabel="한 대 줄이기"
          >
            <Text variant="18-bold" color={count <= MIN_COUNT ? 'textPlaceholder' : 'brandText'}>
              −
            </Text>
          </Pressable>
          <View style={s.countValue}>
            <Text variant="15-bold">{count}대</Text>
          </View>
          <Pressable
            style={s.stepButton}
            onPress={() => setCount((c) => Math.min(MAX_COUNT, c + 1))}
            disabled={count >= MAX_COUNT}
            accessibilityRole="button"
            accessibilityLabel="한 대 늘리기"
          >
            <Text variant="18-bold" color={count >= MAX_COUNT ? 'textPlaceholder' : 'brandText'}>
              +
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={s.field}>
        <View style={s.memoTitle}>
          <Text variant="13-semibold">요청 메모</Text>
          <Text variant="11-semibold" color="textBody">
            선택
          </Text>
        </View>
        <TextInput
          value={memo}
          onChangeText={setMemo}
          placeholder="예) 공원 입구가 두 군데라 오전부터 순찰이 필요해요"
          placeholderTextColor={colors.textPlaceholder}
          style={s.memo}
          multiline
          maxLength={300}
          textAlignVertical="top"
          accessibilityLabel="요청 메모"
        />
      </View>

      {error ? (
        <Text variant="12-regular" color="error">
          {error}
        </Text>
      ) : null}

      <View style={s.actions}>
        <Pressable style={[s.action, s.cancel]} onPress={handleClose} accessibilityRole="button">
          <Text variant="15-bold" color="brandText">
            취소
          </Text>
        </Pressable>
        <Pressable
          style={[s.action, s.submit, sending ? s.sending : null]}
          onPress={handleSubmit}
          disabled={sending}
          accessibilityRole="button"
        >
          <Text variant="15-bold" color="card">
            {sending ? '보내는 중…' : '요청 보내기'}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  field: { gap: 6 },
  valueBox: { backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: space[8] },
  countText: { flex: 1, gap: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderRadius: 12 },
  stepButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  countValue: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  memoTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memo: {
    ...typography['14-regular'],
    color: colors.text,
    lineHeight: 21,
    backgroundColor: colors.bg,
    borderRadius: 12,
    minHeight: 84,
    padding: 14,
    outlineStyle: 'none',
  } as object,
  actions: { flexDirection: 'row', gap: 10 },
  action: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cancel: { width: 96, backgroundColor: colors.bgBrandSoft },
  submit: { flex: 1, backgroundColor: colors.brand },
  sending: { opacity: 0.6 },
});
