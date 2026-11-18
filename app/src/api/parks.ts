// 공원 검색 API (C-03 공원 찾기). 서버: server/PARKS.md
import { ApiError, mockFor, mockResponse, request } from './client';
import { getMockSession, saveMockSession } from './mock/onboarding';
import { mockParks } from './mock/parks';
import type { ManagedPark, Park, ParkChange } from './types';

export function getParkChangeRequests(): Promise<ParkChange[]> {
  if (!mockFor('park')) return request('/park-change-requests');
  return mockResponse(getMockSession().parkChanges ?? []);
}

export async function requestParkChange(catalogId: string, reason: string): Promise<ParkChange> {
  if (!mockFor('park'))
    return request('/park-change-requests', { method: 'POST', body: JSON.stringify({ catalogId, reason }) });
  const session = getMockSession();
  const current = session.park;
  const selected = mockParks.find((p) => p.id === catalogId);
  if (!current || current.status !== 'approved') throw new ApiError(409, '승인된 관리 공원이 필요해요');
  if (session.parkChanges?.some((r) => r.status === 'pending'))
    throw new ApiError(409, '이미 승인 대기 중인 신청이 있어요');
  if (!selected || current.catalogId === catalogId || !reason.trim() || reason.trim().length > 200)
    throw new ApiError(422, '새 공원과 변경 사유를 확인해 주세요');
  const change: ParkChange = {
    id: String(Date.now()),
    parkId: current.id,
    userId: '',
    applicantName: session.profile.name,
    applicantLoginId: '',
    currentCatalogId: current.catalogId,
    currentParkName: current.name,
    requestedCatalogId: catalogId,
    requestedParkName: selected.name,
    requestedParkAddress: selected.address,
    reason: reason.trim(),
    status: 'pending',
    rejectReason: null,
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    conflictingManagerName: null,
  };
  session.parkChanges = [change, ...(session.parkChanges ?? [])];
  await saveMockSession();
  return mockResponse(change);
}

export async function cancelParkChange(id: string): Promise<ParkChange> {
  if (!mockFor('park')) return request(`/park-change-requests/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
  const change = getMockSession().parkChanges?.find((r) => r.id === id);
  if (!change || change.status !== 'pending') throw new ApiError(409, '대기 중인 신청만 취소할 수 있어요');
  change.status = 'cancelled';
  change.reviewedAt = new Date().toISOString();
  await saveMockSession();
  return mockResponse(change);
}

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
