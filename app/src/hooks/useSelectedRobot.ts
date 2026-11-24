import { useSyncExternalStore } from 'react';

// 홈에서 보고 있는 로봇. 로봇 목록(A-13)에서 카드를 누르면 홈이 그 로봇 기준으로 바뀌어요.
let selected: string | undefined;
const listeners = new Set<() => void>();

export function selectRobot(robotId: string) {
  selected = robotId;
  listeners.forEach((listener) => listener());
}

/** 홈 · 로봇 목록이 함께 쓰는 선택한 로봇 ID */
export function useSelectedRobot() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selected,
  );
}
