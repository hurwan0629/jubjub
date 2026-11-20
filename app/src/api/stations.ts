// 분리수거장 관리 API (C-02 분리수거장 관리). 서버: server/app/routers/stations.py
import { ApiError, mockFor, mockResponse, request } from './client';
import { mockStations } from './mock/stations';
import type { LatLng, Station } from './types';

/** GET /stations */
export function getStations(): Promise<Station[]> {
  return mockFor('stations') ? mockResponse(mockStations) : request('/stations');
}

/** POST /stations : 분리수거장 추가 */
export function addStation(body: { name: string; position: LatLng }): Promise<Station> {
  if (mockFor('stations')) {
    const station: Station = { id: `s${Date.now()}`, ...body, primary: false, robots: [] };
    mockStations.push(station);
    return mockResponse(station);
  }
  return request('/stations', { method: 'POST', body: JSON.stringify(body) });
}

/** PATCH /stations/{id} : 이름 · 위치 바꾸기 */
export function editStation(id: string, patch: { name?: string; position?: LatLng }): Promise<Station> {
  if (mockFor('stations')) {
    const found = mockStations.find((s) => s.id === id);
    if (!found) return Promise.reject(new ApiError(404, '분리수거장을 찾을 수 없어요', 'station_not_found'));
    Object.assign(found, patch);
    return mockResponse(found);
  }
  return request(`/stations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

/**
 * DELETE /stations/{id}
 *   409 · "station_in_use" : 쓰는 로봇이 있어요 (details에 로봇 목록)
 *   409 · "last_station"   : 마지막 한 곳은 지울 수 없어요
 */
export function deleteStation(id: string): Promise<Station[]> {
  if (mockFor('stations')) {
    const found = mockStations.find((s) => s.id === id);
    if (!found) return Promise.reject(new ApiError(404, '분리수거장을 찾을 수 없어요', 'station_not_found'));
    if (mockStations.length <= 1) {
      return Promise.reject(new ApiError(409, '분리수거장은 한 곳 이상 있어야 해요', 'last_station'));
    }
    if (found.robots.length) {
      return Promise.reject(
        new ApiError(409, '쓰는 로봇이 있어서 지울 수 없어요', 'station_in_use', found.robots as never),
      );
    }
    mockStations.splice(mockStations.indexOf(found), 1);
    if (found.primary) mockStations[0].primary = true;
    return mockResponse(mockStations);
  }
  return request(`/stations/${id}`, { method: 'DELETE' });
}

/** PUT /robots/{id}/station : 로봇이 비우러 갈 분리수거장 정하기 */
export function setRobotStation(robotId: string, stationId: string): Promise<Station[]> {
  if (mockFor('stations')) {
    const robot = mockStations.flatMap((s) => s.robots).find((r) => r.id === robotId);
    mockStations.forEach((s) => (s.robots = s.robots.filter((r) => r.id !== robotId)));
    const target = mockStations.find((s) => s.id === stationId);
    if (target && robot) target.robots.push(robot);
    return mockResponse(mockStations);
  }
  return request(`/robots/${robotId}/station`, { method: 'PUT', body: JSON.stringify({ stationId }) });
}
