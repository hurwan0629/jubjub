import { getStations } from '@/api/stations';

import { useApi } from './useApi';

/** 분리수거장 목록 (C-02 분리수거장 관리) */
export function useStations() {
  return useApi(() => getStations(), []);
}
