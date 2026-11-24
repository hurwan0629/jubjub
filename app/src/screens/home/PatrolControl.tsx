// A-01 홈 - 순찰 멈추기 버튼 · 순찰 다시 시작 · 지금 순찰 시작 · 그 자리에서 멈추기 (로봇 상태 카드 안)
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { HomeRobotStatus, RobotState } from '@/api/types';
import { Icon, Text } from '@/components';
import { useRobotControl } from '@/hooks/useRobotControl';
import { icons } from '@/icons';
import { colors, space } from '@/theme';

import { StopPatrolSheet } from './StopPatrolSheet';

/** 순찰 중인 상태: 멈추기 버튼을 보여요 */
const PATROLLING = new Set<RobotState>(['patrolling', 'picking', 'toStation']);

/** 흰 막대 두 개로 그린 일시 정지 아이콘 (시안 pause) */
function PauseIcon() {
  return (
    <View style={s.pause}>
      <View style={s.pauseBar} />
      <View style={s.pauseBar} />
    </View>
  );
}

/**
 * 순찰 중이면 "순찰 멈추기"(확인 시트), 대기 중이면 "지금 순찰 시작",
 * 돌아가는 중이면 "그 자리에서 멈추기"를 보여요. 그 밖의 상태(비우는 중 · 오류 · 연결 끊김)에서는 숨겨요.
 */
export function PatrolControl({ robot, onChanged }: { robot: HomeRobotStatus; onChanged: () => void }) {
  const control = useRobotControl(robot.id, onChanged);
  const [confirm, setConfirm] = useState(false);
  const patrolling = PATROLLING.has(robot.state);
  const returning = robot.state === 'returning';
  const idle = robot.state === 'idle';
  if (!patrolling && !returning && !idle) return null;

  return (
    <View style={s.wrap}>
      {idle ? (
        <Pressable
          style={[s.button, s.white]}
          onPress={control.start}
          disabled={control.busy}
          accessibilityRole="button"
          accessibilityLabel={`${robot.name} 지금 순찰 시작`}
        >
          <Icon source={icons.playBrand} size={16} />
          <Text variant="15-bold" color="brandText">
            {control.busy ? '보내는 중…' : '지금 순찰 시작'}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          style={[s.button, s.glass]}
          onPress={() => (patrolling ? setConfirm(true) : control.stop())}
          disabled={control.busy}
          accessibilityRole="button"
          accessibilityLabel={patrolling ? `${robot.name} 순찰 멈추기` : `${robot.name} 그 자리에서 멈추기`}
        >
          <PauseIcon />
          <Text variant="15-bold" color="card">
            {control.busy && !confirm ? '보내는 중…' : patrolling ? '순찰 멈추기' : '그 자리에서 멈추기'}
          </Text>
        </Pressable>
      )}
      {control.message ? (
        <Text variant="11-regular" color="card" accessibilityLiveRegion="polite">
          {control.message}
        </Text>
      ) : null}

      <StopPatrolSheet
        visible={confirm}
        robotName={robot.name}
        activity={robot.activity}
        sending={control.busy}
        onClose={() => setConfirm(false)}
        onStop={async () => {
          await control.stop();
          setConfirm(false);
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: space[8] },
  button: {
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[8],
  },
  white: { backgroundColor: colors.card },
  glass: { backgroundColor: colors.onBrandSoft },
  pause: { width: 16, height: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  pauseBar: { width: 4, height: 12, borderRadius: 1.5, backgroundColor: colors.card },
});
