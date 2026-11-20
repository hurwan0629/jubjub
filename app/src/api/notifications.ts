// 알림 API (A-05 알림 목록, A-06 알림 상세). 서버: server/app/routers/notifications.py
import type { ImageSource } from 'expo-image';

import { API_URL, ApiError, mockFor, mockResponse, request } from './client';
import { MOCK_PHOTOS, mockNotificationDetails, mockNotifications } from './mock/notifications';
import type {
  AppNotification,
  NotificationDetail,
  NotificationDetailResponse,
  NotificationStatus,
  NotificationType,
} from './types';

/** GET /notifications?type= */
export function getNotifications(type?: NotificationType): Promise<AppNotification[]> {
  if (mockFor('notifications')) {
    return mockResponse(mockNotifications.filter((n) => !type || n.type === type));
  }
  return request(`/notifications${type ? `?type=${type}` : ''}`);
}

/** 사진 경로 → 화면에 넣을 이미지. 서버는 '/photos/…' 같은 경로를 줘요. (지도 지점 상세에서도 써요) */
export function photoOf(url: string | null): ImageSource | null {
  if (!url) return null;
  if (url in MOCK_PHOTOS) return MOCK_PHOTOS[url];
  return { uri: url.startsWith('http') ? url : `${API_URL}${url}` };
}

function toDetail(res: NotificationDetailResponse): NotificationDetail {
  const { photoUrl, recheck, ...rest } = res;
  return {
    ...rest,
    photo: photoOf(photoUrl),
    recheck: recheck ? { ...recheck, photo: photoOf(recheck.photoUrl) } : null,
  };
}

/** GET /notifications/{id} */
export async function getNotification(id: string): Promise<NotificationDetail> {
  if (mockFor('notifications')) {
    const found = mockNotifications.find((n) => n.id === id);
    const extra = mockNotificationDetails[id];
    if (!found || !extra) throw new ApiError(404, '알림을 찾을 수 없어요', 'notification_not_found');
    return toDetail(await mockResponse({ ...found, ...extra }));
  }
  return toDetail(await request<NotificationDetailResponse>(`/notifications/${id}`));
}

// 목업에서는 메모리의 상태를 바꿔서, 다시 불러오면 화면에 반영돼요.
function setMockStatus(id: string, status: NotificationStatus) {
  const found = mockNotifications.find((n) => n.id === id);
  if (found) found.status = status;
  return mockResponse(undefined);
}

/** 재확인을 대기열에 넣어요 (목업: 대기열 2번째 · 14:35 예정) */
function queueMockRecheck(id: string) {
  const extra = mockNotificationDetails[id];
  if (extra) {
    extra.recheck = { status: 'requested', queuePosition: 2, eta: '14:35', checkedAt: null, photoUrl: null };
  }
}

/** POST /notifications/{id}/ack: 확인 */
export function ackNotification(id: string): Promise<void> {
  return mockFor('notifications')
    ? setMockStatus(id, 'acked')
    : request(`/notifications/${id}/ack`, { method: 'POST' });
}

/** POST /notifications/{id}/resolve: 처리 완료 표시 → 집기 불가는 서버가 로봇 재확인을 대기열에 넣어요 */
export function resolveNotification(id: string): Promise<void> {
  if (mockFor('notifications')) {
    if (mockNotifications.find((n) => n.id === id)?.type === 'unpickable') queueMockRecheck(id);
    return setMockStatus(id, 'resolved');
  }
  return request(`/notifications/${id}/resolve`, { method: 'POST' });
}

/** POST /notifications/{id}/recheck: 로봇 재확인 요청 */
export function recheckNotification(id: string): Promise<void> {
  if (mockFor('notifications')) {
    queueMockRecheck(id);
    return setMockStatus(id, 'acked');
  }
  return request(`/notifications/${id}/recheck`, { method: 'POST' });
}
