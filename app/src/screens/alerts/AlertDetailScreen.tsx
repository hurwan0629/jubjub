// A-06 알림 상세 (로봇 오류 · 배터리 부족 · 로봇 배정 · 순찰).
// "A-06 알림: 줍지 못한 쓰레기"(사진 · 처리 완료 · 재확인)는 지금 범위에서 빼서, 그 알림도 확인만 할 수 있어요.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ackNotification, getNotification } from '@/api/notifications';
import type { AppNotification, NotificationType } from '@/api/types';
import { Button, Header, Icon, Text } from '@/components';
import { useApi } from '@/hooks/useApi';
import { icons } from '@/icons';
import type { RootParams } from '@/navigation';
import { colors, layout, radius, space, tones } from '@/theme';
import type { Tone } from '@/theme';
import { NOTIFICATION_TYPE_LABEL } from '@/utils/labels';

type Props = NativeStackScreenProps<RootParams, 'AlertDetail'>;

const TYPE_TONE: Record<NotificationType, Tone> = {
  robotError: 'error',
  unpickable: 'warn',
  lowBattery: 'error',
  patrol: 'warn',
  robotAssignment: 'brand',
  dailyReport: 'brand',
  other: 'neutral',
};

/** 로봇 상태 알림 (위치 보기 + 조치 완료) */
const ROBOT_ALERTS = new Set<NotificationType>(['robotError', 'lowBattery', 'patrol']);

function whenText(n: AppNotification) {
  return n.time.includes(':') && !n.time.includes('월') && !n.time.includes('어제') ? `오늘 ${n.time}` : n.time;
}

export function AlertDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { data: n, error, reload } = useApi(() => getNotification(id), [id]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: Tone }>();

  /** 읽음 처리 후 목록으로 */
  const done = async () => {
    setBusy(true);
    try {
      if (n?.status === 'new') await ackNotification(id);
      navigation.goBack();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : '처리하지 못했어요', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (!n || error) {
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        <Header title="알림 상세" onBack={() => navigation.goBack()} />
        <View style={s.content}>
          <Text variant="13-regular" color={error ? 'error' : 'textSub'}>
            {error?.message ?? '알림을 불러오고 있어요…'}
          </Text>
          {error ? <Button label="다시 불러오기" onPress={reload} /> : null}
        </View>
      </SafeAreaView>
    );
  }

  const tone = tones[TYPE_TONE[n.type]];
  const robotAlert = ROBOT_ALERTS.has(n.type);

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title="알림 상세" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={s.content}>
        {/* 위쪽 그림: 로봇 문제 알림은 빨간 받침, 그 밖은 브랜드 받침 */}
        <View style={[s.visual, { backgroundColor: robotAlert ? colors.bgError : colors.bgBrandSoft }]}>
          <Icon source={icons.botBrand} size={40} />
        </View>

        <View style={s.metaRow}>
          <View style={[s.badge, { backgroundColor: colors[tone.bg] }]}>
            <Text variant="11-semibold" color={tone.fg}>
              {NOTIFICATION_TYPE_LABEL[n.type]}
            </Text>
          </View>
          <Text variant="12-regular" color="textSub">
            {whenText(n)}
          </Text>
        </View>
        <Text variant="22-bold">{n.title}</Text>
        {n.body ? (
          <View style={s.placeRow}>
            <Icon source={icons.mapPin} size={16} />
            <Text variant="13-regular" color="textSub" style={s.flex1}>
              {n.body}
            </Text>
          </View>
        ) : null}
        {n.status !== 'new' ? (
          <Text variant="12-semibold" color="textDone">
            확인했어요
          </Text>
        ) : null}

        {message ? (
          <View style={[s.note, { backgroundColor: colors[tones[message.tone].bg] }]}>
            <Text variant="13-semibold" color={tones[message.tone].fg}>
              {message.text}
            </Text>
          </View>
        ) : null}

        {/* 종류별 행동 */}
        {robotAlert ? (
          <>
            {n.position ? (
              <Button
                label="지도에서 위치 보기"
                variant="soft"
                onPress={() => navigation.navigate('Main', { screen: 'Map' })}
              />
            ) : null}
            <Button label={busy ? '처리 중…' : '조치 완료'} disabled={busy} onPress={done} />
          </>
        ) : (
          <Button label={busy ? '처리 중…' : '확인'} disabled={busy} onPress={done} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex1: { flex: 1 },
  content: { padding: layout.screenPadding, gap: space[12] },
  visual: { height: 160, borderRadius: radius[20], alignItems: 'center', justifyContent: 'center', gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space[4] },
  badge: { borderRadius: radius.pill, paddingHorizontal: space[8], paddingVertical: 3 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  note: { borderRadius: 14, padding: space[12] },
});
