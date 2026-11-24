import { getHomeRobots, getRobotStatus, getTaskQueue, getTodaySummary } from '@/api/robot';

import { useApi } from './useApi';

/** 홈의 로봇 선택과 상태 카드. 이름 수정 후에도 ID로 선택을 유지해요. */
export function useHomeRobots() {
  return useApi(() => getHomeRobots(), [], { refreshMs: 5000 });
}

/** 실시간 로봇 상태. 서버가 생기면 WebSocket(/ws/status)으로 바꿀 자리예요. 지금은 5초마다 다시 불러와요. */
export function useRobotStatus() {
  return useApi(() => getRobotStatus(), [], { refreshMs: 5000 });
}

/** 작업 대기열 */
export function useTaskQueue() {
  return useApi(() => getTaskQueue(), [], { refreshMs: 5000 });
}

/** 오늘 요약 */
export function useTodaySummary() {
  return useApi(() => getTodaySummary(), [], { refreshMs: 30000 });
}
