// 분리수거장 API (C-02 분리수거장 관리 · C-03 분리수거장 고르기 · A-02 지도). 서버: server/app/routers/stations.py
import { ApiError, mockFor, mockResponse, request } from './client';
import { getMockSession, saveMockSession } from './mock/onboarding';
import type { LatLng } from './types';

export type Station = { id: string; name: string; position: LatLng };

/** 목업: 경로 설정에서 정한 분리수거장 1곳을 목록처럼 보여 줘요 */
function mockStations(): Station[] {
  const position = getMockSession().station;
  return position ? [{ id: 'station-1', name: '분리수거장', position }] : [];
}

/** GET /stations: 내 공원의 분리수거장 목록 (로봇들이 함께 써요) */
export function getStations(): Promise<Station[]> {
  return mockFor('route') ? mockResponse(mockStations()) : request('/stations');
}

/** POST /stations: 분리수거장 등록 */
export async function createStation(name: string, position: LatLng, catalogId?: string): Promise<Station> {
  if (!mockFor('route'))
    return request('/stations', { method: 'POST', body: JSON.stringify({ catalogId, name, position }) });
  getMockSession().station = position;
  await saveMockSession();
  return mockResponse({ id: 'station-1', name, position });
}

/** PATCH /stations/{id}: 이름 · 위치 수정 */
export async function updateStation(id: string, name: string, position: LatLng, catalogId?: string): Promise<Station> {
  if (!mockFor('route'))
    return request(`/stations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ catalogId, name, position }),
    });
  getMockSession().station = position;
  await saveMockSession();
  return mockResponse({ id, name, position });
}

/** DELETE /stations/{id}: 쓰는 로봇이 있으면 서버가 409로 막아요 */
export async function deleteStation(id: string, catalogId?: string): Promise<void> {
  if (!mockFor('route')) {
    const query = catalogId ? `?catalogId=${encodeURIComponent(catalogId)}` : '';
    await request(`/stations/${encodeURIComponent(id)}${query}`, { method: 'DELETE' });
    return;
  }
  if (!mockStations().some((s) => s.id === id)) throw new ApiError(404, '분리수거장을 찾을 수 없어요', 'not_found');
  getMockSession().station = null;
  await saveMockSession();
}
