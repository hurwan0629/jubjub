// 순찰 경로 API (A-04 경로 편집)
import { mockResponse, request, mockFor } from './client';
import { getMockSession, saveMockSession } from './mock/onboarding';
import { mockRouteConfig } from './mock/route';
import type { RouteConfig } from './types';

/** GET /route : 승인된 공원의 순찰 경로 · 시간표. */
export function getRouteConfig(): Promise<RouteConfig> {
  return mockFor('route') ? mockResponse(getMockSession().route ?? mockRouteConfig) : request('/route');
}

/** PUT /route : 경로 · 시간표 저장 */
export async function saveRouteConfig(config: RouteConfig): Promise<RouteConfig> {
  if (mockFor('route')) {
    const session = getMockSession();
    session.route = structuredClone(config);
    session.profile.routeSetupDone = true;
    if (session.park) session.park.routeSetupDone = true;
    await saveMockSession();
    return mockResponse(config, 300);
  }
  const { station, points, schedule } = config;
  return request('/route', { method: 'PUT', body: JSON.stringify({ station, points, schedule }) });
}
