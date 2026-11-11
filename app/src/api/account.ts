// 계정 · 알림 설정 API (C-02 설정)
import { mockResponse, request, setAuthToken, USE_MOCK } from './client';
import { mockNotificationSettings, mockProfile } from './mock/account';
import type { NotificationSettings, Profile } from './types';

/** GET /me */
export function getProfile(): Promise<Profile> {
  return USE_MOCK ? mockResponse(mockProfile) : request('/me');
}

/** GET /settings/notifications */
export function getNotificationSettings(): Promise<NotificationSettings> {
  return USE_MOCK ? mockResponse(mockNotificationSettings) : request('/settings/notifications');
}

/** PATCH /settings/notifications: 바꾼 항목만 보내요 */
export function updateNotificationSettings(patch: Partial<NotificationSettings>): Promise<NotificationSettings> {
  if (USE_MOCK) {
    Object.assign(mockNotificationSettings, patch);
    return mockResponse(mockNotificationSettings);
  }
  return request('/settings/notifications', { method: 'PATCH', body: JSON.stringify(patch) });
}

/** 로그아웃: 저장한 토큰을 지워요. 서버 로그아웃 경로는 API 명세서(KAN-23)가 나오면 붙여요. */
export function logout(): Promise<void> {
  setAuthToken(null);
  return Promise.resolve();
}
