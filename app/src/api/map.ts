// 지도 API (A-02 지도)
import { mockResponse, request, mockFor } from './client';
import { mockMapOverview } from './mock/map';
import type { MapOverview } from './types';

/** GET /map/overview: 공원 중심 · 마커 · 순찰 경로. 서버 경로는 API 명세서(KAN-23)가 나오면 맞춰요. */
export function getMapOverview(): Promise<MapOverview> {
  return mockFor('map') ? mockResponse(mockMapOverview) : request('/map/overview');
}
