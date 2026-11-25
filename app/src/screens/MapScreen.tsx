// A-02 지도. 웹에서는 OpenStreetMap, 개발용 빌드에서는 네이버 지도, Expo Go에서는 도식 지도를 보여 줘요.
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { LatLng, MapDetection, SavedRobotRoute, SavedRouteMap } from '@/api/types';
import { Button, FilterBar, FilterChip, Header, Icon, ParkMap, Text } from '@/components';
import type { ParkMapHandle, ParkMapMarker } from '@/components';
import { useSavedRouteMap } from '@/hooks/useMap';
import { selectRobot } from '@/hooks/useSelectedRobot';
import { icons } from '@/icons';
import type { RootParams, TabParams } from '@/navigation';
import { colors, layout, radius, softShadow, space } from '@/theme';
import { formatTime } from '@/utils/date';
import { distanceMeters } from '@/utils/geo';

import { MapSheet } from './map/MapSheet';
import type { MapSelection } from './map/MapSheet';

/** 히트맵 칸 크기 (위도 · 경도 약 0.0003도 ≈ 30m). 칸마다 탐지 건수를 숫자로 보여 줘요. */
const HEAT_CELL = 0.0003;

/** 최근 7일 탐지를 칸으로 묶어요 (A-02 지도 - 발생 히트맵) */
function heatMarkers(detections: MapDetection[]): ParkMapMarker[] {
  const cells = new Map<string, { lat: number; lng: number; count: number }>();
  detections.forEach((d) => {
    const key = `${Math.round(d.position.latitude / HEAT_CELL)}:${Math.round(d.position.longitude / HEAT_CELL)}`;
    const cell = cells.get(key) ?? { lat: 0, lng: 0, count: 0 };
    cell.lat += d.position.latitude;
    cell.lng += d.position.longitude;
    cell.count += 1;
    cells.set(key, cell);
  });
  return [...cells.entries()].map(([key, c]) => ({
    id: `heat-${key}`,
    kind: 'point' as const,
    position: { latitude: c.lat / c.count, longitude: c.lng / c.count },
    label: `${c.count}건`,
    order: c.count,
  }));
}

/** 탐지 위치와 가장 가까운 순찰 지점 이름 (상세 카드 제목) */
function nearestPlace(data: SavedRouteMap, position: LatLng) {
  let best: { name: string; d: number } | null = null;
  data.routes.forEach((r) =>
    r.points.forEach((p) => {
      const d = distanceMeters(p.position, position);
      if (!best || d < best.d) best = { name: p.name, d };
    }),
  );
  const found = best as { name: string; d: number } | null;
  return found && found.d < 150 ? `${found.name} 근처` : '집기 불가 쓰레기';
}

/** 로봇마다 경로 색을 달리해요 (시안: Jubi 1 파랑 · Jubi 2 주황) */
const ROUTE_COLORS = [colors.brand, colors.robotAlt, colors.brandText, colors.done];

/** 분리수거장에서 출발해 순찰 지점을 순서대로 돌고 분리수거장으로 돌아오는 점선 */
function loopOf(route: SavedRobotRoute): LatLng[] {
  const points = route.points.map((p) => p.position);
  if (route.station) return [route.station, ...points, route.station];
  return points.length > 1 ? [...points, points[0]] : points;
}

function markersOf(data: SavedRouteMap): ParkMapMarker[] {
  const stations: ParkMapMarker[] = data.stations.map((st) => ({
    id: `station-${st.id}`,
    kind: 'station',
    position: st.position,
    label: st.name,
  }));
  // 로봇이 한 대면 지점에 순서 번호를 보여 줘요. 여러 대면 번호가 겹쳐 헷갈리니 이름만 보여요.
  const single = data.routes.length === 1;
  const points: ParkMapMarker[] = data.routes.flatMap((route, r) =>
    route.points.map((p, i) => ({
      id: `point-${r}-${p.id}`,
      kind: 'point' as const,
      position: p.position,
      label: single ? p.name : `${route.robotName} · ${p.name}`,
      order: single ? i + 1 : undefined,
    })),
  );
  const robots: ParkMapMarker[] = data.routes.flatMap((route, r) =>
    route.position
      ? [
          {
            id: `robot-${route.robotId ?? r}`,
            kind: 'robot' as const,
            position: route.position,
            label: route.robotName,
          },
        ]
      : [],
  );
  // 집기 불가 쓰레기 (최근 7일, 줍지 못한 것)
  const unpickable: ParkMapMarker[] = data.detections
    .filter((d) => d.pickupResult === 'failed')
    .map((d) => ({
      id: `detection-${d.id}`,
      kind: 'unpickable' as const,
      position: d.position,
      label: `${MATERIAL_SHORT[d.material]} · ${formatTime(new Date(d.detectedAt))}`,
    }));
  return [...stations, ...points, ...unpickable, ...robots];
}

const MATERIAL_SHORT: Record<MapDetection['material'], string> = {
  plastic: '페트',
  can: '캔',
  glass: '깨진 유리',
  general: '쓰레기',
};

const LEGEND = [
  { icon: icons.legendBot, label: '로봇' },
  { icon: icons.legendRecycle, label: '분리수거장' },
  { icon: icons.legendHand, label: '집기 불가' },
];

type Props = CompositeScreenProps<BottomTabScreenProps<TabParams, 'Map'>, NativeStackScreenProps<RootParams>>;

export function MapScreen({ navigation }: Props) {
  const [layer, setLayer] = useState<'live' | 'heat'>('live');
  const { data, error, reload } = useSavedRouteMap();
  const map = useRef<ParkMapHandle>(null);
  // 경로 설정 · 편집을 마치고 돌아오면 바로 새 경로가 보이게 다시 불러와요.
  useFocusEffect(useCallback(() => reload(), [reload]));

  const routes = useMemo(
    () =>
      data?.routes.map((route, i) => ({
        id: route.robotId ?? `route-${i}`,
        coords: loopOf(route),
        color: ROUTE_COLORS[i % ROUTE_COLORS.length],
      })) ?? [],
    [data],
  );
  const markers = useMemo(
    () => (data ? (layer === 'heat' ? heatMarkers(data.detections) : markersOf(data)) : []),
    [data, layer],
  );
  const hasRoute = !!data?.routes.some((route) => route.points.length > 0);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  // 오류로 멈춘 로봇이 있으면 위 안내를 바꿔요 (A-02 지도 - 로봇 오류)
  const stopped = data?.routes.find((r) => r.status === 'error');

  /** 마커 id → 상세 카드 (A-03) */
  const openMarker = (id: string) => {
    if (!data || layer === 'heat') return;
    if (id.startsWith('detection-')) {
      const detection = data.detections.find((d) => `detection-${d.id}` === id);
      if (detection) setSelection({ kind: 'detection', detection, place: nearestPlace(data, detection.position) });
    } else if (id.startsWith('robot-')) {
      const route = data.routes.find((r, i) => `robot-${r.robotId ?? i}` === id);
      if (route) setSelection({ kind: 'robot', route });
    } else if (id.startsWith('point-')) {
      data.routes.forEach((r, ri) =>
        r.points.forEach((p, i) => {
          if (`point-${ri}-${p.id}` === id)
            setSelection({ kind: 'point', point: p, order: i + 1, robotName: r.robotName });
        }),
      );
    } else if (id.startsWith('station-')) {
      const st = data.stations.find((x) => `station-${x.id}` === id);
      if (st) setSelection({ kind: 'station', name: st.name });
    }
  };

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title={data?.parkName ?? '지도'} onBack={() => navigation.navigate('Home')} />
      <FilterBar>
        <FilterChip label="실시간" selected={layer === 'live'} onPress={() => setLayer('live')} minWidth={104} />
        <FilterChip
          label="히트맵"
          selected={layer === 'heat'}
          onPress={() => {
            setLayer('heat');
            setSelection(null);
          }}
          minWidth={88}
        />
      </FilterBar>

      <View style={s.body}>
        {data ? (
          <ParkMap
            ref={map}
            style={s.map}
            bounds={data.bounds}
            area={data.area}
            routes={layer === 'heat' ? undefined : routes}
            markers={markers}
            onMarkerPress={openMarker}
          />
        ) : (
          <View style={s.map} />
        )}

        {/* 실시간 상태 */}
        <View style={s.liveBadge}>
          <Icon source={icons.radio} size={16} />
          <Text variant="12-semibold" color={stopped && layer === 'live' ? 'error' : 'brandText'}>
            {layer === 'heat'
              ? `최근 7일 · ${data ? formatTime(new Date(data.updatedAt)) : '--:--'} 갱신`
              : stopped
                ? `로봇 오류 · ${stopped.errorSince ? `${formatTime(new Date(stopped.errorSince))}부터 ` : ''}멈춰 있어요`
                : `실시간 · ${data ? formatTime(new Date(data.updatedAt)) : '--:--'} 갱신`}
          </Text>
        </View>

        {/* 불러오기 실패 · 아직 경로 없음 */}
        {error && !data ? (
          <View style={s.notice}>
            <Text variant="13-regular" color="error">
              {error.message}
            </Text>
            <Button label="다시 불러오기" variant="soft" onPress={reload} />
          </View>
        ) : data && !hasRoute ? (
          <View style={s.notice}>
            <Text variant="15-bold">아직 저장된 순찰 경로가 없어요</Text>
            <Text variant="13-regular" color="textSub">
              경로를 정하면 분리수거장과 순찰 지점을 잇는 경로가 지도에 보여요.
            </Text>
            <Button label="경로 정하기" onPress={() => navigation.navigate('RouteSetup')} />
          </View>
        ) : null}

        {/* 지도 조작 */}
        <View style={s.controls}>
          <Pressable
            style={s.controlButton}
            onPress={() => map.current?.recenter()}
            accessibilityRole="button"
            accessibilityLabel="공원 가운데로"
          >
            <Icon source={icons.locateFixed} size={20} />
          </Pressable>
          <Pressable
            style={s.controlButton}
            onPress={() => map.current?.zoomIn()}
            accessibilityRole="button"
            accessibilityLabel="확대"
          >
            <Icon source={icons.plus} size={20} />
          </Pressable>
          <Pressable
            style={s.controlButton}
            onPress={() => map.current?.zoomOut()}
            accessibilityRole="button"
            accessibilityLabel="축소"
          >
            <Icon source={icons.minus} size={20} />
          </Pressable>
        </View>

        {/* 지도 하단 정보 */}
        {selection ? (
          <MapSheet
            selection={selection}
            onClose={() => setSelection(null)}
            onAlerts={() => navigation.navigate('Alerts')}
            onRobotHome={(robotId) => {
              selectRobot(robotId);
              navigation.navigate('Home');
            }}
            onEditRoute={() => navigation.navigate('RouteEdit')}
            onStations={() => navigation.navigate('Stations')}
          />
        ) : layer === 'heat' ? (
          <View style={s.bottomInfo}>
            <View style={s.heatLegend}>
              <Text variant="12-bold">최근 7일 기준 · 탐지 {data?.detections.length ?? 0}건</Text>
              <Text variant="11-regular" color="textSub">
                숫자는 그 근처에서 로봇이 찾은 쓰레기 수예요. 많은 곳일수록 숫자가 커요
              </Text>
            </View>
          </View>
        ) : (
          <View style={s.bottomInfo}>
            <View style={s.legend}>
              {LEGEND.map((l) => (
                <View key={l.label} style={s.legendItem}>
                  <Icon source={l.icon} size={18} />
                  <Text variant="11-regular" color="textSub">
                    {l.label}
                  </Text>
                </View>
              ))}
            </View>
            {hasRoute ? <Button label="경로 편집" onPress={() => navigation.navigate('RouteEdit')} /> : null}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  map: { flex: 1, backgroundColor: colors.map },
  liveBadge: {
    position: 'absolute',
    left: space[16],
    top: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space[12],
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.card,
    ...softShadow,
  },
  controls: { position: 'absolute', right: space[16], top: 68, gap: space[8] },
  controlButton: {
    width: layout.touchMin,
    height: layout.touchMin,
    borderRadius: 14,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...softShadow,
  },
  bottomInfo: { position: 'absolute', left: space[16], right: space[16], bottom: 14, gap: space[12] },
  legend: {
    backgroundColor: colors.card,
    borderRadius: radius[16],
    paddingHorizontal: space[12],
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    ...softShadow,
  },
  legendItem: { alignItems: 'center', gap: 5 },
  heatLegend: {
    backgroundColor: colors.card,
    borderRadius: radius[16],
    padding: space[16],
    gap: 6,
    ...softShadow,
  },
  notice: {
    position: 'absolute',
    left: space[16],
    right: space[16],
    top: 124,
    gap: space[8],
    padding: space[16],
    borderRadius: radius[16],
    backgroundColor: colors.card,
    ...softShadow,
  },
});
