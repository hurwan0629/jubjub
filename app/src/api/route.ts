// 순찰 경로 API (A-04 경로 편집)
import { mockResponse, request, USE_MOCK } from './client';
import { mockRouteConfig } from './mock/route';
import type { RouteConfig } from './types';

/** GET /route : 지금 쓰는 순찰 경로 · 시간표. 서버 경로는 API 명세서(KAN-23)가 나오면 맞춰요. */
export function getRouteConfig(): Promise<RouteConfig> {
  return USE_MOCK ? mockResponse(mockRouteConfig) : request('/route');
}

/** PUT /route : 경로 · 시간표 저장 */
export function saveRouteConfig(config: RouteConfig): Promise<RouteConfig> {
  if (USE_MOCK) {
    Object.assign(mockRouteConfig, structuredClone(config));
    return mockResponse(mockRouteConfig, 300);
  }
  return request('/route', { method: 'PUT', body: JSON.stringify(config) });
}
