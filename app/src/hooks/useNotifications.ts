import { getNotifications, getUnreadCount } from '@/api/notifications';
import type { NotificationType } from '@/api/types';

import { useApi } from './useApi';

/** 알림 목록. type을 주면 그 유형만 불러와요. 새 알림이 오니 30초마다 다시 불러와요. */
export function useNotifications(type?: NotificationType) {
  return useApi(() => getNotifications(type), [type], { refreshMs: 30000 });
}

/** 확인 안 한 알림 수 (하단 탭 배지). GET /notifications/unread-count를 30초마다 불러와요. */
export function useUnreadCount() {
  const { data } = useApi(() => getUnreadCount(), [], { refreshMs: 30000 });
  return data ?? 0;
}
