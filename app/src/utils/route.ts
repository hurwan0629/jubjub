// 순찰 경로 계산 (C-03 처음 설정 · A-04 경로 편집에서 같이 써요)
import type { LatLng, PatrolPoint, PatrolSlot, ScheduleRepeat } from '@/api/types';

import { formatTime } from './date';
import { distanceMeters } from './geo';

// 로봇 이동 속도 (m/분). 실제 값은 로봇 팀과 맞춰야 해요.
const ROBOT_METERS_PER_MIN = 30;

type PointLike = Pick<PatrolPoint, 'position'>;

/** 새 지점은 이미 찍힌 지점(분리수거장 포함)에서 이 거리 안에만 꽂을 수 있어요 */
export const MAX_POINT_GAP_METERS = 1000;

/**
 * 한 바퀴: 분리수거장에서 출발 → 지점들을 순서대로 → 분리수거장으로 돌아와요.
 * 분리수거장을 아직 안 정했으면 처음 지점으로 돌아와요.
 */
export function loopPath(points: PointLike[], station: LatLng | null): LatLng[] {
  if (points.length === 0) return [];
  const path = points.map((p) => p.position);
  return station ? [station, ...path, station] : [...path, path[0]];
}

/**
 * 새로 꽂을 위치가 이미 찍힌 지점(분리수거장 포함) 중 가장 가까운 곳에서 1km를 넘는지.
 * 찍힌 지점이 하나도 없으면 막지 않아요.
 */
export function isTooFar(position: LatLng, existing: LatLng[], maxMeters = MAX_POINT_GAP_METERS) {
  if (existing.length === 0) return false;
  return Math.min(...existing.map((p) => distanceMeters(p, position))) > maxMeters;
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

/** 지도 점선: route(한 개)와 routes(여러 개)를 한 목록으로 합쳐요. 점이 2개 이상인 경로만 그려요. */
export function routeLines(
  route: LatLng[] | undefined,
  routes: { id: string; coords: LatLng[]; color: string }[] | undefined,
  color: string,
) {
  const lines = [...(route ? [{ id: 'route', coords: route, color }] : []), ...(routes ?? [])];
  return lines.filter((line) => line.coords.length > 1);
}
