// A-01 홈 (실시간 현황). 기준: Figma Page 5 "A-01 홈: 순찰 멈추기 (시안)" · "A-01 홈: 로봇 배정 전"
// 로봇이 여러 대면 칩으로 골라 보고, 고른 로봇의 순찰을 멈추거나 다시 시작해요.
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { cancelRobotRequest, pausePatrol, requestRobots, resumePatrol } from '@/api/robots';
import type { ManagedRobot, PauseMode } from '@/api/types';
import { AlertCard, Card, Icon, RobotRequestSheet, SectionHeader, StatRow, Text } from '@/components';
import { useDecisions } from '@/hooks/useDecisions';
import { useNotifications } from '@/hooks/useNotifications';
import { useTodaySummary } from '@/hooks/useRobot';
import { selectRobot, useRobotRequest, useRobots, useSelectedRobotId } from '@/hooks/useRobots';
import { useRouteConfig } from '@/hooks/useRoute';
import { icons } from '@/icons';
import type { HomeStackParams, RootParams, TabParams } from '@/navigation';
import { AssignCard, PatrolStopSheet, RobotChips, RobotStatusCard } from '@/screens/home/parts';
import { colors, layout, space } from '@/theme';

type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParams, 'HomeMain'>,
  CompositeScreenProps<BottomTabScreenProps<TabParams>, NativeStackScreenProps<RootParams>>
>;

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요');

export function HomeScreen({ navigation }: Props) {
  const { data: robots, reload: reloadRobots } = useRobots();
  const { data: request, reload: reloadRequest } = useRobotRequest();
  const { data: route } = useRouteConfig();
  const { data: today } = useTodaySummary();
  const { data: notifications } = useNotifications();
  const { data: decisions } = useDecisions({ limit: 3 });
  const selectedId = useSelectedRobotId();

  const [stopSheet, setStopSheet] = useState(false);
  const [requestSheet, setRequestSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const robot: ManagedRobot | undefined = robots?.find((r) => r.id === selectedId) ?? robots?.[0];
  const parkName = route?.parkName ?? '내 공원';
  const unread = notifications?.filter((n) => n.status === 'new') ?? [];
  const latest = unread.find((n) => !n.pinned) ?? unread[0];

  /** 로봇 명령을 보내고 목록을 새로 받아요. 실패하면 이유를 카드 아래에 보여 줘요. */
  const run = async (action: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      after?.();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
      reloadRobots();
    }
  };

  const handlePause = (mode: PauseMode) =>
    robot &&
    run(
      () => pausePatrol(robot.id, mode),
      () => setStopSheet(false),
    );
  const handleResume = () => robot && run(() => resumePatrol(robot.id));
  const handleRequest = (input: { count: number; memo?: string }) =>
    run(
      () => requestRobots(input),
      () => {
        setRequestSheet(false);
        reloadRequest();
      },
    );
  const handleCancelRequest = () => request && run(() => cancelRobotRequest(request.id), reloadRequest);

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      {/* 홈 헤더 */}
      <View style={s.header}>
        <View style={s.gap6}>
          <View style={s.brand}>
            <Icon source={icons.jubjub} size={32} />
            <Text variant="logo" color="brandDeep">
              JUBJUB
            </Text>
          </View>
          <Text variant="13-semibold">{parkName}</Text>
        </View>
        <Pressable
          style={s.iconButton}
          onPress={() => navigation.navigate('Settings')}
          accessibilityRole="button"
          accessibilityLabel="설정"
        >
          <Icon source={icons.settings} size={22} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text variant="24-bold" color="brandDeep">
          {'안녕하세요!\n공원 관리자님'}
        </Text>

        {robots && robots.length === 0 ? (
          // 로봇 배정 전: 배정 요청 카드만 보여요
          <>
            <AssignCard
              request={request ?? null}
              onRequest={() => setRequestSheet(true)}
              onCancel={handleCancelRequest}
              canceling={busy}
            />
            {error ? <ErrorLine message={error} /> : null}
            <Text variant="11-regular" color="textBody" style={s.center}>
              로봇이 배정되면 순찰 현황이 여기에 보여요
            </Text>
          </>
        ) : (
          <>
            {/* 미확인 알림 배너 */}
            {latest ? (
              <AlertCard
                icon={icons.hand}
                tone="error"
                title={`확인 안 한 알림 ${unread.length}개`}
                body={latest.title}
                large
                meta={`${latest.time} · ${latest.place}`}
                unread
                onPress={() => navigation.navigate('Alerts')}
              />
            ) : null}

            {/* 로봇 선택 + 로봇 상태 카드 */}
            {robots && robot ? (
              <>
                <RobotChips
                  robots={robots}
                  selectedId={robot.id}
                  onSelect={selectRobot}
                  onOpenList={() => navigation.navigate('RobotList')}
                />
                <RobotStatusCard
                  robot={robot}
                  busy={busy}
                  onAskPause={() => setStopSheet(true)}
                  onPauseHere={() => handlePause('stay')}
                  onResume={handleResume}
                  onOpenAlerts={() => navigation.navigate('Alerts')}
                />
                {error ? <ErrorLine message={error} /> : null}
              </>
            ) : null}

            {/* 오늘 요약 */}
            {today ? (
              <View style={s.section}>
                <SectionHeader title="오늘 요약" />
                <StatRow
                  items={[
                    { label: '수거', value: `${today.pickups}개` },
                    { label: '분리수거장', value: `${today.stationVisits}회` },
                    { label: '순찰', value: `${today.patrolsDone}/${today.patrolsPlanned}회` },
                  ]}
                />
              </View>
            ) : null}

            {/* 에이전트가 방금 한 일 */}
            {decisions ? (
              <View style={s.section}>
                <SectionHeader
                  title="에이전트가 방금 한 일"
                  action="더보기"
                  onPress={() => navigation.navigate('Report', { screen: 'DecisionLog' })}
                />
                <Text variant="12-regular" color="textBody">
                  최근 판단 {decisions.length}개
                </Text>
                {decisions.map((d) => (
                  <Card
                    key={d.id}
                    style={s.logCard}
                    onPress={() => navigation.navigate('DecisionDetail', { id: d.id })}
                  >
                    <Icon source={icons.timeline} width={12} height={94} />
                    <View style={s.logBody}>
                      <Text variant="11-semibold" color="brandText">
                        {d.time}
                      </Text>
                      <Text variant="15-bold">{d.title}</Text>
                      <Text variant="13-regular" color="textBody" lineHeight="loose">
                        {d.details.join('\n')}
                      </Text>
                    </View>
                  </Card>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <PatrolStopSheet
        robot={robot ?? null}
        visible={stopSheet}
        sending={busy}
        onClose={() => setStopSheet(false)}
        onConfirm={handlePause}
      />
      <RobotRequestSheet
        visible={requestSheet}
        kind="assign"
        parkName={parkName}
        sending={busy}
        error={requestSheet ? error : undefined}
        onClose={() => {
          setRequestSheet(false);
          setError(undefined);
        }}
        onSubmit={handleRequest}
      />
    </SafeAreaView>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <Text variant="12-regular" color="error" accessibilityRole="alert">
      {message}
    </Text>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  gap6: { gap: 6 },
  center: { textAlign: 'center' },
  header: {
    height: 76,
    paddingHorizontal: layout.screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space[8] },
  iconButton: { width: layout.touchMin, height: layout.touchMin, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space[20], paddingBottom: 28, gap: space[24] },
  section: { gap: space[12] },
  logCard: { flexDirection: 'row', gap: space[12], minHeight: 142 },
  logBody: { flex: 1, gap: space[8] },
});
