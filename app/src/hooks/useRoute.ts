import { getPatrolRobot, getPatrolRobots, getRouteConfig } from '@/api/route';

import { useApi } from './useApi';

/** 지금 쓰는 순찰 경로 · 시간표 (A-04 경로 편집) */
export function useRouteConfig(robotId?: string) {
  return useApi(() => getRouteConfig(robotId), [robotId]);
}

export function usePatrolRobots() {
  return useApi(() => getPatrolRobots(), []);
}

export function usePatrolRobot(robotId: string) {
  return useApi(() => getPatrolRobot(robotId), [robotId]);
}

/** 로봇 한 대의 순찰 경로 요약 (A-01 홈 남은 로봇 경로 설정 · A-13 로봇 목록) */
export type RobotRouteSummary = { points: number; slotsPerDay: number };

/**
 * 배정된 로봇마다 저장된 경로를 불러와 요약해요. 지점이 0곳이면 아직 경로를 정하지 않은 로봇이에요.
 * 로봇 목록이 바뀌면(ids) 다시 불러와요.
 */
export function useRobotRouteSummaries(robotIds: string[] | undefined) {
  const key = robotIds?.join(',') ?? '';
  return useApi(async () => {
    const ids = key ? key.split(',') : [];
    if (!ids.length) return {} as Record<string, RobotRouteSummary>;
    const configs = await Promise.all(ids.map((id) => getRouteConfig(id)));
    return Object.fromEntries(
      ids.map((id, i) => [
        id,
        { points: configs[i].points.length, slotsPerDay: configs[i].schedule.filter((slot) => slot.on).length },
      ]),
    ) as Record<string, RobotRouteSummary>;
  }, [key]);
}
