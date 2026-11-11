// 공원 검색 API (C-03 공원 찾기)
import { mockResponse, request, USE_MOCK } from './client';
import { mockParks } from './mock/parks';
import type { Park } from './types';

/** GET /parks?query= : 이름이나 주소로 공원 찾기. 서버 경로는 API 명세서(KAN-23)가 나오면 맞춰요. */
export function searchParks(query: string): Promise<Park[]> {
  const q = query.trim();
  if (!q) return Promise.resolve([]);
  if (USE_MOCK)
    return mockResponse(
      mockParks.filter((p) => p.name.includes(q) || p.address.includes(q)),
      100,
    );
  return request(`/parks?query=${encodeURIComponent(q)}`);
}
