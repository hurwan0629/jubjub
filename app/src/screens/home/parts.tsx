// A-01 홈 전용 부품: 로봇 칩 · 로봇 상태 카드(순찰 제어 버튼 포함) · 로봇 배정 카드 · 순찰 멈추기 시트
// 기준: Figma Page 5 "A-01 홈: 순찰 멈추기 (시안)", "A-01 홈: 로봇 배정 전"
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { ManagedRobot, ManagedRobotState, PauseMode, RobotRequest } from '@/api/types';
import { BottomSheet, Button, Icon, Text } from '@/components';
import { icons } from '@/icons';
import { colors, layout, radius, softShadow, space } from '@/theme';
import type { ColorName } from '@/theme';
import { batteryText, robotActivity, robotSideNote, robotTitle } from '@/utils/robot';

/* ───────── 로봇 칩 ───────── */

type RobotChipsProps = {
  robots: ManagedRobot[];
  selectedId: string;
  onSelect: (id: string) => void;
  onOpenList: () => void;
};

/** 로봇 선택 줄: 로봇 칩 + "로봇 목록 ›" */
export function RobotChips({ robots, selectedId, onSelect, onOpenList }: RobotChipsProps) {
  return (
    <View style={s.chipRow}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {robots.map((r) => {
          const on = r.id === selectedId;
          return (
            <Pressable
              key={r.id}
              onPress={() => onSelect(r.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[s.chip, { backgroundColor: on ? colors.brand : colors.chipIdle }]}
            >
              {on ? <Icon source={icons.check} size={16} /> : null}
              <Text variant="13-semibold" color={on ? 'card' : 'chipIdleText'} numberOfLines={1}>
                {r.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable onPress={onOpenList} accessibilityRole="button" hitSlop={12}>
        <Text variant="13-semibold" color="brandText">
          로봇 목록 ›
        </Text>
      </Pressable>
    </View>
  );
}

/* ───────── 로봇 상태 카드 ───────── */

type BadgeStyle = { label: string; bg: ColorName; fg: ColorName };

/** 파란(빨간) 카드 위 배지 색 */
const CARD_BADGE: Record<ManagedRobotState, BadgeStyle> = {
  patrolling: { label: '정상', bg: 'onBrandBadge', fg: 'card' },
  charging: { label: '충전', bg: 'onBrandBadge', fg: 'card' },
  paused: { label: '멈춤', bg: 'highlight', fg: 'onHighlight' },
  returning: { label: '복귀 중', bg: 'highlight', fg: 'onHighlight' },
  idle: { label: '대기', bg: 'card', fg: 'brandText' },
  error: { label: '오류', bg: 'bgError', fg: 'errorText' },
  disconnected: { label: '연결 끊김', bg: 'bgError', fg: 'errorText' },
};

const isTrouble = (state: ManagedRobotState) => state === 'error' || state === 'disconnected';

type RobotStatusCardProps = {
  robot: ManagedRobot;
  /** 순찰 중 → 멈추기 시트 열기 */
  onAskPause: () => void;
  /** 돌아가는 중 → 그 자리에서 멈추기 */
  onPauseHere: () => void;
  /** 멈춤 · 대기 → 순찰 시작 */
  onResume: () => void;
  /** 오류 · 연결 끊김 → 알림 보기 */
  onOpenAlerts: () => void;
  /** 명령을 보내는 중이면 버튼을 잠가요 */
  busy?: boolean;
};

/** 로봇 상태 카드 + 순찰 제어 버튼. 순찰 중일 때만 멈추기, 대기 중일 때는 "지금 순찰 시작"이 보여요. */
export function RobotStatusCard({
  robot,
  onAskPause,
  onPauseHere,
  onResume,
  onOpenAlerts,
  busy,
}: RobotStatusCardProps) {
  const trouble = isTrouble(robot.state);
  const badge = CARD_BADGE[robot.state];
  const control = controlFor(robot.state, { onAskPause, onPauseHere, onResume, onOpenAlerts });

  return (
    <View style={[s.statusOuter, trouble ? s.bgError : s.bgBrand, control ? s.statusWithControl : null]}>
      <View style={s.statusCard}>
        <View style={s.statusTop}>
          <View style={[s.iconCircle44, { backgroundColor: trouble ? colors.bgError : colors.highlight }]}>
            <Icon source={trouble ? icons.alertTriangleRed : icons.botOnYellow} size={22} />
          </View>
          <View style={s.statusTitle}>
            <Text variant="18-bold" color="card">
              {robotTitle(robot)}
            </Text>
            <Text variant={trouble ? '11-regular' : '12-regular'} color="card">
              {/* 순찰 · 충전 중에만 "공원 수거 로봇 ·"을 붙여요 (시안: 멈춤 · 대기 · 복귀는 상황 문장만) */}
              {robot.state === 'patrolling' || robot.state === 'charging'
                ? `공원 수거 로봇 · ${robotActivity(robot)}`
                : robotActivity(robot)}
            </Text>
          </View>
        </View>
        <View style={[s.statusInfo, { borderTopColor: trouble ? colors.bgSelected : colors.card }]}>
          <View style={s.gap3}>
            <Text variant="10-regular" color="card">
              배터리
            </Text>
            <View style={s.valueUnit}>
              <Text variant="22-bold" color="card">
                {batteryText(robot)}
              </Text>
              <Text variant="11-regular" color="card">
                %
              </Text>
            </View>
          </View>
          <View style={s.statusRight}>
            <View style={[s.badge, { backgroundColor: colors[badge.bg] }]}>
              <Text variant="10-semibold" color={badge.fg}>
                {badge.label}
              </Text>
            </View>
            <Text variant="10-regular" color="card">
              {robotSideNote(robot)}
            </Text>
          </View>
        </View>
      </View>

      {control ? (
        control.kind === 'alerts' ? (
          <View style={s.alertsArea}>
            <Button label="알림 보기" variant="soft" onPress={control.onPress} />
          </View>
        ) : (
          <View style={s.controlArea}>
            <Pressable
              onPress={control.onPress}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [
                s.controlButton,
                { backgroundColor: control.kind === 'stop' ? colors.onBrandSoft : colors.card },
                { opacity: busy ? 0.6 : pressed ? 0.85 : 1 },
              ]}
            >
              {control.kind === 'stop' ? <PauseGlyph /> : <Icon source={icons.play} size={16} />}
              <Text variant="15-bold" color={control.kind === 'stop' ? 'card' : 'brandText'}>
                {control.label}
              </Text>
            </Pressable>
          </View>
        )
      ) : null}
    </View>
  );
}

type Control = { kind: 'stop' | 'start' | 'alerts'; label: string; onPress: () => void };

function controlFor(
  state: ManagedRobotState,
  h: Pick<RobotStatusCardProps, 'onAskPause' | 'onPauseHere' | 'onResume' | 'onOpenAlerts'>,
): Control | null {
  switch (state) {
    case 'patrolling':
      return { kind: 'stop', label: '순찰 멈추기', onPress: h.onAskPause };
    case 'returning':
      return { kind: 'stop', label: '그 자리에서 멈추기', onPress: h.onPauseHere };
    case 'paused':
      return { kind: 'start', label: '순찰 다시 시작', onPress: h.onResume };
    case 'idle':
      return { kind: 'start', label: '지금 순찰 시작', onPress: h.onResume };
    case 'error':
    case 'disconnected':
      return { kind: 'alerts', label: '알림 보기', onPress: h.onOpenAlerts };
    case 'charging':
      return null;
  }
}

/** 일시정지 아이콘 (Figma "pause": 4 × 12 막대 두 개) */
function PauseGlyph() {
  return (
    <View style={s.pause}>
      <View style={[s.pauseBar, s.pauseLeft]} />
      <View style={[s.pauseBar, s.pauseRight]} />
    </View>
  );
}

/* ───────── 로봇 배정 카드 (배정 전) ───────── */

type AssignCardProps = {
  request: RobotRequest | null;
  onRequest: () => void;
  onCancel: () => void;
  canceling?: boolean;
};

const two = (n: number) => String(n).padStart(2, '0');
const requestedAt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${two(d.getHours())}:${two(d.getMinutes())}`;
};

/** 아직 배정된 로봇이 없을 때: 배정 요청하기 / 요청 확인 중 */
export function AssignCard({ request, onRequest, onCancel, canceling }: AssignCardProps) {
  const pending = request?.status === 'pending' ? request : null;
  return (
    <View style={[s.assignCard, { borderColor: pending ? colors.border : colors.brand }]}>
      <View style={s.statusTop}>
        <View style={[s.iconCircle44, { backgroundColor: colors.bg }]}>
          <Icon source={icons.botGray} size={22} />
        </View>
        <View style={s.statusTitle}>
          {pending ? (
            <View style={[s.badge, s.pendingBadge]}>
              <Text variant="11-semibold" color="textWarn">
                확인 중
              </Text>
            </View>
          ) : null}
          <Text variant="18-bold">{pending ? '로봇 배정을 요청했어요' : '아직 배정된 로봇이 없어요'}</Text>
          <Text variant="11-regular" color="textBody">
            {pending
              ? `${requestedAt(pending.createdAt)} · 총관리자가 확인하고 있어요`
              : '총관리자가 로봇을 배정해야 순찰을 시작할 수 있어요'}
          </Text>
        </View>
      </View>
      <Text variant="11-regular" color="textBody">
        {pending
          ? `배정되면 알림으로 알려 드릴게요. 요청 내용: 로봇 ${pending.count}대`
          : '배정되면 홈에 로봇 카드와 경로 설정 안내가 떠요'}
      </Text>
      {pending ? (
        <Button
          label={canceling ? '취소하는 중…' : '요청 취소'}
          variant="soft"
          onPress={onCancel}
          disabled={canceling}
        />
      ) : (
        <Button label="총관리자에게 배정 요청하기" onPress={onRequest} />
      )}
    </View>
  );
}

/* ───────── 순찰 멈추기 시트 ───────── */

type PatrolStopSheetProps = {
  robot: ManagedRobot | null;
  visible: boolean;
  sending?: boolean;
  onClose: () => void;
  onConfirm: (mode: PauseMode) => void;
};

const OPTIONS: { mode: PauseMode; title: string }[] = [
  { mode: 'stay', title: '그 자리에서 멈추기' },
  { mode: 'return', title: '이번 순찰 끝내고 돌아가기' },
];

/** 잘못 눌러도 바로 멈추지 않게, 멈추는 방법을 고르고 한 번 더 확인해요 */
export function PatrolStopSheet({ robot, visible, sending, onClose, onConfirm }: PatrolStopSheetProps) {
  const [mode, setMode] = useState<PauseMode>('stay');
  if (!robot) return null;

  const where = robot.nextPoint ? `지금 ${robot.nextPoint}으로 가는 중이에요. ` : '지금 순찰 중이에요. ';
  const optionBody: Record<PauseMode, string> = {
    stay: '다시 시작하면 남은 순찰 지점부터 이어서 돌아요',
    return: robot.nextPatrolAt
      ? `분리수거장으로 돌아가 쓰레기를 비우고 다음 순찰(${robot.nextPatrolAt})을 기다려요`
      : '분리수거장으로 돌아가 쓰레기를 비우고 다음 순찰을 기다려요',
  };
  const handleClose = () => {
    setMode('stay');
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      title={`${robot.name} 순찰을 멈출까요?`}
      description={`${where}주운 쓰레기는 적재함에 그대로 있어요.`}
      titleVariant="20-bold"
      descriptionColor="textBody"
      onClose={handleClose}
    >
      {OPTIONS.map((o) => {
        const on = o.mode === mode;
        return (
          <Pressable
            key={o.mode}
            onPress={() => setMode(o.mode)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[s.option, on ? s.optionOn : s.optionOff]}
          >
            <Icon source={on ? icons.radioOn : icons.radioOff} size={20} />
            <View style={s.optionText}>
              <Text variant="15-bold" color={on ? 'brandText' : 'text'}>
                {o.title}
              </Text>
              <Text variant="12-regular" color="textBody">
                {optionBody[o.mode]}
              </Text>
            </View>
          </Pressable>
        );
      })}
      <View style={s.notice}>
        <Text variant="12-regular" color="textBody">
          멈춘 동안에는 다음 순찰 시간이 되어도 자동으로 다시 시작하지 않아요.
        </Text>
      </View>
      <View style={s.sheetActions}>
        <Pressable style={[s.sheetButton, s.sheetCancel]} onPress={handleClose} accessibilityRole="button">
          <Text variant="16-bold" color="brandText">
            취소
          </Text>
        </Pressable>
        <Pressable
          style={[s.sheetButton, s.sheetConfirm, sending ? s.dimmed : null]}
          onPress={() => onConfirm(mode)}
          disabled={sending}
          accessibilityRole="button"
        >
          <Text variant="16-bold" color="card">
            {sending ? '멈추는 중…' : '멈추기'}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  gap3: { gap: 3 },
  // 로봇 칩
  chipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[12] },
  chips: { gap: space[8] },
  chip: {
    height: layout.touchMin,
    minWidth: 78,
    paddingHorizontal: space[16],
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  // 로봇 상태 카드
  statusOuter: { borderRadius: radius[20], ...softShadow },
  statusWithControl: { paddingBottom: space[16] },
  bgBrand: { backgroundColor: colors.brand },
  bgError: { backgroundColor: colors.error },
  statusCard: { padding: 18, gap: 14 },
  statusTop: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  statusTitle: { flex: 1, gap: 5 },
  iconCircle44: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  statusInfo: {
    borderTopWidth: 1,
    paddingTop: space[12],
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  valueUnit: { flexDirection: 'row', alignItems: 'baseline', gap: space[4] },
  statusRight: { alignItems: 'flex-end', gap: 6 },
  badge: { borderRadius: radius.pill, paddingHorizontal: space[8], paddingVertical: 3 },
  controlArea: { paddingHorizontal: 18 },
  alertsArea: { paddingHorizontal: space[16] },
  controlButton: {
    height: layout.touchMin,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[8],
  },
  pause: { width: 16, height: 16 },
  pauseBar: { position: 'absolute', top: 2, width: 4, height: 12, borderRadius: 1.5, backgroundColor: colors.card },
  pauseLeft: { left: 3 },
  pauseRight: { left: 9 },
  // 로봇 배정 카드
  assignCard: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderRadius: radius[20],
    padding: 18,
    gap: 14,
    ...softShadow,
  },
  pendingBadge: { alignSelf: 'flex-start', backgroundColor: colors.bgPending },
  // 순찰 멈추기 시트
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    paddingHorizontal: space[16],
    paddingVertical: 14,
    borderRadius: 14,
  },
  optionOn: { backgroundColor: colors.bgBrandSoft, borderWidth: 1.5, borderColor: colors.brand },
  optionOff: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  optionText: { flex: 1, gap: 3 },
  notice: { backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: space[12], paddingVertical: 10 },
  sheetActions: { flexDirection: 'row', gap: space[8] },
  sheetButton: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetCancel: { backgroundColor: colors.bgBrandSoft },
  sheetConfirm: { backgroundColor: colors.brand },
  dimmed: { opacity: 0.6 },
});
