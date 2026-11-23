import { getDecisions } from '@/api/decisions';
import type { DecisionType } from '@/api/types';

import { useApi } from './useApi';

/** 판단 로그 목록. 홈에서는 { limit: 3 } 으로 최근 3개만 불러와요. */
export function useDecisions(options: { type?: DecisionType; limit?: number } = {}) {
  const { type, limit } = options;
  return useApi(() => getDecisions({ type, limit }), [type, limit]);
}
