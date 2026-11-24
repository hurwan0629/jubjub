// 지도 API (A-02 지도)
import { mockResponse, request, mockFor } from './client';
import { mockMapOverview } from './mock/map';
import { getPatrolRobots, getRouteConfig } from './route';
import { getStations } from './stations';
import type { MapOverview, RouteConfig, SavedRouteMap } from './types';

/** GET /map/overview: 공원 중심 · 마커 · 순찰 경로. 서버 경로는 API 명세서(KAN-23)가 나오면 맞춰요. */
export function getMapOverview(): Promise<MapOverview> {
  return mockFor('map') ? mockResponse(mockMapOverview) : request('/map/overview');
}

/**
 * A-02 지도: 관리자가 경로 설정에서 저장한 순찰 경로를 로봇마다 불러와요.
 * 경로 API(route)를 그대로 써서, 서버가 켜져 있으면 실제 저장된 경로가 보여요.
 */
export async function getSavedRouteMap(): Promise<SavedRouteMap> {
  const robots = await getPatrolRobots();
  // 로봇 배정 전에도 공원 경로는 정할 수 있어서, 로봇이 없으면 공원 경로 하나만 불러와요.
  const [configs, parkStations] = await Promise.all([
    robots.length ? Promise.all(robots.map((robot) => getRouteConfig(robot.id))) : getRouteConfig().then((c) => [c]),
    // 공원에 등록된 분리수거장 전체 (GET /stations). 못 불러오면 경로에 든 것만 보여요.
    getStations().catch(() => []),
  ]);
  const first = configs[0];
  const stations = new Map<
    string,
    { id: string; name: string; position: SavedRouteMap['stations'][number]['position'] }
  >();
  parkStations.forEach((station) => stations.set(station.id, station));
  configs.forEach((config: RouteConfig, index) => {
    config.stations?.forEach((station) => stations.set(station.id, station));
    if (!config.stations?.length && config.station) {
      stations.set(`station-${index}`, { id: `station-${index}`, name: '분리수거장', position: config.station });
    }
  });
  return {
    parkName: first.parkName,
    bounds: first.bounds,
    area: first.area,
    stations: [...stations.values()],
    routes: configs.map((config, index) => {
      const robot = robots[index];
      return {
        robotId: robot?.id ?? null,
        robotName: robot?.name ?? 'Jubi',
        station: config.station,
        points: config.points,
        position:
          robot && robot.lat != null && robot.lng != null ? { latitude: robot.lat, longitude: robot.lng } : null,
      };
    }),
    updatedAt: new Date().toISOString(),
  };
}
