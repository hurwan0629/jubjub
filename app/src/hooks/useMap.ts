import { getMapOverview } from '@/api/map';

import { useApi } from './useApi';

/** A-02 지도: 공원 중심 · 마커 · 순찰 경로. 로봇이 움직이니 5초마다 다시 불러와요. */
export function useMapOverview() {
  return useApi(() => getMapOverview(), [], { refreshMs: 5000 });
}
