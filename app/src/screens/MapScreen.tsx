// A-02 지도 · A-03 지점 상세. 기준: Figma Page 5 "A-02 지도" (실시간 · 히트맵 · 로봇 오류) · "A-03 지점 상세"
// 웹에서는 OpenStreetMap, 개발용 빌드에서는 네이버 지도, Expo Go에서는 도식 지도를 보여 줘요.
// 마커를 누르면 지도 아래에 상세가 올라와요: 집기 불가 → 사진 · 재질 · 로봇 보내기, 로봇 → 순찰 상태 · 배터리.
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import type { ImageSource } from 'expo-image';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { photoOf } from '@/api/notifications';
import { sendRobot } from '@/api/robot';
import type { ManagedRobot, MapMarker, MapMarkerType } from '@/api/types';
import { Button, FilterBar, FilterChip, Header, Icon, ParkMap, Text } from '@/components';
import type { ParkMapHandle, ParkMapMarkerKind } from '@/components';
import { useMapOverview } from '@/hooks/useMap';
import { selectRobot, useRobots } from '@/hooks/useRobots';
import { icons } from '@/icons';
import type { RootParams, TabParams } from '@/navigation';
import { colors, layout, radius, softShadow, space } from '@/theme';
import type { ColorName } from '@/theme';
import { formatTime } from '@/utils/date';
import { batteryText, robotActivity, robotTitle } from '@/utils/robot';

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

/** 히트맵 범례 5칸 (적음 → 많음) */
const HEAT_STEPS: ColorName[] = ['bgBrandSoft', 'bgSelected', 'heatMid', 'heatHigh', 'heatTop'];

type Props = CompositeScreenProps<BottomTabScreenProps<TabParams, 'Map'>, NativeStackScreenProps<RootParams>>;

export function MapScreen({ navigation }: Props) {
  const [layer, setLayer] = useState<'live' | 'heat'>('live');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: overview } = useMapOverview();
  const { data: robots = [] } = useRobots();
  const map = useRef<ParkMapHandle>(null);

  const selected = overview?.markers.find((m) => m.id === selectedId) ?? null;
  const troubled = robots.find((r) => r.state === 'error' || r.state === 'disconnected');
  const updated = overview ? formatTime(new Date(overview.updatedAt)) : '--:--';

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title={overview?.parkName ?? '지도'} onBack={() => navigation.navigate('Home')} />
      <FilterBar>
        <FilterChip label="실시간" selected={layer === 'live'} onPress={() => setLayer('live')} minWidth={104} />
        <FilterChip
          label="히트맵"
          selected={layer === 'heat'}
          onPress={() => {
            setLayer('heat');
            setSelectedId(null);
          }}
          minWidth={88}
        />
      </FilterBar>

      <View style={s.body}>
        {overview ? (
          <ParkMap
            ref={map}
            style={s.map}
            bounds={overview.bounds}
            area={overview.area}
            route={overview.route}
            heat={layer === 'heat' ? overview.heat : undefined}
            // 히트맵에서는 로봇만 남겨 어디가 많은지 잘 보이게 해요
            markers={overview.markers
              .filter((m) => layer === 'live' || m.type === 'robot')
              .map((m) => ({ id: m.id, kind: MARKER_KIND[m.type], position: m.position, label: m.label }))}
            onMarkerPress={layer === 'live' ? setSelectedId : undefined}
          />
        ) : (
          <View style={s.map} />
        )}

        {/* 실시간 상태 (로봇 오류면 빨갛게) */}
        <View style={s.liveBadge}>
          <Icon source={troubled && layer === 'live' ? icons.alertTriangleRed : icons.radio} size={16} />
          <Text variant="12-semibold" color={troubled && layer === 'live' ? 'error' : 'brandText'}>
            {layer === 'heat'
              ? `최근 7일 · ${updated} 갱신`
              : troubled
                ? `로봇 오류 · ${troubled.name}이 멈춰 있어요`
                : `실시간 · ${updated} 갱신`}
          </Text>
        </View>

        {/* 지도 조작 */}
        <View style={s.controls}>
          <MapButton icon={icons.locateFixed} label="공원 가운데로" onPress={() => map.current?.recenter()} />
          <MapButton icon={icons.plus} label="확대" onPress={() => map.current?.zoomIn()} />
          <MapButton icon={icons.minus} label="축소" onPress={() => map.current?.zoomOut()} />
        </View>

        {/* 지도 아래: 지점 상세 · 히트맵 범례 · 기본 범례 */}
        <View style={s.bottomInfo}>
          {selected?.type === 'unpickable' ? (
            <PointPanel
              marker={selected}
              onClose={() => setSelectedId(null)}
              onOpenAlert={(id) => navigation.navigate('AlertDetail', { id })}
            />
          ) : selected?.type === 'robot' ? (
            <RobotPanel
              robot={robots.find((r) => r.id === selected.id) ?? robots[0]}
              onClose={() => setSelectedId(null)}
              onLive={(id) => {
                selectRobot(id);
                navigation.navigate('Home', { screen: 'HomeMain' });
              }}
            />
          ) : layer === 'heat' ? (
            <View style={s.heatCard}>
              <Text variant="13-bold">최근 7일 기준</Text>
              <View style={s.heatSteps}>
                {HEAT_STEPS.map((c) => (
                  <View key={c} style={[s.heatStep, { backgroundColor: colors[c] }]} />
                ))}
              </View>
              <View style={s.heatScale}>
                <Text variant="11-regular" color="textBody">
                  적음
                </Text>
                <Text variant="11-regular" color="textBody">
                  많음
                </Text>
              </View>
            </View>
          ) : (
            <>
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
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function MapButton({ icon, label, onPress }: { icon: ImageSource; label: string; onPress: () => void }) {
  return (
    <Pressable style={s.controlButton} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Icon source={icon} size={20} />
    </Pressable>
  );
}

/* ───────── A-03 지점 상세 (집기 불가) ───────── */

function PointPanel({
  marker,
  onClose,
  onOpenAlert,
}: {
  marker: MapMarker;
  onClose: () => void;
  onOpenAlert: (id: string) => void;
}) {
  const d = marker.detail;
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string>();
  const photo = photoOf(d?.photoUrl ?? null);

  const handleSend = async () => {
    setSending(true);
    try {
      await sendRobot(marker.id);
      setMessage('로봇을 보냈어요. 작업 대기열에 넣었어요');
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={s.panel}>
      <View style={s.grabber} />
      <View style={s.panelHead}>
        <Text variant="20-bold" style={s.flex1}>
          {d?.place ?? marker.label}
        </Text>
        <View style={s.warnTag}>
          <Text variant="12-semibold" color="textWarn">
            집기 불가
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기">
          <Text variant="20-bold">✕</Text>
        </Pressable>
      </View>
      {d ? (
        <View style={s.detectRow}>
          {photo ? (
            <Image source={photo} style={s.thumb} contentFit="cover" accessibilityLabel="로봇 촬영 사진" />
          ) : (
            <View style={[s.thumb, s.thumbEmpty]}>
              <Icon source={icons.camera} size={22} />
            </View>
          )}
          <View style={s.detectText}>
            <Text variant="12-regular" color="textBody">
              탐지 결과 · 확신도 {d.confidence}%
            </Text>
            <Text variant="30-bold" color="textWarn">
              {d.material}
            </Text>
            <Text variant="12-regular" color="textBody">
              마지막 촬영 {d.lastSeen}
            </Text>
          </View>
        </View>
      ) : null}
      <View style={s.noticeBox}>
        <Icon source={icons.timelineDot} size={10} />
        <View style={s.noticeText}>
          <Text variant="11-semibold" color="brandText">
            알림
          </Text>
          <Text variant="14-bold">줍지 못한 쓰레기가 있어요</Text>
          <Text variant="13-regular" color="textBody">
            처리하지 못해 관리자님께 알렸어요
          </Text>
        </View>
      </View>
      {message ? (
        <Text variant="12-regular" color="textDone">
          {message}
        </Text>
      ) : null}
      <View style={s.row10}>
        <View style={s.flex1}>
          <Button label={sending ? '보내는 중…' : '로봇 보내기'} onPress={handleSend} disabled={sending} />
        </View>
        <View style={s.flex1}>
          <Button
            label="알림 보기"
            variant="soft"
            onPress={() => d?.notificationId && onOpenAlert(d.notificationId)}
            disabled={!d?.notificationId}
          />
        </View>
      </View>
    </View>
  );
}

/* ───────── A-03 로봇 상세 ───────── */

function RobotPanel({
  robot,
  onClose,
  onLive,
}: {
  robot: ManagedRobot | undefined;
  onClose: () => void;
  onLive: (id: string) => void;
}) {
  if (!robot) return null;
  return (
    <View style={s.panel}>
      <View style={s.panelHead}>
        <Text variant="18-bold" style={s.flex1}>
          {robotTitle(robot)}
        </Text>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기">
          <Text variant="18-bold">✕</Text>
        </Pressable>
      </View>
      <Text variant="13-regular" color="textBody">
        현재 {robotActivity(robot)}
      </Text>
      <View style={s.batteryBox}>
        <Text variant="22-bold" color="brandText">
          배터리 {batteryText(robot)}%
        </Text>
        <Text variant="12-regular" color="textBody">
          {[robot.name, robot.nearPoint].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Button label="실시간 보기 (확장)" onPress={() => onLive(robot.id)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex1: { flex: 1 },
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
  heatCard: { backgroundColor: colors.card, borderRadius: radius[16], padding: space[16], gap: 10, ...softShadow },
  heatSteps: { flexDirection: 'row', gap: 4 },
  heatStep: { flex: 1, height: 10, borderRadius: 4 },
  heatScale: { flexDirection: 'row', justifyContent: 'space-between', width: '60%' },
  // 상세 패널
  panel: { backgroundColor: colors.card, borderRadius: radius[20], padding: space[16], gap: 14, ...softShadow },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: -6,
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  warnTag: { backgroundColor: colors.bgWarn, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  detectRow: { flexDirection: 'row', alignItems: 'center', gap: space[16] },
  thumb: { width: 166, height: 106, borderRadius: 12 },
  thumbEmpty: { backgroundColor: colors.bgDisabled, alignItems: 'center', justifyContent: 'center' },
  detectText: { flex: 1, gap: 6 },
  noticeBox: {
    backgroundColor: colors.bgBrandSoft,
    borderRadius: radius[16],
    padding: space[16],
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[12],
  },
  noticeText: { flex: 1, gap: 6 },
  row10: { flexDirection: 'row', gap: 10 },
  batteryBox: { backgroundColor: colors.bgBrandSoft, borderRadius: radius[16], padding: space[16], gap: space[8] },
});
