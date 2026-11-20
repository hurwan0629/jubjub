// 계정 · 알림 설정 API (C-02 설정)
import { ApiError, mockFor, mockResponse, request, setAuthToken } from './client';
import { mockNotificationSettings, mockOperationSettings, mockParkChange, mockProfile } from './mock/account';
import { getMockSession } from './mock/onboarding';
import type { NotificationSettings, OperationSettings, ParkChangeRequest, Profile } from './types';

/** GET /me */
export function getProfile(): Promise<Profile> {
  return mockFor('me') ? mockResponse(getMockSession().profile ?? mockProfile) : request('/me');
}

/** GET /settings/notifications */
export function getNotificationSettings(): Promise<NotificationSettings> {
  return mockFor('settings') ? mockResponse(mockNotificationSettings) : request('/settings/notifications');
}

/** PATCH /settings/notifications: 바꾼 항목만 보내요 */
export function updateNotificationSettings(patch: Partial<NotificationSettings>): Promise<NotificationSettings> {
  if (mockFor('settings')) {
    Object.assign(mockNotificationSettings, patch);
    return mockResponse(mockNotificationSettings);
  }
  return request('/settings/notifications', { method: 'PATCH', body: JSON.stringify(patch) });
}

/** GET /settings/operation : A-12 운영 설정 */
export function getOperationSettings(): Promise<OperationSettings> {
  return mockFor('settings') ? mockResponse(mockOperationSettings) : request('/settings/operation');
}

/** PUT /settings/operation */
export function saveOperationSettings(body: OperationSettings): Promise<OperationSettings> {
  if (mockFor('settings')) {
    Object.assign(mockOperationSettings, body);
    return mockResponse(mockOperationSettings);
  }
  return request('/settings/operation', { method: 'PUT', body: JSON.stringify(body) });
}

/** GET /park-change-requests/current : 확인 중인 공원 변경 요청 (없으면 null) */
export function getParkChangeRequest(): Promise<ParkChangeRequest | null> {
  return mockFor('parkChange') ? mockResponse(mockParkChange.current) : request('/park-change-requests/current');
}

/** POST /park-change-requests : 공원 변경 요청 (총관리자가 승인하면 바뀌어요) */
export function requestParkChange(input: {
  catalogId: string;
  parkName: string;
  fromPark: string;
  memo?: string;
}): Promise<ParkChangeRequest> {
  if (mockFor('parkChange')) {
    if (mockParkChange.current) {
      return Promise.reject(new ApiError(409, '이미 확인 중인 공원 변경 요청이 있어요', 'park_change_exists'));
    }
    mockParkChange.current = {
      id: `p${Date.now()}`,
      fromPark: input.fromPark,
      toPark: input.parkName,
      toCatalogId: input.catalogId,
      memo: input.memo ?? null,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    return mockResponse(mockParkChange.current);
  }
  return request('/park-change-requests', {
    method: 'POST',
    body: JSON.stringify({ catalogId: input.catalogId, memo: input.memo }),
  });
}

/** POST /park-change-requests/{id}/cancel */
export function cancelParkChange(id: string): Promise<void> {
  if (mockFor('parkChange')) {
    mockParkChange.current = null;
    return mockResponse(undefined);
  }
  return request(`/park-change-requests/${id}/cancel`, { method: 'POST' });
}

/** 로그아웃: 저장한 토큰을 지워요. 서버 로그아웃 경로는 API 명세서(KAN-23)가 나오면 붙여요. */
export function logout(): Promise<void> {
  setAuthToken(null);
  return Promise.resolve();
}
