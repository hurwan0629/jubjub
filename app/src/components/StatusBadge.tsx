import { StyleSheet, View } from 'react-native';

import type { RobotState } from '@/api/types';
import { colors, radius, space, tones } from '@/theme';
import type { Tone } from '@/theme';

import { Text } from './Text';

/**
 * 로봇 상태별 표시 (Figma 구성표/07·08 로봇 상태).
 *   title: 상태 이름   sentence: "Jubi가 ~" 뒤에 붙는 문장   badge: 배지 글자   tone: 배지 색
 */
export const ROBOT_STATE: Record<RobotState, { title: string; sentence: string; badge: string; tone: Tone }> = {
  patrolling: { title: '순찰 중', sentence: '순찰 중이에요', badge: '정상', tone: 'brand' },
  picking: { title: '줍는 중', sentence: '쓰레기를 줍고 있어요', badge: '정상', tone: 'brand' },
  toStation: { title: '분리수거장 이동 중', sentence: '분리수거장으로 가고 있어요', badge: '이동', tone: 'brand' },
  emptying: { title: '비우는 중', sentence: '칸을 비우고 있어요', badge: '처리', tone: 'done' },
  charging: { title: '충전 중', sentence: '충전 중이에요', badge: '충전', tone: 'brand' },
  idle: { title: '대기', sentence: '쉬고 있어요', badge: '준비', tone: 'neutral' },
  teleop: { title: '원격 조종 중', sentence: '원격 조종 중이에요', badge: '조종', tone: 'warn' },
  error: { title: '오류', sentence: '멈췄어요', badge: '확인 필요', tone: 'error' },
  disconnected: { title: '연결 끊김', sentence: '연결이 끊겼어요', badge: '확인 필요', tone: 'error' },
};

type BadgeProps = { label: string; tone?: Tone };

/** 작은 배지. 색만으로 상태를 구분하지 않도록 항상 글자를 함께 써요. */
export function Badge({ label, tone = 'brand' }: BadgeProps) {
  const t = tones[tone];
  return (
    <View style={[s.badge, { backgroundColor: colors[t.bg] }]}>
      <Text variant="10-semibold" color={t.fg}>
        {label}
      </Text>
    </View>
  );
}

/** 로봇 상태 배지. 예) <StatusBadge state={robot.state} /> */
export function StatusBadge({ state }: { state: RobotState }) {
  const info = ROBOT_STATE[state];
  return <Badge label={info.badge} tone={info.tone} />;
}

const s = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: space[8],
    paddingVertical: 3,
  },
});
