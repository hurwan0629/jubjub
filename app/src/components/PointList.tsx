import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import type { PatrolPoint } from '@/api/types';
import { icons } from '@/icons';
import { colors, liftedShadow, radius, space } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

const ROW_H = 57;

type PointListProps = {
  points: PatrolPoint[];
  /** ⠿ 손잡이를 끌어서 순서를 바꿀 수 있게 */
  reorder?: boolean;
  onRemove: (index: number) => void;
  onMove?: (from: number, to: number) => void;
};

/** 순찰 지점 목록 (C-03 처음 설정 · A-04 경로 편집) */
export function PointList({ points, reorder, onRemove, onMove }: PointListProps) {
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
      <View style={[s.card, s.empty]}>
        <Text variant="13-regular" color="textSub">
          지도를 꾹 눌러 첫 지점을 추가해 주세요
        </Text>
      </View>
    );
  }

  return (
    <View style={s.card}>
      {points.map((p, i) => (
        <Animated.View key={p.id} style={[s.row, drag === i ? [s.lifted, { transform: [{ translateY: dy }] }] : null]}>
          <View
            {...(reorder ? responders[i].panHandlers : {})}
            hitSlop={8}
            style={reorder ? s.grip : null}
            accessibilityLabel={`${p.name} 순서 바꾸기`}
          >
            <Icon source={icons.grip} size={16} />
          </View>
          <View style={s.num}>
            <Text variant="13-regular-digits" color="brandText" style={s.numText}>
              {i + 1}
            </Text>
          </View>
          <View style={s.pointText}>
            <Text variant="14-bold" numberOfLines={1}>
              {p.name}
            </Text>
          </View>
          <Pressable
            onPress={() => onRemove(i)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${p.name} 지우기`}
          >
            <Icon source={icons.circleMinus} size={22} />
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius[20],
    paddingHorizontal: space[16],
    paddingVertical: space[4],
  },
  empty: { paddingVertical: space[20], alignItems: 'center' },
  row: { height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: space[12], borderRadius: 12 },
  lifted: { zIndex: 2, backgroundColor: colors.card, ...liftedShadow },
  grip: { paddingVertical: space[12], cursor: 'grab' } as object,
  num: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: { textAlign: 'center' },
  // 이름을 줄 가운데에 맞춰요
  pointText: { flex: 1, justifyContent: 'center' },
});
