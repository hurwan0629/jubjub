// 공통 지도 컴포넌트 (KAN-28): 공원 범위 고정 · 마커 표시 · 꾹 눌러 좌표 받기.
// 개발용 빌드에서는 네이버 지도, 네이버 지도 모듈이 없는 앱(Expo Go 등)에서는 도식 지도(ParkMapSchematic)로 같은 동작을 해요.
import { useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, TurboModuleRegistry, View } from 'react-native';

import { colors } from '@/theme';
import { focusBounds, isInPark } from '@/utils/geo';

import { ParkMapSchematic } from './ParkMapSchematic';
import type { ParkMapMarkerKind, ParkMapProps } from './parkMapTypes';

type NaverMapLib = typeof import('@mj-studio/react-native-naver-map');
type NaverRegion = import('@mj-studio/react-native-naver-map').Region;

/**
 * 네이버 지도 라이브러리는 불러오는 순간 네이티브 모듈(RNCNaverMapUtil)을 찾고, 없으면 앱 전체가 멈춰요.
 * 그래서 먼저 모듈이 있는지 오류 없이 확인하고, 있을 때만 불러와요.
 */
function loadNaverMap(): NaverMapLib | null {
  if (TurboModuleRegistry.get('RNCNaverMapUtil') == null) {
    console.warn('[ParkMap] 이 앱에는 네이버 지도 모듈이 없어서 도식 지도를 보여 줘요 (Expo Go · 예전 빌드).');
    return null;
  }
  try {
    // 조건부로 불러와야 해서 require를 써요 (import는 항상 실행돼요)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@mj-studio/react-native-naver-map');
  } catch (e) {
    console.warn('[ParkMap] 네이버 지도를 불러오지 못해 도식 지도를 보여 줘요.', e);
    return null;
  }
}

const NaverMap = loadNaverMap();

// 범례 색과 맞춘 네이버 지도 기본 마커 색
const SYMBOL: Record<ParkMapMarkerKind, 'blue' | 'green' | 'red' | 'lightblue'> = {
  robot: 'blue',
  station: 'green',
  unpickable: 'red',
  point: 'lightblue',
};

// 공원 하나(여의도한강공원 약 3km)가 화면에 다 들어오는 정도까지만 축소할 수 있게 해요 (공원 범위 고정)
const MIN_ZOOM = 13;
const MAX_ZOOM = 19;
const ZOOM_STEP = 1;

/** 공원 범위 → 네이버 지도 Region (남서쪽 + 폭) */
function toRegion(bounds: ParkMapProps['bounds']): NaverRegion {
  return {
    latitude: bounds.southWest.latitude,
    longitude: bounds.southWest.longitude,
    latitudeDelta: bounds.northEast.latitude - bounds.southWest.latitude,
    longitudeDelta: bounds.northEast.longitude - bounds.southWest.longitude,
  };
}

export function ParkMap(props: ParkMapProps) {
  if (!NaverMap) return <ParkMapSchematic {...props} />;
  return <NaverParkMap {...props} lib={NaverMap} />;
}

function NaverParkMap({
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
  lib,
}: ParkMapProps & { lib: NaverMapLib }) {
  const { NaverMapView, NaverMapMarkerOverlay, NaverMapPolylineOverlay, NaverMapPolygonOverlay } = lib;
  const mapRef = useRef<import('@mj-studio/react-native-naver-map').NaverMapViewRef>(null);
  const region = toRegion(bounds);
  // 처음 화면: 마커가 있으면 마커들이 보이게, 없으면 공원 전체 (처음 한 번만 정해요)
  const [focus] = useState(() =>
    toRegion(
      focusBounds(
        markers.map((m) => m.position),
        bounds,
      ),
    ),
  );
  // 지금 카메라 위치 (확대 · 축소할 때 기준)
  const camera = useRef<{ latitude: number; longitude: number; zoom: number } | null>(null);

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      if (camera.current) mapRef.current?.animateCameraTo({ ...camera.current, zoom: camera.current.zoom + ZOOM_STEP });
    },
    zoomOut: () => {
      if (camera.current) mapRef.current?.animateCameraTo({ ...camera.current, zoom: camera.current.zoom - ZOOM_STEP });
    },
    recenter: () => mapRef.current?.animateRegionTo(focus),
  }));

  return (
    <View style={[s.box, style]}>
      <NaverMapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={focus}
        extent={region}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        isShowZoomControls={false}
        isShowLocationButton={false}
        isShowCompass={false}
        isTiltGesturesEnabled={false}
        isRotateGesturesEnabled={false}
        onCameraChanged={({ latitude, longitude, zoom }) => {
          camera.current = { latitude, longitude, zoom: zoom ?? camera.current?.zoom ?? MIN_ZOOM };
        }}
        onLongTapMap={({ latitude, longitude }) => {
          const position = { latitude, longitude };
          // 사각형 범위가 아니라 실제 공원 경계 안인지 봐요 (범위 안의 도로 · 아파트는 공원 밖)
          if (isInPark(bounds, area, position)) onLongPress?.(position);
          else onLongPressOutside?.(position);
        }}
      >
        {/* 공원 경계: 어디까지 찍을 수 있는지 보여 줘요 */}
        {area && area.outer.length >= 3 ? (
          <NaverMapPolygonOverlay
            coords={area.outer}
            holes={area.holes}
            color={colors.parkArea}
            outlineColor={colors.brand}
            outlineWidth={2}
          />
        ) : null}
        {route && route.length > 1 ? (
          <NaverMapPolylineOverlay coords={route} color={colors.brand} width={3} pattern={[5, 6]} />
        ) : null}
        {markers.map((m) => (
          <NaverMapMarkerOverlay
            key={m.id}
            {...m.position}
            image={{ symbol: SYMBOL[m.kind] }}
            caption={
              m.label || m.order
                ? {
                    text: m.kind === 'point' ? `${m.order ?? ''} ${m.label ?? ''}`.trim() : (m.label ?? ''),
                    color: colors.text,
                    haloColor: colors.card,
                  }
                : undefined
            }
            onTap={onMarkerPress ? () => onMarkerPress(m.id) : undefined}
          />
        ))}
      </NaverMapView>

      {faded ? <View style={[StyleSheet.absoluteFill, s.fade]} pointerEvents="none" /> : null}
      {children ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {children}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: colors.map, overflow: 'hidden' },
  fade: { backgroundColor: colors.bg, opacity: 0.65 },
});
