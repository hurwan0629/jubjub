// A-03 지점 상세 · A-03 지점 상세 - 로봇: 지도에서 마커를 누르면 아래에서 올라오는 상세 카드
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { getDetectionPhoto } from '@/api/robotProtocol';
import type { MapDetection, PatrolPoint, SavedRobotRoute } from '@/api/types';
import { Button, Icon, ROBOT_STATE, Text } from '@/components';
import { useApi } from '@/hooks/useApi';
import { icons } from '@/icons';
import { colors, radius, softShadow, space } from '@/theme';
import { formatTime } from '@/utils/date';

/** 로봇 판단 재질 이름 */
export const MATERIAL_LABEL: Record<MapDetection['material'], string> = {
  plastic: '페트',
  can: '캔',
  glass: '유리',
  general: '일반 쓰레기',
};

export type MapSelection =
  | { kind: 'detection'; detection: MapDetection; place: string }
  | { kind: 'robot'; route: SavedRobotRoute }
  | { kind: 'point'; point: PatrolPoint; order: number; robotName: string }
  | { kind: 'station'; name: string };

const ROBOT_STATUS_STATE = {
  working: 'patrolling',
  returning: 'returning',
  emptying: 'emptying',
  idle: 'idle',
  offline: 'disconnected',
  error: 'error',
} as const;

function subjectParticle(name: string) {
  const last = name.trim().at(-1) ?? '';
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 ? '이' : '가';
  return /[013678lmnr]/i.test(last) ? '이' : '가';
}

type Props = {
  selection: MapSelection;
  onClose: () => void;
  onAlerts: () => void;
  onRobotHome: (robotId: string) => void;
  onEditRoute: () => void;
  onStations: () => void;
};

export function MapSheet({ selection, onClose, onAlerts, onRobotHome, onEditRoute, onStations }: Props) {
  return (
    <View style={s.sheet} accessibilityViewIsModal>
      <View style={s.handle} />
      {selection.kind === 'detection' ? (
        <DetectionBody selection={selection} onClose={onClose} onAlerts={onAlerts} />
      ) : selection.kind === 'robot' ? (
        <RobotBody route={selection.route} onClose={onClose} onRobotHome={onRobotHome} />
      ) : selection.kind === 'point' ? (
        <>
          <TitleRow title={selection.point.name} onClose={onClose} />
          <Text variant="13-regular" color="textSub">
            {selection.robotName} 순찰 {selection.order}번째 지점이에요
          </Text>
          <Button label="경로 편집" onPress={onEditRoute} />
        </>
      ) : (
        <>
          <TitleRow title={selection.name} badge="분리수거장" onClose={onClose} />
          <Text variant="13-regular" color="textSub">
            로봇이 순찰을 시작하고 칸을 비우러 돌아오는 곳이에요
          </Text>
          <Button label="분리수거장 관리" variant="soft" onPress={onStations} />
        </>
      )}
    </View>
  );
}

function TitleRow({ title, badge, onClose }: { title: string; badge?: string; onClose: () => void }) {
  return (
    <View style={s.titleRow}>
      <Text variant="20-bold" style={s.flex1} numberOfLines={1}>
        {title}
      </Text>
      {badge ? (
        <View style={s.badge}>
          <Text variant="11-semibold" color="textWarn">
            {badge}
          </Text>
        </View>
      ) : null}
      <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기">
        <Text variant="20-bold" color="textSub">
          ×
        </Text>
      </Pressable>
    </View>
  );
}

/** 집기 불가 쓰레기: 사진 · 재질 · 확신도 · 알림 */
function DetectionBody({
  selection,
  onClose,
  onAlerts,
}: {
  selection: Extract<MapSelection, { kind: 'detection' }>;
  onClose: () => void;
  onAlerts: () => void;
}) {
  const d = selection.detection;
  const { data: photo } = useApi(() => getDetectionPhoto(d.id).catch(() => null), [d.id]);
  return (
    <>
      <TitleRow
        title={selection.place}
        badge={d.pickupResult === 'failed' ? '집기 불가' : undefined}
        onClose={onClose}
      />
      <View style={s.detectRow}>
        <View style={s.photo}>
          {photo?.url ? (
            <Image source={{ uri: photo.url }} style={s.photoImage} contentFit="cover" accessibilityLabel="탐지 사진" />
          ) : (
            <Text variant="11-regular" color="textSub">
              사진 없음
            </Text>
          )}
        </View>
        <View style={s.flex1}>
          <Text variant="11-regular" color="textSub">
            탐지 결과 · 확신도 {Math.round(d.confidence * 100)}%
          </Text>
          <Text variant="25-bold" color="textWarn">
            {MATERIAL_LABEL[d.material]}
          </Text>
          <Text variant="11-regular" color="textSub">
            {d.robotName} · 촬영 {formatTime(new Date(d.detectedAt))}
          </Text>
        </View>
      </View>
      {d.pickupResult === 'failed' ? (
        <View style={s.alertBox}>
          <Text variant="11-semibold" color="brandText">
            알림
          </Text>
          <Text variant="14-bold">줍지 못한 쓰레기가 있어요</Text>
          <Text variant="12-regular" color="textSub">
            {d.failReason ?? '처리하지 못해 관리자님께 알렸어요'}
          </Text>
        </View>
      ) : null}
      <Button label="알림 보기" variant="soft" onPress={onAlerts} />
    </>
  );
}

/** 로봇: 지금 상태 · 배터리 */
function RobotBody({
  route,
  onClose,
  onRobotHome,
}: {
  route: SavedRobotRoute;
  onClose: () => void;
  onRobotHome: (robotId: string) => void;
}) {
  const state = ROBOT_STATE[ROBOT_STATUS_STATE[route.status ?? 'idle']];
  return (
    <>
      <TitleRow title={`${route.robotName}${subjectParticle(route.robotName)} ${state.sentence}`} onClose={onClose} />
      <View style={s.batteryBox}>
        <Icon source={icons.bot} size={22} />
        <View style={s.flex1}>
          <Text variant="20-bold" color="brandText">
            {route.batteryVoltage != null ? `배터리 ${route.batteryVoltage.toFixed(1)}V` : '배터리 수신 대기'}
          </Text>
          <Text variant="12-regular" color="textSub">
            순찰 지점 {route.points.length}곳
            {route.errorSince ? ` · ${formatTime(new Date(route.errorSince))}부터 멈춤` : ''}
          </Text>
        </View>
      </View>
      {route.robotId ? <Button label="홈에서 이 로봇 보기" onPress={() => onRobotHome(route.robotId!)} /> : null}
    </>
  );
}

const s = StyleSheet.create({
  flex1: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: space[20],
    paddingTop: space[8],
    paddingBottom: space[20],
    gap: space[12],
    ...softShadow,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[8] },
  badge: { backgroundColor: colors.bgWarn, borderRadius: radius.pill, paddingHorizontal: space[8], paddingVertical: 3 },
  detectRow: { flexDirection: 'row', gap: space[16], alignItems: 'center' },
  photo: {
    width: 148,
    height: 92,
    borderRadius: 12,
    backgroundColor: colors.bgPhoto,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: { width: '100%', height: '100%' },
  alertBox: { backgroundColor: colors.bgBrandSoft, borderRadius: 14, padding: space[12], gap: 3 },
  actions: { flexDirection: 'row', gap: space[8] },
  batteryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    backgroundColor: colors.bgBrandSoft,
    borderRadius: 14,
    padding: space[16],
  },
});
