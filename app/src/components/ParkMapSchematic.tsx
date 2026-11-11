// 공통 지도의 도식 버전 (Figma 한강공원 그림). 네이버 지도를 띄울 수 없는 곳(웹 · Expo Go)에서 써요.
// 그림이 공원 범위를 그대로 덮는다고 보고, 좌표 ↔ 그림 위치를 비율로 바꿔요.
import type { ImageSource } from 'expo-image';
import { useImperativeHandle, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { icons } from '@/icons';
import { colors, radius, softShadow, space } from '@/theme';
import type { ColorName } from '@/theme';
import { focusBounds, fromBoundsRatio, isInPark, toBoundsRatio } from '@/utils/geo';

import { Icon } from './Icon';
import type { ParkMapMarkerKind, ParkMapProps } from './parkMapTypes';
import { Text } from './Text';

// Figma 지도 그림 원본 크기
const MAP_W = 390;
const MAP_H = 500;
const MAX_WIDTH = 480;

const ZOOM_MIN = 1;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;

const KIND: Record<Exclude<ParkMapMarkerKind, 'point'>, { bg: ColorName; icon: ImageSource; label: ColorName }> = {
  robot: { bg: 'brand', icon: icons.markerBot, label: 'brandText' },
  station: { bg: 'done', icon: icons.markerRecycle, label: 'textDone' },
  unpickable: { bg: 'error', icon: icons.markerHand, label: 'error' },
};

export function ParkMapSchematic({
  bounds,
  area,
  markers = [],
  route,
  onLongPress,
  onLongPressOutside,
  onMarkerPress,
  faded,
  children,
  style,
  ref,
}: ParkMapProps) {
  const { width: windowWidth } = useWindowDimensions();
  const contentW = Math.min(windowWidth, MAX_WIDTH);
  const scale = contentW / MAP_W;
  const contentH = MAP_H * scale;

  const [zoom, setZoom] = useState(ZOOM_MIN);
  // 그림이 덮는 범위: 마커가 있으면 마커 둘레, 없으면 공원 전체 (처음 한 번만 정해서 마커가 튀지 않게 해요)
  const [view] = useState(() =>
    focusBounds(
      markers.map((m) => m.position),
      bounds,
    ),
  );
  const [boxWidth, setBoxWidth] = useState(contentW);
  const boxRef = useRef<ComponentRef<typeof Pressable>>(null);
  const pressAt = useRef<{ x: number; y: number } | null>(null);

  useImperativeHandle(ref, () => ({
    zoomIn: () => setZoom((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX)),
    zoomOut: () => setZoom((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN)),
    recenter: () => setZoom(ZOOM_MIN),
  }));

  // 좌표 → 그림 위 위치(px)
  const toXY = (p: { latitude: number; longitude: number }) => {
    const { fx, fy } = toBoundsRatio(view, p);
    return { x: fx * contentW, y: fy * contentH };
  };

  const handlePressIn = (e: GestureResponderEvent) => {
    pressAt.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
  };

  const handleLongPress = () => {
    const at = pressAt.current;
    if (!at) return;
    boxRef.current?.measureInWindow((ox: number, oy: number) => {
      // 상자 안 위치 → 가운데 정렬된 그림 안 위치 → 확대를 되돌린 위치
      const left = (boxWidth - contentW) / 2;
      const cx = (at.x - ox - left - contentW / 2) / zoom + contentW / 2;
      const cy = (at.y - oy - contentH / 2) / zoom + contentH / 2;
      const fx = cx / contentW;
      const fy = cy / contentH;
      const position = fromBoundsRatio(view, fx, fy);
      // 그림 안이면서 실제 공원 경계 안일 때만 공원으로 봐요
      const inside = fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1 && isInPark(bounds, area, position);
      if (inside) onLongPress?.(position);
      else onLongPressOutside?.(position);
    });
  };

  const routePoints = (route ?? []).map(toXY);

  return (
    <Pressable
      ref={boxRef}
      onLayout={(e: LayoutChangeEvent) => setBoxWidth(e.nativeEvent.layout.width)}
      onPressIn={handlePressIn}
      onLongPress={handleLongPress}
      delayLongPress={450}
      disabled={!onLongPress && !onLongPressOutside}
      accessibilityHint={onLongPress ? '지도를 꾹 눌러 위치를 정해요' : undefined}
      style={[s.box, style]}
    >
      <View style={{ width: contentW, height: contentH, transform: [{ scale: zoom }] }}>
        <View style={{ opacity: faded ? 0.35 : 1 }} pointerEvents="none">
          <Icon source={icons.parkMapBase} width={contentW} height={contentH} />
        </View>

        {routePoints.length > 1 ? (
          // 크기를 꼭 지정해요. 안 주면 웹에서 기본 300×150 크기로 잘려요.
          <Svg width={contentW} height={contentH} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Polyline
              points={routePoints.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={colors.brand}
              strokeWidth={3}
              strokeDasharray="5 6"
              strokeLinecap="round"
            />
          </Svg>
        ) : null}

        {markers.map((m) => {
          const { x, y } = toXY(m.position);
          if (m.kind === 'point') {
            return (
              <Pressable
                key={m.id}
                onPress={onMarkerPress ? () => onMarkerPress(m.id) : undefined}
                disabled={!onMarkerPress}
                accessibilityLabel={m.label}
                style={[s.point, { left: x - 16, top: y - 16 }]}
              >
                <Text variant="14-bold-digits" color="card">
                  {m.order ?? ''}
                </Text>
              </Pressable>
            );
          }
          const k = KIND[m.kind];
          return (
            <Pressable
              key={m.id}
              onPress={onMarkerPress ? () => onMarkerPress(m.id) : undefined}
              disabled={!onMarkerPress}
              accessibilityLabel={m.label}
              style={[s.markerWrap, { left: x - 22, top: y - 22 }]}
            >
              <View style={[s.marker, { backgroundColor: colors[k.bg] }]}>
                <Icon source={k.icon} size={22} />
              </View>
              {m.showLabel && m.label ? (
                <View style={s.label}>
                  <Text variant="12-bold" color={k.label}>
                    {m.label}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {children ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {children}
        </View>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: colors.map, overflow: 'hidden', alignItems: 'center' },
  markerWrap: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: space[4] },
  marker: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...softShadow,
  },
  label: { backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: space[8], paddingVertical: space[4] },
  point: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.card,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
