import { ComponentRef, ReactNode, useRef } from 'react';
import { GestureResponderEvent, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { Icon, Txt } from '../../components/ui';
import { icons } from '../../icons';
import { colors, softShadow } from '../../theme';

// Figma 지도 원본 크기 (지도 좌표는 이 크기를 기준으로 저장해요)
export const MAP_W = 390;
export const MAP_H = 500;

export type Pt = { x: number; y: number };

/** 화면 폭에 맞춘 지도 배율 */
export function useMapScale() {
  const { width } = useWindowDimensions();
  return Math.min(width, 480) / MAP_W;
}

/**
 * 한강공원 도식 지도.
 * onLongPress를 주면 지도를 꾹 눌렀을 때 그 위치(지도 좌표)를 알려 줘요.
 */
export function ParkMap({
  height,
  faded,
  recycle,
  recycleLabel,
  points = [],
  route,
  onLongPress,
  children,
}: {
  height: number;
  faded?: boolean;
  recycle?: Pt | null;
  recycleLabel?: boolean;
  points?: Pt[];
  /** 지점 → 분리수거장 → 처음 지점으로 도는 점선 경로 */
  route?: boolean;
  onLongPress?: (p: Pt) => void;
  children?: ReactNode;
}) {
  const scale = useMapScale();
  const ref = useRef<ComponentRef<typeof Pressable>>(null);
  const pressAt = useRef<{ x: number; y: number } | null>(null);

  const handlePressIn = (e: GestureResponderEvent) => {
    pressAt.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
  };
  const handleLongPress = () => {
    const at = pressAt.current;
    if (!at || !onLongPress) return;
    ref.current?.measureInWindow((ox: number, oy: number) => {
      const x = (at.x - ox) / scale;
      const y = (at.y - oy) / scale;
      if (x < 0 || y < 0 || x > MAP_W || y > height / scale) return;
      onLongPress({ x: Math.round(x), y: Math.round(y) });
    });
  };

  const loop = route && points.length > 0 ? [...points, ...(recycle ? [recycle] : []), points[0]] : points;
  const s = (p: Pt) => `${p.x * scale},${p.y * scale}`;

  return (
    <Pressable
      ref={ref}
      onPressIn={handlePressIn}
      onLongPress={handleLongPress}
      delayLongPress={450}
      disabled={!onLongPress}
      accessibilityHint={onLongPress ? '지도를 꾹 눌러 위치를 정해요' : undefined}
      style={[st.map, { height }]}
    >
      <View style={{ opacity: faded ? 0.35 : 1 }} pointerEvents="none">
        <Icon source={icons.parkMapBase} width={MAP_W * scale} height={MAP_H * scale} />
      </View>

      {points.length > 1 || (route && points.length > 0) ? (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Polyline
            points={loop.map(s).join(' ')}
            fill="none"
            stroke={colors.brand}
            strokeWidth={3}
            strokeDasharray="5 6"
            strokeLinecap="round"
          />
        </Svg>
      ) : null}

      {recycle ? (
        <View pointerEvents="none" style={[st.recycleWrap, { left: recycle.x * scale - 22, top: recycle.y * scale - 22 }]}>
          <View style={st.recycle}>
            <Icon source={icons.markerRecycle} size={22} />
          </View>
          {recycleLabel ? (
            <View style={st.recycleLabel}>
              <Txt size={12} weight="bold" color={colors.textDone}>
                분리수거장
              </Txt>
            </View>
          ) : null}
        </View>
      ) : null}

      {points.map((p, i) => (
        <View key={i} pointerEvents="none" style={[st.point, { left: p.x * scale - 16, top: p.y * scale - 16 }]}>
          <Txt size={14} weight="bold" color={colors.card}>
            {i + 1}
          </Txt>
        </View>
      ))}

      {children}
    </Pressable>
  );
}

const st = StyleSheet.create({
  map: { backgroundColor: colors.map, overflow: 'hidden', alignItems: 'center' },
  recycleWrap: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 4 },
  recycle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: colors.card,
    backgroundColor: colors.done,
    alignItems: 'center',
    justifyContent: 'center',
    ...softShadow,
  },
  recycleLabel: { backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  point: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.card,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
