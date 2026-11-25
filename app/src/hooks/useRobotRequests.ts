import { getPendingRobotRequest } from '@/api/robotRequests';

import { useApi } from './useApi';

/** 확인 중인 로봇 배정 · 추가 요청 (A-01 홈 · A-13 로봇 목록) */
export function usePendingRobotRequest() {
  return useApi(() => getPendingRobotRequest(), []);
}
