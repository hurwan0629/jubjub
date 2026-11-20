import { useSyncExternalStore } from 'react';

import { getCurrentRobotRequest, getRobots } from '@/api/robots';

import { useApi } from './useApi';

/** 내 공원 로봇 목록. 순찰 상태가 바뀌므로 5초마다 다시 불러와요. */
export function useRobots() {
  return useApi(() => getRobots(), [], { refreshMs: 5000 });
}

/** 총관리자가 확인 중인 로봇 배정 · 추가 요청 (없으면 null) */
export function useRobotRequest() {
  return useApi(() => getCurrentRobotRequest(), []);
}

// 홈에서 보고 있는 로봇. A-13 로봇 목록에서 카드를 누르면 홈이 그 로봇 기준으로 바뀌어요.
let selectedId: string | null = null;
const listeners = new Set<() => void>();

export function selectRobot(id: string) {
  selectedId = id;
  listeners.forEach((l) => l());
}

/** 고른 로봇 id. 아직 고르지 않았으면 null (화면은 첫 번째 로봇을 보여 줘요) */
export function useSelectedRobotId() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selectedId,
  );
}
