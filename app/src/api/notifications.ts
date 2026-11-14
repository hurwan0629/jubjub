// 알림 API (A-05 알림 목록, A-06 알림 상세)
import { mockResponse, request, mockFor } from './client';
import { mockNotifications } from './mock/notifications';
import type { AppNotification, NotificationStatus, NotificationType } from './types';

/** GET /notifications?type= */
export function getNotifications(type?: NotificationType): Promise<AppNotification[]> {
  if (mockFor('notifications')) {
    return mockResponse(mockNotifications.filter((n) => !type || n.type === type));
  }
  return request(`/notifications${type ? `?type=${type}` : ''}`);
}

/** GET /notifications/{id} */
export function getNotification(id: string): Promise<AppNotification> {
  if (mockFor('notifications')) {
    const found = mockNotifications.find((n) => n.id === id);
    return found ? mockResponse(found) : Promise.reject(new Error(`알림 ${id} 없음`));
  }
  return request(`/notifications/${id}`);
}

// 목업에서는 메모리의 상태를 바꿔서, 다시 불러오면 화면에 반영돼요.
function setMockStatus(id: string, status: NotificationStatus) {
  const found = mockNotifications.find((n) => n.id === id);
  if (found) found.status = status;
  return mockResponse(undefined);
}

/** POST /notifications/{id}/ack: 확인 */
export function ackNotification(id: string): Promise<void> {
  return mockFor('notifications')
    ? setMockStatus(id, 'acked')
    : request(`/notifications/${id}/ack`, { method: 'POST' });
}

/** POST /notifications/{id}/resolve: 처리 완료 표시 → 서버가 로봇 재확인을 대기열에 넣어요 */
export function resolveNotification(id: string): Promise<void> {
  return mockFor('notifications')
    ? setMockStatus(id, 'resolved')
    : request(`/notifications/${id}/resolve`, { method: 'POST' });
}

/** POST /notifications/{id}/recheck: 로봇 재확인 요청 */
export function recheckNotification(id: string): Promise<void> {
  return mockFor('notifications')
    ? mockResponse(undefined)
    : request(`/notifications/${id}/recheck`, { method: 'POST' });
}
