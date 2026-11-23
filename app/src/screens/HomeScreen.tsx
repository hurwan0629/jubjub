// A-01 홈 (실시간 현황). 새 규칙(토큰 · Text · 훅 · 공통 컴포넌트)으로 쓴 예시 화면이에요.
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ImageSource } from 'expo-image';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { TaskType } from '@/api/types';
import { AlertCard, Button, Card, Icon, ROBOT_STATE, SectionHeader, StatRow, StatusBadge, Text } from '@/components';
import { RobotControls } from '@/components/RobotControls';
import { useProfile } from '@/hooks/useAccount';
import { useDecisions } from '@/hooks/useDecisions';
import { useNotifications } from '@/hooks/useNotifications';
import { useManagedPark } from '@/hooks/useParkChange';
import { useHomeRobots, useTaskQueue, useTodaySummary } from '@/hooks/useRobot';
import { icons } from '@/icons';
import type { HomeStackParams, RootParams, TabParams } from '@/navigation';
import { colors, layout, radius, softShadow, space } from '@/theme';
import { SLOT_LABEL, SLOT_WARN_PERCENT } from '@/utils/labels';

const TASK_ICON: Record<TaskType, ImageSource> = {
  empty: icons.recycle,
  patrol: icons.route,
  charge: icons.batteryCharging,
  recheck: icons.route,
  visit: icons.route,
  recover: icons.triangleAlert,
};

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
  const [selectedRobotId, setSelectedRobotId] = useState<string>();
  const robot = robots?.find((item) => item.id === selectedRobotId) ?? robots?.[0];
  useFocusEffect(
    useCallback(() => {
      reloadRobots();
      reloadPark();
      reloadProfile();
    }, [reloadRobots, reloadPark, reloadProfile]),
  );
  const { data: tasks } = useTaskQueue();
  const { data: today } = useTodaySummary();
  const { data: notifications } = useNotifications();
  const { data: decisions } = useDecisions({ limit: 3 });

  const unread = notifications?.filter((n) => n.status === 'new') ?? [];
  const latest = unread.find((n) => !n.pinned) ?? unread[0];

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
        <Text variant="24-bold">{'안녕하세요!\n공원 관리자님'}</Text>

        {profile?.routeSetupDone === false && managedPark?.status === 'approved' ? (
          <Button label="새 공원 경로 설정" onPress={() => navigation.navigate('RouteSetup')} />
        ) : null}
        {/* 첨부 시안 순서: 알림 → 로봇 선택 → 선택한 로봇 상태 */}
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
                  onPress={() => setSelectedRobotId(item.id)}
                  style={[s.robotTab, selected ? s.robotTabSelected : null]}
                >
                  {selected ? (
                    <Text variant="13-bold" color="card">
                      ✓
                    </Text>
                  ) : null}
                  <Text variant="13-semibold" color={selected ? 'card' : 'textSub'} numberOfLines={1}>
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
            <Text variant="13-bold" color="brandText">
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
        ) : robots.length === 0 ? (
          <Text variant="13-regular" color="textSub">
            배정된 로봇이 없어요. 총관리자에게 배정을 요청해 주세요.
          </Text>
        ) : null}

        {/* 로봇 상태 카드 */}
        {robot ? (
          <Pressable style={s.robotCard} onPress={() => navigation.navigate('Map')}>
            <View style={s.robotTop}>
              <View style={s.iconCircle44}>
                <Icon source={icons.bot} size={22} />
              </View>
              <View style={s.robotTitle}>
                <Text variant="18-bold">
                  {robot.name}
                  {subjectParticle(robot.name)} {ROBOT_STATE[robot.state].sentence}
                </Text>
                <Text variant="12-regular" color="textSub">
                  공원 수거 로봇 · {robot.activity}
                </Text>
              </View>
            </View>
            <View style={s.robotInfo}>
              <View style={s.gap4}>
                <Text variant="10-regular" color="textSub">
                  {robot.battery == null && robot.batteryVoltage != null ? '배터리 전압' : '배터리'}
                </Text>
                <View style={s.valueUnit}>
                  <Text variant="22-bold">
                    {robot.battery ?? (robot.batteryVoltage != null ? robot.batteryVoltage.toFixed(1) : '—')}
                  </Text>
                  <Text variant="11-regular">
                    {robot.battery != null ? '%' : robot.batteryVoltage != null ? 'V' : ''}
                  </Text>
                </View>
              </View>
              <View style={s.robotRight}>
                <StatusBadge state={robot.state} />
                <Text variant="10-regular" color="textSub">
                  다음 지점 · {robot.nextPoint}
                </Text>
              </View>
            </View>
          </Pressable>
        ) : null}

        {robot ? <RobotControls key={robot.id} robot={robot} onChanged={reloadRobots} /> : null}

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
            <SectionHeader title="칸별 적재율" action="실시간" />
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

        {/* 작업 대기열 */}
        {tasks ? (
          <View style={s.section}>
            <SectionHeader title="작업 대기열" action={`${tasks.length}개 예정`} />
            <Card style={s.taskCard}>
              {tasks.slice(0, 3).map((t) => (
                <View key={t.id} style={s.taskRow}>
                  <Icon source={TASK_ICON[t.type]} size={20} />
                  <Text variant="14-regular" style={s.flex1}>
                    {t.label}
                  </Text>
                  <Text variant="13-semibold" color="brandText">
                    {t.eta}
                  </Text>
                </View>
              ))}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex1: { flex: 1 },
  gap4: { gap: space[4] },
  gap6: { gap: 6 },
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
  robotSelector: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  robotTabs: { flex: 1 },
  robotTabContent: { gap: space[8] },
  robotTab: {
    minHeight: layout.touchMin,
    minWidth: 80,
    maxWidth: 160,
    paddingHorizontal: space[16],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[8],
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  robotTabSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  robotListLink: {
    minHeight: layout.touchMin,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingLeft: space[4],
  },
  robotCard: {
    backgroundColor: colors.card,
    borderRadius: radius[20],
    padding: 18,
    paddingBottom: 34,
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
    backgroundColor: colors.bgBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  robotInfo: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space[12],
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  valueUnit: { flexDirection: 'row', alignItems: 'baseline', gap: space[4] },
  section: { gap: space[12] },
  sectionWide: { gap: space[16] },
  loadCard: { gap: 18 },
  loadItem: { gap: 7 },
  loadRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  loadCount: { width: 67, textAlign: 'right' },
  track: { height: 6, borderRadius: 4, backgroundColor: colors.bgPhoto, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 4 },
  taskCard: { gap: space[16] },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logCard: { flexDirection: 'row', gap: space[12], minHeight: 142 },
  logBody: { flex: 1, gap: space[8] },
});
