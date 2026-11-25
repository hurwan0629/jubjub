// A-13 로봇 목록 · 이름 수정 · 로봇 추가 요청. Figma "2. 홈 · 로봇"의 A-13 시안을 따라요.
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cancelRobotRequest, requestRobots } from '@/api/robotRequests';
import { renamePatrolRobot } from '@/api/route';
import type { HomeRobotStatus, RobotRequest } from '@/api/types';
import { Button, Header, Icon, RobotRequestSheet, ROBOT_STATE, StatusBadge, Text } from '@/components';
import { useManagedPark } from '@/hooks/useParkChange';
import { useHomeRobots } from '@/hooks/useRobot';
import { usePendingRobotRequest } from '@/hooks/useRobotRequests';
import { useRobotRouteSummaries } from '@/hooks/useRoute';
import type { RobotRouteSummary } from '@/hooks/useRoute';
import { selectRobot, useSelectedRobot } from '@/hooks/useSelectedRobot';
import { icons } from '@/icons';
import type { RootParams } from '@/navigation';
import { colors, layout, radius, softShadow, space, typography } from '@/theme';

/** 로봇 이름은 10자 이내로, 같은 공원 안에서 겹치지 않게 (시안 안내) */
const NAME_MAX = 10;
const TOAST_MS = 2500;

function subjectParticle(name: string) {
  const last = name.trim().at(-1) ?? '';
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 ? '이' : '가';
  return /[013678lmnr]/i.test(last) ? '이' : '가';
}

/** "로 · 으로": 받침이 없거나 ㄹ 받침이면 "로" */
function toParticle(name: string) {
  const last = name.trim().at(-1) ?? '';
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return '(으)로';
  const final = (code - 0xac00) % 28;
  return final === 0 || final === 8 ? '로' : '으로';
}

function batteryText(robot: HomeRobotStatus) {
  if (robot.battery != null) return `배터리 ${robot.battery}%`;
  if (robot.batteryVoltage != null) return `배터리 ${robot.batteryVoltage.toFixed(1)}V`;
  return '배터리 수신 대기';
}

type Props = NativeStackScreenProps<RootParams, 'RobotList'>;

export function RobotListScreen({ navigation }: Props) {
  const { data: robots, error, reload } = useHomeRobots();
  const { data: park } = useManagedPark();
  const { data: pending, reload: reloadPending } = usePendingRobotRequest();
  const { data: routes, reload: reloadRoutes } = useRobotRouteSummaries(robots?.map((r) => r.id));
  const selectedId = useSelectedRobot();
  const [editingId, setEditingId] = useState<string>();
  const [requestOpen, setRequestOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState<string>();
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useFocusEffect(
    useCallback(() => {
      reload();
      reloadPending();
      reloadRoutes();
    }, [reload, reloadPending, reloadRoutes]),
  );
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = (text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  };

  const parkName = park?.name ?? '관리 공원';
  const activeId = selectedId ?? robots?.[0]?.id;

  const sendRequest = async (robotCount: number, reason: string) => {
    setBusy(true);
    setRequestError(undefined);
    try {
      await requestRobots({ robotCount, reason });
      setRequestOpen(false);
      reloadPending();
      showToast('로봇 추가를 요청했어요');
    } catch (e) {
      setRequestError(e instanceof Error ? e.message : '요청을 보내지 못했어요. 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  };

  const cancelRequest = async (request: RobotRequest) => {
    setBusy(true);
    setRequestError(undefined);
    try {
      await cancelRobotRequest(request.id);
      reloadPending();
    } catch (e) {
      setRequestError(e instanceof Error ? e.message : '요청을 취소하지 못했어요. 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title="로봇 목록" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text variant="13-regular" color="textSub">
          {parkName} · 로봇 {robots?.length ?? 0}대
        </Text>

        {error ? (
          <>
            <Text variant="13-regular" color="error">
              {error.message}
            </Text>
            <Button label="다시 불러오기" onPress={reload} />
          </>
        ) : !robots ? (
          <Text variant="13-regular" color="textSub">
            로봇을 불러오고 있어요…
          </Text>
        ) : robots.length === 0 ? (
          <Text variant="13-regular" color="textSub">
            아직 배정된 로봇이 없어요. 아래에서 총관리자에게 로봇을 요청할 수 있어요.
          </Text>
        ) : (
          robots.map((robot) => (
            <RobotCard
              key={robot.id}
              robot={robot}
              others={robots.filter((r) => r.id !== robot.id).map((r) => r.name)}
              route={routes?.[robot.id]}
              selected={robot.id === activeId}
              editing={editingId === robot.id}
              onEdit={() => setEditingId(robot.id)}
              onCancelEdit={() => setEditingId(undefined)}
              onRenamed={(name) => {
                setEditingId(undefined);
                reload();
                showToast(`로봇 이름을 ${name}${toParticle(name)} 바꿨어요`);
              }}
              onSelect={() => {
                selectRobot(robot.id);
                navigation.goBack();
              }}
              onRoute={() =>
                routes?.[robot.id]?.points
                  ? navigation.navigate('RouteEdit', { robotId: robot.id })
                  : navigation.navigate('RouteSetup', { robotId: robot.id })
              }
            />
          ))
        )}

        {/* 로봇 추가 요청: 확인 중인 요청이 있으면 그 상태를 보여 줘요 */}
        {pending ? (
          <View style={s.pendingCard}>
            <View style={s.pendingTop}>
              <View style={s.pendingBadge}>
                <Text variant="10-semibold" color="textWarn">
                  확인 중
                </Text>
              </View>
              <Text variant="14-bold" style={s.flex1}>
                로봇 {pending.robotCount}대 {robots?.length ? '추가' : '배정'}를 요청했어요
              </Text>
            </View>
            <Text variant="12-regular" color="textSub">
              총관리자가 확인하면 알림으로 알려 드려요
            </Text>
            <Pressable
              style={s.softButton}
              onPress={() => cancelRequest(pending)}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text variant="15-bold" color="brandText">
                {busy ? '취소하는 중…' : '요청 취소'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={s.softButton}
            onPress={() => setRequestOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="로봇 추가 요청하기"
          >
            <Text variant="15-bold" color="brandText">
              + 로봇 추가 요청하기
            </Text>
          </Pressable>
        )}
        {requestError && !requestOpen ? (
          <Text variant="13-regular" color="error" accessibilityLiveRegion="polite">
            {requestError}
          </Text>
        ) : null}
        <Text variant="12-regular" color="textSub">
          로봇이 더 필요하면 총관리자에게 요청할 수 있어요
        </Text>
        <Text variant="12-regular" color="textSub">
          카드를 누르면 홈이 그 로봇 기준으로 바뀌어요
        </Text>
      </ScrollView>

      {toast ? (
        <View style={s.toast} accessibilityLiveRegion="polite">
          <View style={s.toastDot} />
          <Text variant="13-bold" color="card">
            {toast}
          </Text>
        </View>
      ) : null}

      <RobotRequestSheet
        visible={requestOpen}
        kind="add"
        parkName={parkName}
        currentCount={robots?.length ?? 0}
        sending={busy}
        error={requestOpen ? requestError : undefined}
        onClose={() => {
          setRequestOpen(false);
          setRequestError(undefined);
        }}
        onSubmit={sendRequest}
      />
    </SafeAreaView>
  );
}

type RobotCardProps = {
  robot: HomeRobotStatus;
  others: string[];
  route: RobotRouteSummary | undefined;
  selected: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onRenamed: (name: string) => void;
  onSelect: () => void;
  onRoute: () => void;
};

/** 로봇 카드: 상태 · 배터리 · 순찰 경로 요약. 연필 버튼으로 이름을 바로 고쳐요 (A-13 로봇 편집). */
function RobotCard({
  robot,
  others,
  route,
  selected,
  editing,
  onEdit,
  onCancelEdit,
  onRenamed,
  onSelect,
  onRoute,
}: RobotCardProps) {
  const [name, setName] = useState(robot.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const state = ROBOT_STATE[robot.state];
  const trimmed = name.trim();
  const invalid = !trimmed
    ? '이름을 입력해 주세요'
    : trimmed.length > NAME_MAX
      ? `${NAME_MAX}자 이내로 입력해 주세요`
      : others.includes(trimmed)
        ? '공원 안의 다른 로봇과 이름이 같아요'
        : undefined;

  const cancel = () => {
    setName(robot.name);
    setError(undefined);
    onCancelEdit();
  };

  const save = async () => {
    if (saving) return;
    if (invalid) {
      setError(invalid);
      return;
    }
    if (trimmed === robot.name) {
      cancel();
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const updated = await renamePatrolRobot(robot.id, trimmed);
      onRenamed(updated.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : '이름을 저장하지 못했어요. 다시 시도해 주세요');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[s.card, selected ? s.cardSelected : null]}>
      <Pressable
        style={s.cardBody}
        onPress={editing ? undefined : onSelect}
        disabled={editing}
        accessibilityRole="button"
        accessibilityLabel={`${robot.name} ${state.title}. 홈에서 이 로봇 보기`}
      >
        <View style={s.top}>
          <View style={s.iconCircle}>
            <Icon source={icons.botBrand} size={22} />
          </View>
          <View style={s.titleCol}>
            {editing ? (
              <View style={s.titleRow}>
                <TextInput
                  style={s.nameInput}
                  value={name}
                  onChangeText={(v) => {
                    setName(v);
                    setError(undefined);
                  }}
                  autoFocus
                  maxLength={NAME_MAX}
                  returnKeyType="done"
                  onSubmitEditing={save}
                  accessibilityLabel="로봇 이름"
                />
                <Text variant="18-bold" numberOfLines={1} style={s.flexShrink}>
                  {subjectParticle(trimmed || robot.name)} {state.sentence}
                </Text>
              </View>
            ) : (
              <View style={s.titleRow}>
                <Text variant="18-bold" style={s.flexShrink}>
                  {robot.name}
                  {subjectParticle(robot.name)} {state.sentence}
                </Text>
                <Pressable
                  onPress={onEdit}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`${robot.name} 이름 수정`}
                >
                  <Icon source={icons.editButton} size={28} />
                </Pressable>
              </View>
            )}
            <Text variant="11-regular" color="textSub">
              공원 수거 로봇 · {robot.activity}
            </Text>
          </View>
        </View>

        {editing ? (
          <View style={s.editRow}>
            <Text variant="11-regular" color={error ? 'error' : 'textSub'} style={s.flex1}>
              {error ?? `${NAME_MAX}자 이내 · 공원 안에서 겹치지 않게`}
            </Text>
            <Pressable style={[s.chip, s.chipSoft]} onPress={cancel} disabled={saving} accessibilityRole="button">
              <Text variant="13-semibold">취소</Text>
            </Pressable>
            <Pressable
              style={[s.chip, s.chipBrand]}
              onPress={save}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="이름 저장"
            >
              <Text variant="13-semibold" color="card">
                {saving ? '저장 중' : '저장'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={s.info}>
          <View style={s.gap3}>
            <Text variant="10-regular" color="textSub">
              {robot.battery == null && robot.batteryVoltage != null ? '배터리 전압' : '배터리'}
            </Text>
            <View style={s.valueUnit}>
              <Text variant="22-bold">
                {robot.battery ?? (robot.batteryVoltage != null ? robot.batteryVoltage.toFixed(1) : '—')}
              </Text>
              <Text variant="11-regular" color="textSub">
                {robot.battery != null ? '%' : robot.batteryVoltage != null ? 'V' : ''}
              </Text>
            </View>
          </View>
          <View style={s.right}>
            <StatusBadge state={robot.state} />
            <Text variant="10-regular" color="textSub">
              {robot.name} · {batteryText(robot)}
            </Text>
          </View>
        </View>
      </Pressable>

      {/* 순찰 경로 요약 */}
      <Pressable
        style={s.footer}
        onPress={onRoute}
        accessibilityRole="button"
        accessibilityLabel={route?.points ? `${robot.name} 경로 편집` : `${robot.name} 경로 정하기`}
      >
        <Text variant="12-regular" color="textSub">
          {route == null
            ? '경로를 불러오고 있어요…'
            : route.points
              ? `순찰 지점 ${route.points}곳 · 하루 ${route.slotsPerDay}회`
              : '아직 순찰 경로가 없어요'}
        </Text>
        <Text variant="12-semibold" color="brandText">
          {route?.points ? '경로 편집 ›' : '경로 정하기 ›'}
        </Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space[20],
    paddingBottom: space[24],
    gap: space[12],
  },
  flex1: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  gap3: { gap: 3 },
  // 로봇 카드 (모서리 20 · 선택한 로봇은 브랜드 테두리 2)
  card: {
    backgroundColor: colors.card,
    borderRadius: radius[20],
    borderWidth: 2,
    borderColor: colors.card,
    overflow: 'hidden',
    ...softShadow,
  },
  cardSelected: { borderColor: colors.brand },
  cardBody: { padding: 18, gap: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: { flex: 1, gap: 5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameInput: {
    minWidth: 72,
    maxWidth: 140,
    height: 34,
    borderWidth: 1.5,
    borderColor: colors.brand,
    borderRadius: 8,
    paddingHorizontal: space[8],
    ...typography['18-bold'],
    color: colors.text,
    outlineStyle: 'none',
  } as object,
  editRow: { flexDirection: 'row', alignItems: 'center', gap: space[8] },
  chip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSoft: { backgroundColor: colors.bg },
  chipBrand: { backgroundColor: colors.brand },
  info: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space[12],
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  valueUnit: { flexDirection: 'row', alignItems: 'baseline', gap: space[4] },
  right: { alignItems: 'flex-end', gap: 6 },
  footer: {
    backgroundColor: colors.bg,
    paddingHorizontal: space[20],
    paddingVertical: space[12],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  softButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.bgBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingCard: {
    backgroundColor: colors.card,
    borderRadius: radius[20],
    padding: 18,
    gap: space[8],
    ...softShadow,
  },
  pendingTop: { flexDirection: 'row', alignItems: 'center', gap: space[8] },
  pendingBadge: {
    backgroundColor: colors.bgWarn,
    borderRadius: radius.pill,
    paddingHorizontal: space[8],
    paddingVertical: 3,
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    paddingHorizontal: space[20],
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
  },
  toastDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.done },
});
