// A-01 홈 (실시간 현황). Figma "2. 홈 · 로봇" 시안을 따라요.
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { HomeRobotStatus, RobotState } from '@/api/types';
import { AlertCard, Button, Card, Icon, ROBOT_STATE, SectionHeader, StatRow, Text } from '@/components';
import { useProfile } from '@/hooks/useAccount';
import { useDecisions } from '@/hooks/useDecisions';
import { useNotifications } from '@/hooks/useNotifications';
import { useManagedPark } from '@/hooks/useParkChange';
import { useHomeRobots, useTodaySummary } from '@/hooks/useRobot';
import { usePendingRobotRequest } from '@/hooks/useRobotRequests';
import { useRobotRouteSummaries } from '@/hooks/useRoute';
import { selectRobot, useSelectedRobot } from '@/hooks/useSelectedRobot';
import { icons } from '@/icons';
import type { HomeStackParams, RootParams, TabParams } from '@/navigation';
import { colors, layout, radius, softShadow, space } from '@/theme';
import type { ColorName } from '@/theme';
import { SLOT_LABEL, SLOT_WARN_PERCENT } from '@/utils/labels';

import { NoRobotCard } from './home/NoRobotCard';
import { PatrolControl } from './home/PatrolControl';

/** 로봇 상태 카드를 빨간색으로 보여 주는 상태 (시안: 로봇 오류 · 연결 끊김) */
const ALARM_STATES = new Set<RobotState>(['error', 'disconnected']);

/** 파란 · 빨간 카드 위 상태 배지 색 (시안: 정상 진한 파랑 · 대기 흰색 · 복귀 중 노랑 · 오류 흰색) */
function badgeTone(state: RobotState): { bg: ColorName; fg: ColorName } {
  if (ALARM_STATES.has(state)) return { bg: 'card', fg: 'error' };
  if (state === 'returning') return { bg: 'robotIcon', fg: 'robotIconText' };
  if (state === 'idle') return { bg: 'card', fg: 'brandText' };
  return { bg: 'brandBadge', fg: 'card' };
}

function subjectParticle(name: string) {
  const last = name.trim().at(-1) ?? '';
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 ? '이' : '가';
  return /[013678lmnr]/i.test(last) ? '이' : '가';
}

type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParams, 'HomeMain'>,
  CompositeScreenProps<BottomTabScreenProps<TabParams>, NativeStackScreenProps<RootParams>>
>;

export function HomeScreen({ navigation }: Props) {
  const { data: robots, error: robotError, reload: reloadRobots } = useHomeRobots();
  const { data: managedPark, reload: reloadPark } = useManagedPark();
  const { data: profile, reload: reloadProfile } = useProfile();
  const { data: pending, reload: reloadPending } = usePendingRobotRequest();
  const { data: routes, reload: reloadRoutes } = useRobotRouteSummaries(robots?.map((r) => r.id));
  useFocusEffect(
    useCallback(() => {
      reloadRobots();
      reloadPark();
      reloadProfile();
      reloadPending();
      reloadRoutes();
    }, [reloadRobots, reloadPark, reloadProfile, reloadPending, reloadRoutes]),
  );

  const approved = managedPark?.status === 'approved';
  // A-01 홈 - 로봇 배정 전: 승인됐지만 배정된 로봇이 없어요
  const noRobot = approved && !robotError && robots?.length === 0;
  // 아직 경로가 없는 로봇 (지점 0곳). 경로 요약을 못 불러오면 프로필의 첫 설정 여부로 판단해요.
  const missing =
    robots?.filter((r) => (routes ? routes[r.id]?.points === 0 : profile?.routeSetupDone === false)) ?? [];
  // A-01 홈 - 초기 경로 설정 전: 모든 로봇이 아직 경로가 없으면 경로 설정 카드만 보여요
  const allMissing = approved && !!robots?.length && missing.length === robots.length;
  const startSetup = (robotId: string) => navigation.navigate('RouteSetup', { robotId });

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
          <Text variant="13-semibold">{managedPark?.name ?? '관리 공원'}</Text>
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

        {noRobot ? (
          <NoRobotCard parkName={managedPark?.name ?? '관리 공원'} pending={pending} onChanged={reloadPending} />
        ) : allMissing && robots ? (
          <>
            <RouteSetupCard
              robotName={missing[0].name}
              order={robots.indexOf(missing[0]) + 1}
              total={robots.length}
              onStart={() => startSetup(missing[0].id)}
            />
            <Text variant="11-regular" color="textSub" style={s.center}>
              경로를 정하면 오늘 요약·알림이 여기에 보여요
            </Text>
          </>
        ) : (
          <HomeContent
            navigation={navigation}
            robots={robots}
            robotError={robotError}
            reloadRobots={reloadRobots}
            nextSetup={
              approved && missing[0] && robots
                ? { robot: missing[0], order: robots.indexOf(missing[0]) + 1, total: robots.length }
                : undefined
            }
            onStartSetup={startSetup}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** 경로 설정 카드 (A-01 홈 - 초기 경로 설정 전 · 남은 로봇 경로 설정). 분리수거장부터 정해요. */
function RouteSetupCard({
  robotName,
  order,
  total,
  onStart,
}: {
  robotName: string;
  order: number;
  total: number;
  onStart: () => void;
}) {
  return (
    <View style={s.setupCard}>
      <View style={s.robotTop}>
        <View style={[s.iconCircle44, { backgroundColor: colors.bgBrandSoft }]}>
          <Icon source={icons.botBrand} size={22} />
        </View>
        <View style={s.robotTitle}>
          <Text variant="18-bold">{robotName} 경로를 정해 주세요</Text>
          <Text variant="11-regular" color="textSub">
            아직 순찰 경로가 없어요{total > 1 ? ` · 로봇 ${total}대 중 ${order}번째` : ''}
          </Text>
        </View>
      </View>
      <Text variant="11-regular" color="textSub">
        분리수거장 → 순찰 지점 → 순서 → 시간표를 정하면 순찰을 시작해요
      </Text>
      <Button label="경로 설정 시작하기" icon={icons.play} onPress={onStart} />
    </View>
  );
}

type HomeContentProps = {
  navigation: Props['navigation'];
  robots: HomeRobotStatus[] | undefined;
  robotError: Error | undefined;
  reloadRobots: () => void;
  /** 경로를 정한 로봇이 있고, 아직 경로가 없는 로봇이 남았을 때 (A-01 홈 - 남은 로봇 경로 설정) */
  nextSetup?: { robot: HomeRobotStatus; order: number; total: number };
  onStartSetup: (robotId: string) => void;
};

/** 경로를 정한 뒤의 홈: 알림 → 로봇 선택 → 로봇 상태 → (남은 로봇 경로 설정) → 오늘 요약 → 칸별 적재율 → 에이전트가 방금 한 일 */
function HomeContent({ navigation, robots, robotError, reloadRobots, nextSetup, onStartSetup }: HomeContentProps) {
  // 로봇 목록(A-13)에서 카드를 누르면 홈이 그 로봇 기준으로 바뀌어요
  const selectedRobotId = useSelectedRobot();
  const robot = robots?.find((item) => item.id === selectedRobotId) ?? robots?.[0];
  const { data: today } = useTodaySummary();
  const { data: notifications } = useNotifications();
  const { data: decisions } = useDecisions({ limit: 3 });

  const unread = notifications?.filter((n) => n.status === 'new') ?? [];
  const latest = unread.find((n) => !n.pinned) ?? unread[0];
  const alarm = robot ? ALARM_STATES.has(robot.state) : false;

  return (
    <>
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

      {/* 로봇 선택 줄 */}
      <View style={s.robotSelector}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.robotTabs}
          contentContainerStyle={s.robotTabContent}
          accessibilityRole="tablist"
        >
          {robots?.map((item) => {
            const selected = item.id === robot?.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`${item.name} 선택`}
                onPress={() => selectRobot(item.id)}
                style={[s.robotTab, selected ? s.robotTabSelected : null]}
              >
                {selected ? <Icon source={icons.check} size={16} /> : null}
                <Text variant="13-semibold" color={selected ? 'card' : 'chipText'} numberOfLines={1}>
                  {item.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          style={s.robotListLink}
          accessibilityRole="button"
          accessibilityLabel="로봇 목록 열기"
          onPress={() => navigation.navigate('RobotList')}
        >
          <Text variant="13-semibold" color="brandText">
            로봇 목록 ›
          </Text>
        </Pressable>
      </View>

      {robotError ? (
        <View style={s.section}>
          <Text variant="13-regular" color="error">
            {robotError.message}
          </Text>
          <Button label="로봇 다시 불러오기" onPress={reloadRobots} />
        </View>
      ) : !robots ? (
        <Text variant="13-regular" color="textSub">
          로봇을 불러오고 있어요…
        </Text>
      ) : null}

      {/* 로봇 상태 카드: 평소엔 브랜드 파랑, 오류 · 연결 끊김은 빨강 */}
      {robot ? (
        <Pressable
          style={[s.robotCard, { backgroundColor: alarm ? colors.error : colors.brand }]}
          onPress={() => navigation.navigate('Map')}
          accessibilityRole="button"
          accessibilityLabel={`${robot.name} 상태: ${ROBOT_STATE[robot.state].title}. 지도에서 보기`}
        >
          <View style={s.robotTop}>
            <View style={[s.iconCircle44, { backgroundColor: alarm ? colors.card : colors.robotIcon }]}>
              <Icon source={alarm ? icons.triangleAlert : icons.botOnYellow} size={22} />
            </View>
            <View style={s.robotTitle}>
              <Text variant="18-bold" color="card">
                {robot.name}
                {subjectParticle(robot.name)} {ROBOT_STATE[robot.state].sentence}
              </Text>
              <Text variant="12-regular" color="card">
                공원 수거 로봇 · {robot.activity}
              </Text>
            </View>
          </View>
          <View style={s.robotInfo}>
            <View style={s.gap3}>
              <Text variant="10-regular" color="card">
                {robot.battery == null && robot.batteryVoltage != null ? '배터리 전압' : '배터리'}
              </Text>
              <View style={s.valueUnit}>
                <Text variant="22-bold" color="card">
                  {robot.battery ?? (robot.batteryVoltage != null ? robot.batteryVoltage.toFixed(1) : '—')}
                </Text>
                <Text variant="11-regular" color="card">
                  {robot.battery != null ? '%' : robot.batteryVoltage != null ? 'V' : ''}
                </Text>
              </View>
            </View>
            <View style={s.robotRight}>
              <View style={[s.badge, { backgroundColor: colors[badgeTone(robot.state).bg] }]}>
                <Text variant="10-semibold" color={badgeTone(robot.state).fg}>
                  {ROBOT_STATE[robot.state].badge}
                </Text>
              </View>
              <Text variant="10-regular" color="card">
                다음 지점 · {robot.nextPoint}
              </Text>
            </View>
          </View>
          {robot.state === 'error' ? (
            <Pressable
              style={s.alarmButton}
              onPress={() => navigation.navigate('Alerts')}
              accessibilityRole="button"
              accessibilityLabel="알림 보기"
            >
              <Text variant="15-bold" color="brandText">
                알림 보기
              </Text>
            </Pressable>
          ) : null}
          {/* 순찰 제어: 순찰 중 → 멈추기, 대기 → 지금 순찰 시작, 돌아가는 중 → 그 자리에서 멈추기 */}
          <PatrolControl key={robot.id} robot={robot} onChanged={reloadRobots} />
        </Pressable>
      ) : null}

      {nextSetup ? (
        <RouteSetupCard
          robotName={nextSetup.robot.name}
          order={nextSetup.order}
          total={nextSetup.total}
          onStart={() => onStartSetup(nextSetup.robot.id)}
        />
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

      {/* 칸별 적재율 */}
      {robot?.slots.length ? (
        <View style={s.sectionWide}>
          <SectionHeader title="칸별 적재율" action={robot.state === 'disconnected' ? '마지막 값' : '실시간'} />
          <Card style={s.loadCard}>
            {robot.slots.map((slot) => {
              const warn = slot.percent >= SLOT_WARN_PERCENT;
              return (
                <View key={slot.slot} style={s.loadItem}>
                  <View style={s.loadRow}>
                    <Text variant="14-semibold" style={s.flex1}>
                      {SLOT_LABEL[slot.slot]}
                    </Text>
                    {warn ? <Icon source={icons.triangleAlert} size={13} /> : null}
                    <Text variant="13-bold" color={warn ? 'textWarn' : 'brandText'}>
                      {slot.percent}%
                    </Text>
                    <Text variant="12-regular" color="textSub" style={s.loadCount}>
                      ({slot.count}개)
                    </Text>
                  </View>
                  <View style={s.track}>
                    <View
                      style={[
                        s.fill,
                        { width: `${slot.percent}%`, backgroundColor: warn ? colors.warn : colors.brand },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </Card>
        </View>
      ) : null}

      {/* 에이전트가 방금 한 일 */}
      {decisions ? (
        <View style={s.section}>
          <SectionHeader title="에이전트가 방금 한 일" action="더보기" />
          <Text variant="12-regular" color="textSub">
            최근 판단 {decisions.length}개
          </Text>
          {decisions.map((d) => (
            <Card key={d.id} style={s.logCard}>
              <Icon source={icons.timeline} width={12} height={94} />
              <View style={s.logBody}>
                <Text variant="11-semibold" color="brandText">
                  {d.time}
                </Text>
                <Text variant="15-bold">{d.title}</Text>
                <Text variant="13-regular" color="textSub" lineHeight="loose">
                  {d.details.join('\n')}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex1: { flex: 1 },
  gap3: { gap: 3 },
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
  // 초기 경로 설정 카드 (테두리 브랜드 1.5 · 모서리 20 · 안쪽 18 · 간격 14)
  setupCard: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.brand,
    borderRadius: radius[20],
    padding: 18,
    gap: 14,
    ...softShadow,
  },
  robotSelector: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  robotTabs: { flex: 1 },
  robotTabContent: { gap: space[8] },
  // 로봇 칩 (높이 44 · 최소 너비 78 · 알약 모양)
  robotTab: {
    height: layout.touchMin,
    minWidth: 78,
    maxWidth: 160,
    paddingHorizontal: space[16],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.chip,
  },
  robotTabSelected: { backgroundColor: colors.brand },
  robotListLink: {
    minHeight: layout.touchMin,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingLeft: space[4],
  },
  // 로봇 상태 카드 (모서리 20 · 안쪽 18 · 간격 14)
  robotCard: {
    borderRadius: radius[20],
    padding: 18,
    gap: 14,
    ...softShadow,
  },
  robotTop: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  robotTitle: { flex: 1, gap: 5 },
  robotRight: { alignItems: 'flex-end', gap: 6 },
  iconCircle44: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  robotInfo: {
    borderTopWidth: 1,
    borderTopColor: colors.card,
    paddingTop: space[12],
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  valueUnit: { flexDirection: 'row', alignItems: 'baseline', gap: space[4] },
  badge: { borderRadius: radius.pill, paddingHorizontal: space[8], paddingVertical: 3 },
  alarmButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.bgBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { gap: space[12] },
  sectionWide: { gap: space[16] },
  loadCard: { gap: 18 },
  loadItem: { gap: 7 },
  loadRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  loadCount: { width: 67, textAlign: 'right' },
  track: { height: 6, borderRadius: 4, backgroundColor: colors.bgPhoto, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 4 },
  logCard: { flexDirection: 'row', gap: space[12], minHeight: 142 },
  logBody: { flex: 1, gap: space[8] },
});
