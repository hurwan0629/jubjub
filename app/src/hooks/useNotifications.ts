import { getNotifications } from '@/api/notifications';
import type { NotificationType } from '@/api/types';

import { useApi } from './useApi';

/** 알림 목록. type을 주면 그 유형만 불러와요. */
export function useNotifications(type?: NotificationType) {
  return useApi(() => getNotifications(type), [type]);
}

/** 확인 안 한 알림 수 (하단 탭 배지, 홈 배너) */
export function useUnreadCount() {
  const { data } = useNotifications();
  return data ? data.filter((n) => n.status === 'new').length : 0;
}
