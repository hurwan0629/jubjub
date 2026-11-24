import { getMapOverview, getSavedRouteMap } from '@/api/map';

import { useApi } from './useApi';

/** A-02 지도: 공원 중심 · 마커 · 순찰 경로. 로봇이 움직이니 5초마다 다시 불러와요. */
export function useMapOverview() {
  return useApi(() => getMapOverview(), [], { refreshMs: 5000 });
}

/** A-02 지도: 관리자가 저장한 로봇별 순찰 경로. 로봇 위치가 바뀌니 5초마다 다시 불러와요. */
export function useSavedRouteMap() {
  return useApi(() => getSavedRouteMap(), [], { refreshMs: 5000 });
}
