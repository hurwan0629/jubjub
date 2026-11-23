// A-02 지도. 웹에서는 OpenStreetMap, 개발용 빌드에서는 네이버 지도, Expo Go에서는 도식 지도를 보여 줘요.
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { LatLng, SavedRobotRoute, SavedRouteMap } from '@/api/types';
import { Button, FilterBar, FilterChip, Header, Icon, ParkMap, Text } from '@/components';
import type { ParkMapHandle, ParkMapMarker } from '@/components';
import { useSavedRouteMap } from '@/hooks/useMap';
import { icons } from '@/icons';
import type { RootParams, TabParams } from '@/navigation';
import { colors, layout, radius, softShadow, space } from '@/theme';
import { formatTime } from '@/utils/date';

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
  return [...stations, ...points, ...robots];
}

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
  const markers = useMemo(() => (data ? markersOf(data) : []), [data]);
  const hasRoute = !!data?.routes.some((route) => route.points.length > 0);

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title={data?.parkName ?? '지도'} onBack={() => navigation.navigate('Home')} />
      <FilterBar>
        <FilterChip label="실시간" selected={layer === 'live'} onPress={() => setLayer('live')} minWidth={104} />
        <FilterChip label="히트맵" selected={layer === 'heat'} onPress={() => setLayer('heat')} minWidth={88} />
      </FilterBar>

      <View style={s.body}>
        {data ? (
          <ParkMap ref={map} style={s.map} bounds={data.bounds} area={data.area} routes={routes} markers={markers} />
        ) : (
          <View style={s.map} />
        )}

        {/* 실시간 상태 */}
        <View style={s.liveBadge}>
          <Icon source={icons.radio} size={16} />
          <Text variant="12-semibold" color="brandText">
            실시간 · {data ? formatTime(new Date(data.updatedAt)) : '--:--'} 갱신
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
