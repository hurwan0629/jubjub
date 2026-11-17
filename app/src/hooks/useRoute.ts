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
