// 순찰 경로 계산 (C-03 처음 설정 · A-04 경로 편집에서 같이 써요)
import type { LatLng, PatrolPoint, PatrolSlot, ScheduleRepeat } from '@/api/types';

import { formatTime } from './date';
import { distanceMeters } from './geo';

// 로봇 이동 속도 (m/분). 실제 값은 로봇 팀과 맞춰야 해요.
const ROBOT_METERS_PER_MIN = 30;

type PointLike = Pick<PatrolPoint, 'position'>;

/** 한 바퀴: 지점들 → 분리수거장 → 처음 지점 */
export function loopPath(points: PointLike[], station: LatLng | null): LatLng[] {
  if (points.length === 0) return [];
  return [...points.map((p) => p.position), ...(station ? [station] : []), points[0].position];
}

/** 한 바퀴 예상 시간(분): 이동 거리로만 어림해요 */
export function lapMinutes(points: PointLike[], station: LatLng | null) {
  const loop = loopPath(points, station);
  if (loop.length === 0) return 0;
  let meters = 0;
  for (let i = 1; i < loop.length; i++) meters += distanceMeters(loop[i - 1], loop[i]);
  return Math.max(1, Math.round(meters / ROBOT_METERS_PER_MIN));
}

/** 켜진 시간표 중 지금 이후 첫 순찰 시각 (없으면 내일 첫 순찰) */
export function nextPatrolTime(slots: PatrolSlot[], now = new Date()) {
  const on = slots
    .filter((s) => s.on)
    .map((s) => s.time)
    .sort();
  const hhmm = formatTime(now);
  return on.find((t) => t > hhmm) ?? on[0];
}

/** 목록에서 하나를 옮겨요 (끌어서 순서 바꾸기) */
export function moveItem<T>(list: T[], from: number, to: number) {
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export const REPEAT_LABEL: Record<ScheduleRepeat, string> = {
  daily: '매일',
  weekdays: '평일',
  weekends: '주말',
};
