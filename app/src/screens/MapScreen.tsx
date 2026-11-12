import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, FilterBar, FilterChip, Icon, Header, Txt } from '@/components';
import { icons } from '@/icons';
import type { TabParams } from '@/navigation';
import { colors, radius, softShadow } from '@/theme';

// Figma 지도 원본 크기
const MAP_W = 390;
const MAP_H = 500;

// 지도 좌표(390×500 기준)의 마커
const MARKERS = [
  { id: 'robot', x: 88, y: 76, color: colors.brand, icon: icons.markerBot, label: '로봇' },
  { id: 'recycle', x: 158, y: 234, color: colors.done, icon: icons.markerRecycle, label: '분리수거장' },
  { id: 'hand', x: 280, y: 214, color: colors.error, icon: icons.markerHand, label: '집기 불가' },
];

const LEGEND = [
  { icon: icons.legendBot, label: '로봇' },
  { icon: icons.legendRecycle, label: '분리수거장' },
  { icon: icons.legendHand, label: '집기 불가' },
];

export function MapScreen({ navigation }: BottomTabScreenProps<TabParams, 'Map'>) {
  const [layer, setLayer] = useState<'live' | 'heat'>('live');
  const [zoom, setZoom] = useState(1);
  const { width } = useWindowDimensions();
  const scale = Math.min(width, 480) / MAP_W;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title="한강공원" onBack={() => navigation.navigate('Home')} />
      <FilterBar>
        <FilterChip label="실시간" selected={layer === 'live'} onPress={() => setLayer('live')} minWidth={104} />
        <FilterChip label="히트맵" selected={layer === 'heat'} onPress={() => setLayer('heat')} minWidth={88} />
      </FilterBar>

      <View style={s.body}>
        {/* 한강공원 도식 지도 */}
        <View style={[s.mapClip, { height: MAP_H * scale }]}>
          <View style={{ width: MAP_W * scale, height: MAP_H * scale, transform: [{ scale: zoom }] }}>
            <Icon source={icons.parkMap} width={MAP_W * scale} height={MAP_H * scale} />
            {MARKERS.map((m) => (
              <Pressable
                key={m.id}
                accessibilityLabel={m.label}
                style={[s.marker, { left: m.x * scale, top: m.y * scale, backgroundColor: m.color }]}
              >
                <Icon source={m.icon} size={22} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* 실시간 상태 */}
        <View style={s.liveBadge}>
          <Icon source={icons.radio} size={16} />
          <Txt size={12} weight="semibold" color={colors.brandText}>
            실시간 · 14:08 갱신
          </Txt>
        </View>

        {/* 지도 조작 */}
        <View style={s.controls}>
          <Pressable style={s.controlButton} accessibilityLabel="현재 위치" onPress={() => setZoom(1)}>
            <Icon source={icons.locateFixed} size={20} />
          </Pressable>
          <Pressable
            style={s.controlButton}
            accessibilityLabel="확대"
            onPress={() => setZoom((z) => Math.min(z + 0.25, 2))}
          >
            <Icon source={icons.plus} size={20} />
          </Pressable>
          <Pressable
            style={s.controlButton}
            accessibilityLabel="축소"
            onPress={() => setZoom((z) => Math.max(z - 0.25, 1))}
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
                <Txt size={11} color={colors.textSub}>
                  {l.label}
                </Txt>
              </View>
            ))}
          </View>
          <Button label="경로 편집" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  mapClip: { backgroundColor: colors.map, overflow: 'hidden', alignItems: 'center' },
  marker: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...softShadow,
  },
  liveBadge: {
    position: 'absolute',
    left: 16,
    top: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.card,
    ...softShadow,
  },
  controls: { position: 'absolute', right: 16, top: 68, gap: 8 },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...softShadow,
  },
  bottomInfo: { position: 'absolute', left: 16, right: 16, bottom: 14, gap: 12 },
  legend: {
    backgroundColor: colors.card,
    borderRadius: radius[16],
    paddingHorizontal: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    ...softShadow,
  },
  legendItem: { alignItems: 'center', gap: 5 },
});
