import { getNotificationSettings, getProfile } from '@/api/account';

import { useApi } from './useApi';

/** 로그인한 관리자 정보 */
export function useProfile() {
  return useApi(() => getProfile(), []);
}

/** 유형별 알림 받기 설정 */
export function useNotificationSettings() {
  return useApi(() => getNotificationSettings(), []);
}
