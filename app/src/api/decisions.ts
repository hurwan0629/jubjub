// 판단 로그 API (A-08 판단 로그, A-09 상세, 홈 "에이전트가 방금 한 일")
import { mockResponse, request, USE_MOCK } from './client';
import { mockDecisions } from './mock/decisions';
import type { Decision, DecisionType } from './types';

/** GET /logs?type=&limit= */
export function getDecisions(options: { type?: DecisionType; limit?: number } = {}): Promise<Decision[]> {
  const { type, limit } = options;
  if (USE_MOCK) {
    const list = mockDecisions.filter((d) => !type || d.type === type);
    return mockResponse(limit ? list.slice(0, limit) : list);
  }
  const query = new URLSearchParams();
  if (type) query.set('type', type);
  if (limit) query.set('limit', String(limit));
  return request(`/logs?${query.toString()}`);
}

/** GET /logs/{id} */
export function getDecision(id: string): Promise<Decision> {
  if (USE_MOCK) {
    const found = mockDecisions.find((d) => d.id === id);
    return found ? mockResponse(found) : Promise.reject(new Error(`판단 로그 ${id} 없음`));
  }
  return request(`/logs/${id}`);
}
