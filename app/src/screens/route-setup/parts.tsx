// C-03 순찰 경로 처음 설정에서만 쓰는 부품. 지도 · 지점 목록 · 시간표는 @/components 의 공통 부품을 써요.
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components';
import { colors, layout, space } from '@/theme';

export const STEP_COUNT = 6;

/** 진행 단계: "N / 6 · 이름" + 막대 6칸 */
export function Progress({ step, label }: { step: number; label: string }) {
  return (
    <View style={st.progress}>
      <Text variant="13-regular" color="brandText" lineHeight="relaxed">
        {step > STEP_COUNT ? label : `${step} / ${STEP_COUNT} · ${label}`}
      </Text>
      <View style={st.bars}>
        {Array.from({ length: STEP_COUNT }, (_, i) => (
          <View key={i} style={[st.bar, { backgroundColor: i < step ? colors.brand : colors.bgDisabled }]} />
        ))}
      </View>
    </View>
  );
}

/** 고정 저장 영역: 이전 + 다음 */
export function Footer({
  onPrev,
  nextLabel = '다음',
  nextDisabled,
  onNext,
}: {
  onPrev?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  onNext: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, space[12]) }]}>
      {onPrev ? (
        <Pressable style={[st.btn, st.prev]} onPress={onPrev} accessibilityRole="button">
          <Text variant="15-bold" color="brandText">
            이전
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        style={[st.btn, st.next, { backgroundColor: nextDisabled ? colors.bgDisabled : colors.brand }]}
        onPress={onNext}
        disabled={nextDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!nextDisabled }}
      >
        <Text variant="15-bold" color={nextDisabled ? 'textDisabled' : 'card'}>
          {nextLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  progress: { paddingHorizontal: layout.screenPadding, paddingTop: space[8], paddingBottom: space[16], gap: space[8] },
  bars: { flexDirection: 'row', gap: 6 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  footer: {
    backgroundColor: colors.card,
    paddingTop: space[12],
    paddingHorizontal: layout.screenPadding,
    flexDirection: 'row',
    gap: 10,
  },
  btn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  prev: { width: 106, backgroundColor: colors.bgBrandSoft },
  next: { flex: 1 },
});
