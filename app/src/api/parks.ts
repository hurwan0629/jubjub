// 공원 검색 API (C-03 공원 찾기). 서버: server/PARKS.md
import { ApiError, mockFor, mockResponse, request } from './client';
import { getMockSession, saveMockSession } from './mock/onboarding';
import { mockParks } from './mock/parks';
import type { ManagedPark, Park } from './types';

export function getManagedPark(): Promise<ManagedPark> {
  if (!mockFor('park')) return request('/park');
  const park = getMockSession().park;
  if (!park) return Promise.reject(new ApiError(404, '아직 관리 공원을 선택하지 않았어요', 'park_not_found'));
  return mockResponse(park);
}

export async function selectPark(catalogId: string): Promise<ManagedPark> {
  if (!mockFor('park')) return request('/park', { method: 'PUT', body: JSON.stringify({ catalogId }) });
  const session = getMockSession();
  if (session.park?.status === 'approved') throw new ApiError(409, '승인된 공원은 총관리자에게 변경을 요청해 주세요');
  const selected = mockParks.find((p) => p.id === catalogId);
  if (!selected) throw new ApiError(404, '선택한 공원을 찾을 수 없어요');
  const { distance: _distance, ...park } = selected;
  session.park = { ...park, catalogId, status: 'pending', routeSetupDone: false, rejectReason: null };
  session.profile.parkStatus = 'pending';
  session.profile.registrationStatus = 'pending';
  session.profile.routeSetupDone = false;
  session.route = null;
  await saveMockSession();
  return mockResponse(session.park);
}

/** 한 번에 받는 결과 수 (서버 기본값과 같아요) */
export const PARK_PAGE_SIZE = 20;

/**
 * GET /parks?query=&limit=&offset= : 가입 중에도 서울 공원을 이름이나 주소로 찾아요.
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
