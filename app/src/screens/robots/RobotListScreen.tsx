// A-13 로봇 목록. 기준: Figma Page 5 "A-13 로봇 목록" · "A-13: 로봇 편집" · "A-13: 로봇 추가 요청"
// 카드를 누르면 홈이 그 로봇 기준으로 바뀌고, 연필로 이름을 바꾸고, 로봇을 더 요청할 수 있어요.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { renameRobot, requestRobots } from '@/api/robots';
import type { ManagedRobot } from '@/api/types';
import { Badge, Button, Header, Icon, ROBOT_STATE, RobotRequestSheet, Text } from '@/components';
import { useRobotRequest, useRobots, useSelectedRobotId, selectRobot } from '@/hooks/useRobots';
import { useRouteConfig } from '@/hooks/useRoute';
import { icons } from '@/icons';
import type { RootParams } from '@/navigation';
import { colors, layout, radius, softShadow, space, typography } from '@/theme';
import { batteryText, robotActivity, robotTitle, withParticle } from '@/utils/robot';

const NAME_MAX = 10;
const TOAST_MS = 2500;

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요');

export function RobotListScreen({ navigation }: NativeStackScreenProps<RootParams, 'RobotList'>) {
  const { data: robots, reload } = useRobots();
  const { data: request, reload: reloadRequest } = useRobotRequest();
  const { data: route } = useRouteConfig();
  const selectedId = useSelectedRobotId();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [toast, setToast] = useState<string>();
  const [requestSheet, setRequestSheet] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const parkName = route?.parkName ?? '내 공원';
  const currentId = selectedId ?? robots?.[0]?.id;

  const startEdit = (robot: ManagedRobot) => {
    setEditingId(robot.id);
    setDraft(robot.name);
    setError(undefined);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setError(undefined);
  };
  const saveName = async () => {
    const name = draft.trim();
    if (!editingId || !name) return;
    setSaving(true);
    setError(undefined);
    try {
      const saved = await renameRobot(editingId, name);
      setEditingId(null);
      setToast(`로봇 이름을 ${withParticle(saved.name, '으로', '로')} 바꿨어요`);
      reload();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSaving(false);
    }
  };

  const handleOpen = (robot: ManagedRobot) => {
    if (editingId) return;
    selectRobot(robot.id);
    navigation.goBack();
  };

  const handleRequest = async (input: { count: number; memo?: string }) => {
    setSaving(true);
    setError(undefined);
    try {
      await requestRobots(input);
      setRequestSheet(false);
      setToast(`로봇 ${input.count}대를 요청했어요`);
      reloadRequest();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSaving(false);
    }
  };

  const pending = request?.status === 'pending' ? request : null;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title="로봇 목록" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text variant="13-regular" color="textSub">
          {parkName} · 로봇 {robots?.length ?? 0}대
        </Text>

        {robots?.map((robot) => {
          const editing = editingId === robot.id;
          // 웹에서 버튼 안에 버튼이 들어가지 않도록, 카드 누름 영역 · 연필 · 경로 편집을 서로 나란히 둬요.
          const body = (
            <>
              <View style={s.top}>
                <View style={s.iconCircle}>
                  <Icon source={robot.state === 'charging' ? icons.batteryChargingLg : icons.bot} size={22} />
                </View>
                <View style={s.titleArea}>
                  {editing ? (
                    <View style={s.titleRowEdit}>
                      <View style={s.nameBox}>
                        {/* 보이지 않는 글자로 칸 너비를 이름 길이에 맞추고, 입력칸은 그 위에 겹쳐요 */}
                        <Text variant="18-bold" style={s.nameSizer} aria-hidden>
                          {draft || ' '}
                        </Text>
                        <TextInput
                          value={draft}
                          onChangeText={setDraft}
                          maxLength={NAME_MAX}
                          autoFocus
                          returnKeyType="done"
                          onSubmitEditing={saveName}
                          style={s.nameInput}
                          accessibilityLabel="로봇 이름"
                        />
                      </View>
                      <Text variant="18-bold" style={s.flex1} numberOfLines={1}>
                        {robotTitle({ ...robot, name: draft || robot.name }).slice((draft || robot.name).length)}
                      </Text>
                    </View>
                  ) : (
                    <Text variant="18-bold" style={s.titleText}>
                      {robotTitle(robot)}
                    </Text>
                  )}
                  <Text variant="11-regular" color="textSub">
                    공원 수거 로봇 · {robotActivity(robot)}
                  </Text>
                </View>
              </View>

              {editing ? (
                <View style={s.editActions}>
                  <Text variant="11-regular" color={error ? 'error' : 'textSub'} style={s.flex1}>
                    {error ?? `${NAME_MAX}자 이내 · 공원 안에서 겹치지 않게`}
                  </Text>
                  <Pressable
                    style={[s.pill, s.pillCancel]}
                    onPress={cancelEdit}
                    accessibilityRole="button"
                    accessibilityLabel="이름 바꾸기 취소"
                  >
                    <Text variant="12-semibold">취소</Text>
                  </Pressable>
                  <Pressable
                    style={[s.pill, s.pillSave, saving || !draft.trim() ? s.dimmedSoft : null]}
                    onPress={saveName}
                    disabled={saving || !draft.trim()}
                    accessibilityRole="button"
                    accessibilityLabel="이름 저장"
                  >
                    <Text variant="12-semibold" color="card">
                      저장
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={s.info}>
                <View style={s.gap3}>
                  <Text variant="10-regular" color="textSub">
                    {robot.state === 'charging' ? '배터리' : '오늘의 수거량'}
                  </Text>
                  <View style={s.valueUnit}>
                    <Text variant="22-bold">
                      {robot.state === 'charging' ? batteryText(robot) : robot.todayPickups}
                    </Text>
                    <Text variant="11-regular" color="textSub">
                      {robot.state === 'charging' ? '%' : '개 수거'}
                    </Text>
                  </View>
                </View>
                <View style={s.infoRight}>
                  <Badge label={ROBOT_STATE[robot.state].badge} tone={ROBOT_STATE[robot.state].tone} />
                  <Text variant="10-regular" color="textSub">
                    {robot.name} · 배터리 {batteryText(robot)}%
                  </Text>
                </View>
              </View>
            </>
          );

          return (
            <View
              key={robot.id}
              style={[s.card, robot.id === currentId ? s.cardSelected : null, editingId && !editing ? s.dimmed : null]}
            >
              {editing ? (
                <View style={s.cardBody}>{body}</View>
              ) : (
                <Pressable
                  style={s.cardBody}
                  onPress={() => handleOpen(robot)}
                  disabled={!!editingId}
                  accessibilityRole="button"
                  accessibilityLabel={`${robot.name} 보기`}
                >
                  {body}
                </Pressable>
              )}
              {editing ? null : (
                <Pressable
                  style={s.editButton}
                  onPress={() => startEdit(robot)}
                  disabled={!!editingId}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`${robot.name} 이름 바꾸기`}
                >
                  <Icon source={icons.editButton} size={28} />
                </Pressable>
              )}

              <View style={s.routeStrip}>
                <Text variant="12-regular" color="textMuted">
                  순찰 지점 {robot.routePointCount}곳 · 하루 {robot.patrolsPerDay}회
                </Text>
                <Pressable
                  onPress={() => navigation.navigate('RouteEdit')}
                  disabled={!!editingId}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text variant="12-semibold" color="brandText">
                    경로 편집 ›
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        {pending ? (
          <View style={s.pendingBox}>
            <Text variant="13-semibold">로봇 {pending.count}대를 요청했어요</Text>
            <Text variant="12-regular" color="textBody">
              총관리자가 확인하고 있어요. 배정되면 알림으로 알려 드릴게요.
            </Text>
          </View>
        ) : (
          <Button label="+ 로봇 추가 요청하기" variant="soft" onPress={() => setRequestSheet(true)} />
        )}
        <Text variant="12-regular" color="textBody">
          로봇이 더 필요하면 총관리자에게 요청할 수 있어요
        </Text>
        <Text variant="12-regular" color="textSub">
          카드를 누르면 홈이 그 로봇 기준으로 바뀌어요
        </Text>
      </ScrollView>

      {toast ? (
        <View style={s.toastWrap} pointerEvents="none">
          <View style={s.toast} accessibilityLiveRegion="polite">
            <Icon source={icons.toastDone} size={18} />
            <Text variant="13-semibold" color="card">
              {toast}
            </Text>
          </View>
        </View>
      ) : null}

      <RobotRequestSheet
        visible={requestSheet}
        kind="add"
        parkName={parkName}
        sending={saving}
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

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex1: { flex: 1 },
  gap3: { gap: 3 },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space[20], paddingBottom: space[24], gap: space[12] },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius[20],
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.card,
  },
  cardSelected: { borderColor: colors.brand },
  dimmed: { opacity: 0.45 },
  dimmedSoft: { opacity: 0.6 },
  cardBody: { backgroundColor: colors.card, borderRadius: radius[20], padding: 18, gap: 14, ...softShadow },
  top: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleArea: { flex: 1, gap: 5 },
  // 오른쪽 위 연필 버튼(28)과 겹치지 않게 비워 둬요
  titleText: { paddingRight: 34 },
  editButton: { position: 'absolute', top: 17, right: 18 },
  titleRowEdit: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  nameBox: {
    flexShrink: 1,
    backgroundColor: colors.bgBrandSoft,
    borderWidth: 1.5,
    borderColor: colors.brand,
    borderRadius: 8,
    paddingHorizontal: space[8],
    paddingVertical: 2,
  },
  nameSizer: { opacity: 0, minWidth: 24 },
  nameInput: {
    ...typography['18-bold'],
    color: colors.text,
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: space[8],
    right: space[8],
    padding: 0,
    outlineStyle: 'none', // 웹에서 포커스 테두리를 지워요 (칸 테두리가 대신해요)
  } as object,
  editActions: { flexDirection: 'row', alignItems: 'center', gap: space[8] },
  pill: { borderRadius: radius.pill, paddingHorizontal: space[12], paddingVertical: 6 },
  pillCancel: { backgroundColor: colors.bg },
  pillSave: { backgroundColor: colors.brand },
  info: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space[12],
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  valueUnit: { flexDirection: 'row', alignItems: 'baseline', gap: space[4] },
  infoRight: { alignItems: 'flex-end', gap: 6 },
  routeStrip: {
    backgroundColor: colors.bgSubtle,
    paddingHorizontal: space[20],
    paddingVertical: space[12],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pendingBox: { backgroundColor: colors.bgPending, borderRadius: 14, padding: space[16], gap: 6 },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 42, alignItems: 'center' },
  toast: {
    backgroundColor: colors.toast,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: space[12],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
