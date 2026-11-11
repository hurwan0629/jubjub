import { getRouteConfig } from '@/api/route';

import { useApi } from './useApi';

/** 지금 쓰는 순찰 경로 · 시간표 (A-04 경로 편집) */
export function useRouteConfig() {
  return useApi(() => getRouteConfig(), []);
}
