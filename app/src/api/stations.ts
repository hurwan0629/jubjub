// 분리수거장 API (C-02 분리수거장 관리 · C-03 분리수거장 등록 · 고르기 · A-02 지도). 서버: server/app/routers/stations.py
import { ApiError, mockFor, mockResponse, request } from './client';
import { getMockSession, saveMockSession } from './mock/onboarding';
import type { LatLng } from './types';

export type Station = { id: string; name: string; position: LatLng };

/** 목업: 세션에 목록으로 기억해요. 예전 목업(1곳만 저장)은 목록 1개로 옮겨요. */
function mockStations(): Station[] {
  const session = getMockSession();
  if (!session.stations) {
    session.stations = session.station ? [{ id: 'station-1', name: '분리수거장', position: session.station }] : [];
  }
  return session.stations;
}

/** 쓰는 로봇이 있는지 (목업: 경로 설정에 저장된 분리수거장 위치와 같은 곳) */
function mockInUse(station: Station) {
  const session = getMockSession();
  const same = (p?: LatLng | null) =>
    !!p && p.latitude === station.position.latitude && p.longitude === station.position.longitude;
  return [session.route, ...Object.values(session.robotRoutes ?? {})].some((r) => same(r?.station));
}

/** GET /stations: 내 공원의 분리수거장 목록 (로봇들이 함께 써요) */
export function getStations(): Promise<Station[]> {
  return mockFor('route') ? mockResponse(mockStations()) : request('/stations');
}

/** POST /stations: 분리수거장 등록 */
export async function createStation(name: string, position: LatLng, catalogId?: string): Promise<Station> {
  if (!mockFor('route'))
    return request('/stations', { method: 'POST', body: JSON.stringify({ catalogId, name, position }) });
  const created = { id: `station-${Date.now()}`, name, position };
  const session = getMockSession();
  session.stations = [...mockStations(), created];
  if (!session.station) session.station = position;
  await saveMockSession();
  return mockResponse(created);
}

/** PATCH /stations/{id}: 이름 · 위치 수정 */
export async function updateStation(id: string, name: string, position: LatLng, catalogId?: string): Promise<Station> {
  if (!mockFor('route'))
    return request(`/stations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ catalogId, name, position }),
    });
  const updated = { id, name, position };
  getMockSession().stations = mockStations().map((s) => (s.id === id ? updated : s));
  await saveMockSession();
  return mockResponse(updated);
}

/** DELETE /stations/{id}: 쓰는 로봇이 있으면 서버가 409 station_in_use로 막아요 */
export async function deleteStation(id: string, catalogId?: string): Promise<void> {
  if (!mockFor('route')) {
    const query = catalogId ? `?catalogId=${encodeURIComponent(catalogId)}` : '';
    await request(`/stations/${encodeURIComponent(id)}${query}`, { method: 'DELETE' });
    return;
  }
  const found = mockStations().find((s) => s.id === id);
  if (!found) throw new ApiError(404, '분리수거장을 찾을 수 없어요', 'not_found');
  if (mockInUse(found))
    throw new ApiError(409, '기본 분리수거장으로 사용 중이에요. 다른 장소를 먼저 선택해 주세요', 'station_in_use');
  getMockSession().stations = mockStations().filter((s) => s.id !== id);
  await saveMockSession();
}
