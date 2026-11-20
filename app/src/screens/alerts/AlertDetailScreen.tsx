// A-06 알림 상세. 기준: Figma Page 5 "A-06 알림: 줍지 못한 쓰레기" · "A-06 알림: 로봇 오류" · "공원 변경 반려"
// 유형마다 보이는 내용과 버튼이 달라요.
//   집기 불가: 사진 · 재질 → 확인 / 처리 완료 표시 / 로봇 재확인 요청 (재확인 요청 · 그대로 있음 · 치워짐 상태)
//   로봇 오류 · 배터리 부족: 일러스트 · 마지막 위치 미니 지도 → 지도에서 위치 보기 / 로봇 복구 완료 · 조치 완료
//   공원 변경 반려: 지금 공원 → 요청한 공원 · 반려 사유 → 확인 / 다른 공원으로 다시 요청
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import type { ImageSource } from 'expo-image';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { ackNotification, recheckNotification, resolveNotification } from '@/api/notifications';
import type { NotificationDetail } from '@/api/types';
import { Button, Header, Icon, Text } from '@/components';
import { useNotificationDetail } from '@/hooks/useNotifications';
import { icons } from '@/icons';
import type { RootParams } from '@/navigation';
import { colors, radius, softShadow, space } from '@/theme';
import type { ColorName } from '@/theme';
import { withParticle } from '@/utils/robot';

type Props = NativeStackScreenProps<RootParams, 'AlertDetail'>;

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요');

export function AlertDetailScreen({ navigation, route }: Props) {
  const { id } = route.params;
  const { data: alert, error: loadError, reload } = useNotificationDetail(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  /** 버튼 행동: 서버에 보내고 상세를 새로 불러요. close면 목록으로 돌아가요. */
  const act = async (action: () => Promise<void>, close = false) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      if (close) navigation.goBack();
      else reload();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const actions: DetailActions = {
    busy,
    ack: () => act(() => ackNotification(id), true),
    resolve: (close = false) => act(() => resolveNotification(id), close),
    recheck: () => act(() => recheckNotification(id)),
    openMap: () => navigation.navigate('Main', { screen: 'Map' }),
    changePark: () => navigation.navigate('ParkChange'),
  };

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title="알림 상세" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={s.content}>
        {alert ? (
          alert.type === 'parkChange' ? (
            <ParkChangeBody alert={alert} actions={actions} />
          ) : alert.type === 'robotError' || alert.type === 'lowBattery' ? (
            <RobotIssueBody alert={alert} actions={actions} />
          ) : (
            <PickupBody alert={alert} actions={actions} />
          )
        ) : loadError ? (
          <Text variant="13-regular" color="textBody">
            {messageOf(loadError)}
          </Text>
        ) : null}
        {error ? (
          <Text variant="12-regular" color="error" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

type DetailActions = {
  busy: boolean;
  ack: () => void;
  resolve: (close?: boolean) => void;
  recheck: () => void;
  openMap: () => void;
  changePark: () => void;
};

type BodyProps = { alert: NotificationDetail; actions: DetailActions };

/* ───────── 집기 불가 (줍지 못한 쓰레기) ───────── */

function PickupBody({ alert, actions }: BodyProps) {
  const label = alert.detection?.label;
  const detection = alert.detection ? `${alert.detection.label} · 확신도 ${alert.detection.confidence}%` : null;
  const recheck = alert.recheck;

  // 재확인했는데 아직 그대로 있어요 → 새 알림으로 다시 떠요
  if (recheck?.status === 'stillThere') {
    return (
      <View style={s.gap16}>
        <Text variant="12-bold" color="error">
          새 알림 · 다시 안 읽음으로 바뀌었어요
        </Text>
        <Text variant="22-bold">
          {label ? `${withParticle(label, '을', '를')} 다시 확인했어요` : '다시 확인했어요'}
        </Text>
        <Text variant="13-regular" color="textBody" lineHeight="relaxed">
          {[alert.place, detection].filter(Boolean).join(' · ')}
        </Text>
        <Photo source={alert.photo} height={100} />
        <Text variant="12-regular" color="textBody">
          처음 촬영했어요 · {alert.time}
        </Text>
        <Photo source={recheck.photo} height={100} />
        {recheck.checkedAt ? (
          <Text variant="12-regular" color="textBody">
            재확인했어요 · {recheck.checkedAt}
          </Text>
        ) : null}
        <NoticeBox tone="warn" title="다시 확인했는데 아직 그대로 있어요" body="관리자님의 현장 확인이 필요해요" />
        <Button label="처리 완료 표시" onPress={() => actions.resolve(true)} disabled={actions.busy} />
      </View>
    );
  }

  // 재확인했더니 치워져 있어요 → 처리 완료
  if (recheck?.status === 'cleared') {
    return (
      <View style={s.gap16}>
        <Photo source={recheck.photo ?? alert.photo} height={150} />
        <Text variant="12-bold" color="textDone">
          처리 완료 · 재확인했어요
        </Text>
        <Text variant="22-bold">치워진 걸 확인했어요</Text>
        <Text variant="13-regular" color="textBody">
          {alert.place}
        </Text>
        <NoticeBox
          tone="done"
          title="치워진 걸 확인했어요. 지도 마커를 지웠어요"
          body={label ? `현장에 ${withParticle(label, '이', '가')} 남아 있지 않아요` : '현장에 남아 있지 않아요'}
        />
        <Button label="확인" onPress={actions.ack} disabled={actions.busy} />
      </View>
    );
  }

  // 재확인을 요청했어요 → 로봇이 갈 때까지 기다려요
  if (recheck?.status === 'requested') {
    const queue = [
      '재확인 요청했어요',
      recheck.queuePosition ? `대기열 ${recheck.queuePosition}번째` : null,
      recheck.eta ? `${recheck.eta} 예정` : null,
    ];
    return (
      <View style={s.gap20}>
        <Photo source={alert.photo} height={150} />
        <Text variant="12-regular" color="textWarn">
          집기 불가 · {alert.happenedAt}
        </Text>
        <Text variant="22-bold">{alert.title}</Text>
        <Text variant="13-regular" color="textBody" lineHeight="relaxed">
          {[alert.place, detection].filter(Boolean).join(' · ')}
        </Text>
        <View style={s.waitBox}>
          <Text variant="15-bold" color="textDisabled">
            {queue.filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
    );
  }

  // 처음 알림
  return (
    <View style={s.gap18}>
      <Photo source={alert.photo} height={220} />
      <View style={s.gap12}>
        <TagRow label="집기 불가" tone="error" time={alert.happenedAt} />
        <Text variant="22-bold">{alert.title}</Text>
        <PlaceRow text={alert.place} />
        {detection ? (
          <Text variant="13-semibold" color="brandText">
            {detection}
          </Text>
        ) : null}
      </View>
      {alert.status === 'resolved' ? (
        <NoticeBox tone="done" title="처리 완료로 표시했어요" body="로봇이 다음 순찰 때 다시 확인해요" />
      ) : (
        <>
          <View style={s.row12}>
            {alert.status === 'new' ? (
              <View style={s.ackButton}>
                <Button label="확인" variant="soft" onPress={actions.ack} disabled={actions.busy} />
              </View>
            ) : null}
            <View style={s.flex1}>
              <Button label="처리 완료 표시" onPress={() => actions.resolve()} disabled={actions.busy} />
            </View>
          </View>
          <Button label="로봇 재확인 요청" variant="soft" onPress={actions.recheck} disabled={actions.busy} />
        </>
      )}
    </View>
  );
}

/* ───────── 로봇 오류 · 배터리 부족 ───────── */

function RobotIssueBody({ alert, actions }: BodyProps) {
  const issue = alert.robotIssue;
  const battery = alert.type === 'lowBattery';
  const lastPlace = issue?.lastPlace ?? alert.place;
  const detail = battery
    ? [
        issue?.battery !== null && issue?.battery !== undefined ? `배터리 ${issue.battery}%` : null,
        issue?.chargerDistanceM ? `충전 위치까지 약 ${issue.chargerDistanceM}m` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : `오류 종류 · ${issue?.kind ?? '확인 필요'}`;

  return (
    <View style={s.gap12}>
      <Image
        source={battery ? icons.artRobotBattery : icons.artRobotError}
        style={[s.art, { height: battery ? 136 : 176 }]}
        contentFit="cover"
        accessibilityLabel={battery ? '배터리가 부족한 로봇 그림' : '뒤집힌 로봇 그림'}
      />
      <View style={s.gap12}>
        <TagRow label={battery ? '배터리 부족' : (issue?.kind ?? '로봇 오류')} tone="error" time={alert.happenedAt} />
        <Text variant="22-bold">{alert.title}</Text>
        <PlaceRow text={issue ? `${lastPlace} · ${issue.since}부터` : alert.place} />
        {detail ? (
          <Text variant="13-semibold" color="brandText">
            {detail}
          </Text>
        ) : null}
      </View>
      <Text variant="12-bold" color="textStrong">
        마지막 위치 · {lastPlace}
      </Text>
      <MiniMap label={lastPlace} />
      {alert.status === 'resolved' ? (
        <NoticeBox tone="done" title="조치를 마쳤어요" body="로봇이 다시 순찰을 이어 가요" />
      ) : (
        <View style={s.gap8}>
          <Button label="지도에서 위치 보기" variant="soft" compact onPress={actions.openMap} />
          <Button
            label={battery ? '조치 완료' : '로봇 복구 완료'}
            compact
            onPress={() => actions.resolve(true)}
            disabled={actions.busy}
          />
        </View>
      )}
    </View>
  );
}

/** 마지막 위치 미니 지도 (Figma "마지막 위치 미니 지도"): 산책로 두 줄 위에 로봇 마커 */
function MiniMap({ label }: { label: string }) {
  return (
    <View style={s.miniMap} accessibilityLabel={`마지막 위치 지도: ${label}`}>
      <View style={[s.walkway, s.walkwayA]}>
        <Icon source={icons.walkwayA} width={95} height={10} />
      </View>
      <View style={[s.walkway, s.walkwayB]}>
        <Icon source={icons.walkwayB} width={106} height={10} />
      </View>
      <Text variant="9-regular" color="mapLabel" style={s.mapLabel}>
        {label}
      </Text>
      <View style={s.robotMarker}>
        <Icon source={icons.markerBot} size={22} />
      </View>
    </View>
  );
}

/* ───────── 공원 변경 반려 · 승인 ───────── */

function ParkChangeBody({ alert, actions }: BodyProps) {
  const change = alert.parkChange;
  if (!change) return null;
  const rejected = change.result === 'rejected';

  return (
    <View style={s.gap14}>
      <View style={s.tagRowLeft}>
        <View style={[s.smallBadge, { backgroundColor: colors.bgOrange }]}>
          <Text variant="12-semibold" color="orangeText">
            공원 변경
          </Text>
        </View>
        <Text variant="12-regular" color="textBody">
          {alert.happenedAt}
        </Text>
      </View>
      <Text variant="22-bold">{alert.title}</Text>
      <Text variant="13-regular" color="textBody">
        {change.requestedOn}에 보낸 요청을 운영 관리자가 확인했어요
      </Text>

      <View style={s.parkCompare}>
        <View style={s.parkColumn}>
          <Text variant="11-medium" color="textBody">
            지금 공원
          </Text>
          <Text variant="15-bold">{change.currentPark}</Text>
          <Text variant="11-regular" color="textBody">
            {rejected ? '그대로 유지' : '관리 끝'}
          </Text>
        </View>
        <Icon source={icons.arrowRight} width={14} height={10} />
        <View style={s.parkColumn}>
          <Text variant="11-medium" color="textBody">
            요청한 공원
          </Text>
          <Text variant="15-bold" color={rejected ? 'orangeText' : 'brandText'}>
            {change.requestedPark}
          </Text>
          <Text variant="11-regular" color="textBody">
            {rejected ? '반려됨' : '승인됨'}
          </Text>
        </View>
      </View>

      {rejected && change.reason ? (
        <View style={s.rejectBox}>
          <View style={s.tagRowLeft}>
            <Text variant="12-semibold" color="rejectText">
              반려 사유
            </Text>
            {change.reasonKind ? (
              <View style={[s.reasonKind]}>
                <Text variant="11-semibold" color="rejectText">
                  {change.reasonKind}
                </Text>
              </View>
            ) : null}
          </View>
          <Text variant="14-regular" lineHeight="relaxed">
            {change.reason}
          </Text>
        </View>
      ) : null}

      <Text variant="13-regular" color="textBody">
        {rejected
          ? `${withParticle(change.currentPark, '과', '와')} ${change.robotNames}는 지금처럼 계속 관리해요.`
          : `이제 ${change.requestedPark}에서 경로를 새로 설정해 주세요.`}
      </Text>

      <View style={s.row10}>
        <View style={s.ackButton}>
          <Button label="확인" variant="soft" onPress={actions.ack} disabled={actions.busy} />
        </View>
        {rejected ? (
          <View style={s.flex1}>
            <Button label="다른 공원으로 다시 요청" onPress={actions.changePark} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* ───────── 공통 부품 ───────── */

function Photo({ source, height }: { source: ImageSource | null; height: number }) {
  if (source) {
    return (
      <Image source={source} style={[s.photo, { height }]} contentFit="cover" accessibilityLabel="로봇 촬영 사진" />
    );
  }
  return (
    <View style={[s.photo, s.photoEmpty, { height }]}>
      <Icon source={icons.camera} size={26} />
      <Text variant="12-regular" color="textDisabled">
        로봇 촬영 사진
      </Text>
    </View>
  );
}

function TagRow({ label, tone, time }: { label: string; tone: 'error'; time: string }) {
  return (
    <View style={s.tagRow}>
      <View style={[s.tag, { backgroundColor: colors.bgError }]}>
        <Text variant="12-semibold" color={tone}>
          {label}
        </Text>
      </View>
      <Text variant="12-regular" color="textBody">
        {time}
      </Text>
    </View>
  );
}

function PlaceRow({ text }: { text: string }) {
  return (
    <View style={s.placeRow}>
      <Icon source={icons.mapPinSub} size={16} />
      <Text variant="13-regular" color="textBody" lineHeight="relaxed">
        {text}
      </Text>
    </View>
  );
}

const NOTICE: Record<'warn' | 'done', { bg: ColorName; fg: ColorName }> = {
  warn: { bg: 'bgWarn', fg: 'textWarn' },
  done: { bg: 'bgDone', fg: 'textDone' },
};

function NoticeBox({ tone, title, body }: { tone: 'warn' | 'done'; title: string; body: string }) {
  const t = NOTICE[tone];
  return (
    <View style={[s.notice, { backgroundColor: colors[t.bg] }]}>
      <Text variant="14-bold" color={t.fg}>
        {title}
      </Text>
      <Text variant="12-regular" color="textBody">
        {body}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[24], paddingTop: space[20], paddingBottom: space[24], gap: space[12] },
  flex1: { flex: 1 },
  gap8: { gap: space[8] },
  gap12: { gap: space[12] },
  gap14: { gap: 14 },
  gap16: { gap: space[16] },
  gap18: { gap: 18 },
  gap20: { gap: space[20] },
  row10: { flexDirection: 'row', gap: 10 },
  row12: { flexDirection: 'row', gap: space[12] },
  ackButton: { width: 96 },
  photo: { width: '100%', borderRadius: radius[16] },
  photoEmpty: { backgroundColor: colors.bgDisabled, alignItems: 'center', justifyContent: 'center', gap: space[8] },
  art: { width: '100%', borderRadius: radius[16] },
  tagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tagRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  smallBadge: { borderRadius: radius.pill, paddingHorizontal: space[8], paddingVertical: 3 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  waitBox: {
    height: 72,
    borderRadius: radius[16],
    backgroundColor: colors.bgDisabled,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[16],
  },
  notice: { borderRadius: radius[16], padding: space[16], gap: space[8] },
  // 미니 지도
  miniMap: {
    height: 120,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.card,
    backgroundColor: colors.map,
    overflow: 'hidden',
  },
  walkway: { position: 'absolute' },
  // Figma 좌표에서 테두리(3)를 뺀 자리예요
  walkwayA: { left: 5, top: 36, transform: [{ rotate: '85deg' }] },
  walkwayB: { left: -7, top: 35, transform: [{ rotate: '12deg' }] },
  mapLabel: { position: 'absolute', left: 3, top: 4 },
  robotMarker: {
    position: 'absolute',
    left: '50%',
    marginLeft: 16,
    top: 38,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: colors.card,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...softShadow,
  },
  // 공원 변경
  parkCompare: {
    backgroundColor: colors.card,
    borderRadius: radius[16],
    padding: space[16],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  parkColumn: { flex: 1, gap: 5 },
  rejectBox: {
    backgroundColor: colors.rejectBg,
    borderRadius: 14,
    paddingHorizontal: space[16],
    paddingVertical: 14,
    gap: 10,
  },
  reasonKind: {
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: space[8],
    paddingVertical: 2,
  },
});
