import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Txt } from '@/components';
import { icons } from '@/icons';
import { colors, liftedShadow, radius } from '@/theme';

export const STEP_COUNT = 6;

/** 진행 단계: "N / 6 · 이름" + 막대 6칸 */
export function Progress({ step, label }: { step: number; label: string }) {
  return (
    <View style={st.progress}>
      <Txt size={13} lineHeight={1.5} color={colors.brandText}>
        {step > STEP_COUNT ? label : `${step} / ${STEP_COUNT} · ${label}`}
      </Txt>
      <View style={st.bars}>
        {Array.from({ length: STEP_COUNT }, (_, i) => (
          <View key={i} style={[st.bar, { backgroundColor: i < step ? colors.brand : colors.bgDisabled }]} />
        ))}
      </View>
    </View>
  );
}

/** 지도 아래 안내 띠 */
export function InfoBar({ text, center }: { text: string; center?: boolean }) {
  return (
    <View style={[st.info, center ? { justifyContent: 'center' } : null]}>
      <Icon source={icons.mousePointer} size={18} />
      <Txt size={13} lineHeight={1.5} color={colors.brandText} style={{ flexShrink: 1 }}>
        {text}
      </Txt>
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
    <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {onPrev ? (
        <Pressable style={[st.btn, st.prev]} onPress={onPrev} accessibilityRole="button">
          <Txt size={15} weight="bold" color={colors.brandText}>
            이전
          </Txt>
        </Pressable>
      ) : null}
      <Pressable
        style={[st.btn, { flex: 1, backgroundColor: nextDisabled ? colors.bgDisabled : colors.brand }]}
        onPress={onNext}
        disabled={nextDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!nextDisabled }}
      >
        <Txt size={15} weight="bold" color={nextDisabled ? colors.textDisabled : colors.card}>
          {nextLabel}
        </Txt>
      </Pressable>
    </View>
  );
}

export type RoutePoint = { x: number; y: number; name: string; stay: number };

const ROW_H = 57;

/**
 * 순찰 지점 목록. reorder가 켜져 있으면 ⠿ 손잡이를 끌어서 순서를 바꿀 수 있어요.
 */
export function PointList({
  points,
  showStay,
  reorder,
  onRemove,
  onMove,
}: {
  points: RoutePoint[];
  showStay?: boolean;
  reorder?: boolean;
  onRemove: (i: number) => void;
  onMove?: (from: number, to: number) => void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const dy = useRef(new Animated.Value(0)).current;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  // 끄는 동안 다시 그려져도 같은 응답기를 쓰도록 목록이 바뀔 때만 새로 만들어요
  const responders = useMemo(
    () =>
      points.map((_, i) =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => !!reorder,
          onMoveShouldSetPanResponder: () => !!reorder,
          onPanResponderTerminationRequest: () => false,
          onPanResponderGrant: () => {
            dy.setValue(0);
            setDrag(i);
          },
          onPanResponderMove: (_, g) => dy.setValue(g.dy),
          onPanResponderRelease: (_, g) => {
            const to = Math.max(0, Math.min(points.length - 1, i + Math.round(g.dy / ROW_H)));
            setDrag(null);
            dy.setValue(0);
            if (to !== i) onMoveRef.current?.(i, to);
          },
          onPanResponderTerminate: () => {
            setDrag(null);
            dy.setValue(0);
          },
        }),
      ),
    [points, reorder, dy],
  );

  if (points.length === 0) {
    return (
      <View style={[st.listCard, { paddingVertical: 20, alignItems: 'center' }]}>
        <Txt size={13} color={colors.textSub}>
          지도를 꾹 눌러 첫 지점을 추가해 주세요
        </Txt>
      </View>
    );
  }

  return (
    <View style={st.listCard}>
      {points.map((p, i) => (
        <Animated.View
          key={`${p.name}-${p.x}-${p.y}`}
          style={[
            st.row,
            drag === i
              ? { transform: [{ translateY: dy }], zIndex: 2, backgroundColor: colors.card, ...st.lifted }
              : null,
          ]}
        >
          <View
            {...(reorder ? responders[i].panHandlers : {})}
            hitSlop={8}
            style={reorder ? st.grip : null}
            accessibilityLabel={`${p.name} 순서 바꾸기`}
          >
            <Icon source={icons.grip} size={16} />
          </View>
          <View style={st.num}>
            <Txt size={13} color={colors.brandText}>
              {i + 1}
            </Txt>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt size={14} weight="bold">
              {p.name}
            </Txt>
            {showStay ? (
              <Txt size={12} color={colors.textSub}>
                머무는 시간 {p.stay}분
              </Txt>
            ) : null}
          </View>
          <Pressable onPress={() => onRemove(i)} hitSlop={8} accessibilityLabel={`${p.name} 지우기`}>
            <Icon source={icons.circleMinus} size={22} />
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

/** 한 바퀴 예상 시간(분): 머무는 시간 + 이동 거리 */
export function lapMinutes(points: RoutePoint[], recycle: { x: number; y: number } | null) {
  if (points.length === 0) return 0;
  const loop = [...points, ...(recycle ? [recycle] : []), points[0]];
  let dist = 0;
  for (let i = 1; i < loop.length; i++) dist += Math.hypot(loop[i].x - loop[i - 1].x, loop[i].y - loop[i - 1].y);
  const stay = points.reduce((n, p) => n + p.stay, 0);
  return Math.max(1, Math.round(stay + dist / 40));
}

const st = StyleSheet.create({
  progress: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16, gap: 8 },
  bars: { flexDirection: 'row', gap: 6 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  info: {
    backgroundColor: colors.bgBrandSoft,
    minHeight: 48,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footer: { backgroundColor: colors.card, paddingTop: 12, paddingHorizontal: 24, flexDirection: 'row', gap: 10 },
  btn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  prev: { width: 106, backgroundColor: colors.bgBrandSoft },
  listCard: { backgroundColor: colors.card, borderRadius: radius[20], paddingHorizontal: 16, paddingVertical: 4 },
  row: { height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12 },
  lifted: liftedShadow,
  grip: { paddingVertical: 12, cursor: 'grab' } as object,
  num: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
