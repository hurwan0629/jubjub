import { getDecision, getDecisions } from '@/api/decisions';
import type { DecisionOrder, DecisionType } from '@/api/types';

import { useApi } from './useApi';

/** 판단 로그 목록. 홈에서는 { limit: 3 } 으로 최근 3개만 불러와요. */
export function useDecisions(
  options: { type?: DecisionType; limit?: number; date?: string; order?: DecisionOrder } = {},
) {
  const { type, limit, date, order } = options;
  return useApi(() => getDecisions({ type, limit, date, order }), [type, limit, date, order]);
}

/** 판단 로그 상세 (A-09) */
export function useDecisionDetail(id: string) {
  return useApi(() => getDecision(id), [id]);
}
