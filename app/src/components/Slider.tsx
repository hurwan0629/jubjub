import { useRef, useState } from 'react';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

type SliderProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** 값 간격 (기본 5) */
  step?: number;
  accessibilityLabel: string;
};

const KNOB = 24;

/**
 * 가로 슬라이더 (Figma A-12 "슬라이더": 막대 6 · 채움 브랜드 · 손잡이 흰 원 + 브랜드 테두리).
 * 막대를 누르거나 끌어서 값을 바꿔요. 화면 읽기 프로그램에서는 위아래 쓸기로 한 칸씩 바꿔요.
 */
export function Slider({ value, onChange, min = 0, max = 100, step = 5, accessibilityLabel }: SliderProps) {
  const [width, setWidth] = useState(0);
  const left = useRef(0);
  const ratio = (value - min) / (max - min);

  const update = (e: GestureResponderEvent) => {
    if (!width) return;
    const x = Math.min(Math.max(e.nativeEvent.locationX ?? e.nativeEvent.pageX - left.current, 0), width);
    const raw = min + (x / width) * (max - min);
    const next = Math.min(max, Math.max(min, Math.round(raw / step) * step));
    if (next !== value) onChange(next);
  };

  return (
    <View
      style={s.area}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        left.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
        update(e);
      }}
      onResponderMove={(e) => {
        // 끄는 중에는 locationX가 손잡이 기준으로 바뀔 수 있어 pageX로 계산해요
        if (!width) return;
        const x = Math.min(Math.max(e.nativeEvent.pageX - left.current, 0), width);
        const next = Math.min(max, Math.max(min, Math.round((min + (x / width) * (max - min)) / step) * step));
        if (next !== value) onChange(next);
      }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value, text: `${value}%` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) =>
        onChange(Math.min(max, Math.max(min, value + (e.nativeEvent.actionName === 'increment' ? step : -step))))
      }
    >
      <View style={s.track} pointerEvents="none">
        <View style={[s.fill, { width: `${ratio * 100}%` }]} />
      </View>
      <View
        pointerEvents="none"
        style={[s.knob, { left: Math.max(0, Math.min(width - KNOB, ratio * width - KNOB / 2)) }]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  area: { height: KNOB, justifyContent: 'center' },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.bgDisabled, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.brand },
  knob: {
    position: 'absolute',
    top: 0,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    borderWidth: 3,
    borderColor: colors.brand,
    backgroundColor: colors.card,
  },
});
