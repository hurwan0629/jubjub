// A-02 지도. 개발용 빌드에서는 네이버 지도, 웹 · Expo Go에서는 도식 지도를 보여 줘요.
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { MapMarkerType } from '@/api/types';
import { Button, FilterBar, FilterChip, Header, Icon, ParkMap, Text } from '@/components';
import type { ParkMapHandle, ParkMapMarkerKind } from '@/components';
import { useMapOverview } from '@/hooks/useMap';
import { icons } from '@/icons';
import type { RootParams, TabParams } from '@/navigation';
import { colors, layout, radius, softShadow, space } from '@/theme';
import { formatTime } from '@/utils/date';

const MARKER_KIND: Record<MapMarkerType, ParkMapMarkerKind> = {
  robot: 'robot',
  station: 'station',
  unpickable: 'unpickable',
};

const LEGEND = [
  { icon: icons.legendBot, label: '로봇' },
  { icon: icons.legendRecycle, label: '분리수거장' },
  { icon: icons.legendHand, label: '집기 불가' },
];

type Props = CompositeScreenProps<BottomTabScreenProps<TabParams, 'Map'>, NativeStackScreenProps<RootParams>>;

export function MapScreen({ navigation }: Props) {
  const [layer, setLayer] = useState<'live' | 'heat'>('live');
  const { data: overview } = useMapOverview();
  const map = useRef<ParkMapHandle>(null);

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title={overview?.parkName ?? '지도'} onBack={() => navigation.navigate('Home')} />
      <FilterBar>
        <FilterChip label="실시간" selected={layer === 'live'} onPress={() => setLayer('live')} minWidth={104} />
        <FilterChip label="히트맵" selected={layer === 'heat'} onPress={() => setLayer('heat')} minWidth={88} />
      </FilterBar>

      <View style={s.body}>
        {overview ? (
          <ParkMap
            ref={map}
            style={s.map}
            bounds={overview.bounds}
            area={overview.area}
            route={overview.route}
            markers={overview.markers.map((m) => ({
              id: m.id,
              kind: MARKER_KIND[m.type],
              position: m.position,
              label: m.label,
            }))}
          />
        ) : (
          <View style={s.map} />
        )}

        {/* 실시간 상태 */}
        <View style={s.liveBadge}>
          <Icon source={icons.radio} size={16} />
          <Text variant="12-semibold" color="brandText">
            실시간 · {overview ? formatTime(new Date(overview.updatedAt)) : '--:--'} 갱신
          </Text>
        </View>

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
          <Button label="경로 편집" onPress={() => navigation.navigate('RouteEdit')} />
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
});
