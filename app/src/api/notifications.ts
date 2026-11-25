// 알림 API (A-05 알림 목록, A-06 알림 상세). 서버: server/app/routers/notifications.py
import { ApiError, mockFor, mockResponse, request } from './client';
import { mockNotifications } from './mock/notifications';
import type { AppNotification, LatLng, NotificationStatus, NotificationType } from './types';

/** 서버 알림 응답 (NotificationResponse) */
type ServerNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  parkId: string | null;
  robotId: string | null;
  position: LatLng | null;
  occurredAt: string;
  isRead: boolean;
};

/** 서버 알림 종류 → 앱 알림 종류 (필터 · 아이콘). 모르는 종류는 'other'로 보여요. */
const SERVER_TYPE: Record<string, NotificationType> = {
  robot_error: 'robotError',
  low_battery: 'lowBattery',
  unpickable: 'unpickable',
  patrol_missed: 'patrol',
  robotAssignmentApproved: 'robotAssignment',
  robotAssignmentRejected: 'robotAssignment',
  daily_report: 'dailyReport',
};

/** '11:02', 어제면 '어제 22:00', 그보다 전이면 '11월 18일 09:50' */
function displayTime(iso: string, now = new Date()) {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return time;
  if (diff === 1) return `어제 ${time}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${time}`;
}

export function toAppNotification(n: ServerNotification): AppNotification {
  const type = SERVER_TYPE[n.type] ?? 'other';
  return {
    id: n.id,
    type,
    status: n.isRead ? 'acked' : 'new',
    title: n.title,
    place: n.body,
    body: n.body,
    time: displayTime(n.occurredAt),
    // 확인하지 않은 로봇 오류는 맨 위에 고정해요
    pinned: type === 'robotError' && !n.isRead,
    robotId: n.robotId,
    position: n.position,
    occurredAt: n.occurredAt,
  };
}

/** 한 번에 불러오는 최대 개수 (서버 최대 100) */
const PAGE = 100;

/**
 * GET /notifications. type을 주면 그 종류만 보여요.
 * 앱 종류 하나가 서버 종류 여러 개(배정 승인 · 반려)에 해당해서, 거르기는 앱에서 해요.
 */
export async function getNotifications(type?: NotificationType): Promise<AppNotification[]> {
  if (mockFor('notifications')) {
    return mockResponse(mockNotifications.filter((n) => !type || n.type === type));
  }
  const list = await request<ServerNotification[]>(`/notifications?limit=${PAGE}`);
  return list.map(toAppNotification).filter((n) => !type || n.type === type);
}

/** GET /notifications/{id} */
export async function getNotification(id: string): Promise<AppNotification> {
  if (mockFor('notifications')) {
    const found = mockNotifications.find((n) => n.id === id);
    return found ? mockResponse(found) : Promise.reject(new ApiError(404, '알림을 찾을 수 없어요', 'not_found'));
  }
  return toAppNotification(await request<ServerNotification>(`/notifications/${encodeURIComponent(id)}`));
}

/** GET /notifications/unread-count: 하단 탭 배지 · 홈 배너 */
export async function getUnreadCount(): Promise<number> {
  if (mockFor('notifications')) return mockResponse(mockNotifications.filter((n) => n.status === 'new').length);
  return (await request<{ count: number }>('/notifications/unread-count')).count;
}

// 목업에서는 메모리의 상태를 바꿔서, 다시 불러오면 화면에 반영돼요.
function setMockStatus(id: string, status: NotificationStatus) {
  const found = mockNotifications.find((n) => n.id === id);
  if (found) found.status = status;
  return mockResponse(undefined);
}

/** PATCH /notifications/{id}/read: 읽음(확인) 처리 */
export async function ackNotification(id: string): Promise<void> {
  if (mockFor('notifications')) return setMockStatus(id, 'acked');
  await request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
}
