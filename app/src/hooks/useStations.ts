import { getPatrolRobots, getRouteConfig } from '@/api/route';
import { getStations } from '@/api/stations';

import { useApi } from './useApi';

/** 공원 분리수거장 목록 (C-02 관리 · C-03 등록 · 고르기) */
export function useStations() {
  return useApi(() => getStations(), []);
}

/**
 * 분리수거장마다 쓰는 로봇 이름 (C-02 "Jubi 1 사용 중" 배지).
 * 로봇마다 저장된 경로의 기본 분리수거장(defaultStationId)이나 위치로 맞춰요.
 */
export function useStationUsers() {
  return useApi(async () => {
    const robots = await getPatrolRobots();
    const configs = await Promise.all(robots.map((r) => getRouteConfig(r.id).catch(() => null)));
    const users: Record<string, string[]> = {};
    configs.forEach((config, i) => {
      if (!config?.points.length) return;
      const key =
        config.defaultStationId ??
        config.stations?.find(
          (s) => s.position.latitude === config.station?.latitude && s.position.longitude === config.station?.longitude,
        )?.id;
      if (key) users[key] = [...(users[key] ?? []), robots[i].name];
    });
    return { users, positions: configs.map((c, i) => ({ robot: robots[i].name, station: c?.station ?? null })) };
  }, []);
}
