// 공원 검색 API (C-03 공원 찾기). 서버: server/PARKS.md
import { mockFor, mockResponse, request } from './client';
import { mockParks } from './mock/parks';
import type { Park } from './types';

/** 한 번에 받는 결과 수 (서버 기본값과 같아요) */
export const PARK_PAGE_SIZE = 20;

/**
 * GET /parks?query=&limit=&offset= : 서울 공원을 이름이나 주소로 찾아요 (로그인 필요).
 * 띄어쓰기로 나눈 낱말이 모두 들어간 공원만 찾아요. 검색어가 없으면 빈 목록이에요.
 *   401 · 로그인 만료,  503 · "park_catalog_unavailable" 목록 조회 실패
 */
export function searchParks(query: string, offset = 0): Promise<Park[]> {
  const q = query.trim();
  if (!q) return Promise.resolve([]);

  if (mockFor('parks')) {
    const words = q.split(/\s+/);
    const found = mockParks.filter((p) => words.every((w) => p.name.includes(w) || p.address.includes(w)));
    return mockResponse(found.slice(offset, offset + PARK_PAGE_SIZE), 150);
  }
  return request(`/parks?query=${encodeURIComponent(q)}&limit=${PARK_PAGE_SIZE}&offset=${offset}`);
}
