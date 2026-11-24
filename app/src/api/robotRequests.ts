// 로봇 배정 · 추가 요청 API (A-01 홈 로봇 배정 전 · A-13 로봇 추가 요청). 서버: server/app/routers/robot_assignment.py
import { ApiError, mockFor, mockResponse, request } from './client';
import { getMockSession } from './mock/onboarding';
import type { RobotRequest, RobotRequestInput } from './types';

// 목업: 앱을 켜 둔 동안만 기억해요
let mockRequests: RobotRequest[] = [];

/** 확인 중(pending)인 내 요청. 없으면 null */
export async function getPendingRobotRequest(): Promise<RobotRequest | null> {
  const list = mockFor('robotRequests')
    ? await mockResponse(mockRequests)
    : await request<RobotRequest[]>('/robot-assignment-requests?status=pending&limit=1');
  return list.find((r) => r.status === 'pending') ?? null;
}

/** POST /robot-assignment-requests : 총관리자에게 로봇 배정 · 추가를 요청해요 */
export async function requestRobots(body: RobotRequestInput): Promise<RobotRequest> {
  if (!mockFor('robotRequests'))
    return request('/robot-assignment-requests', { method: 'POST', body: JSON.stringify(body) });
  if (mockRequests.some((r) => r.status === 'pending'))
    throw new ApiError(409, '확인 중인 요청이 있어요. 취소한 뒤 다시 요청해 주세요', 'request_pending');
  const created: RobotRequest = {
    id: `${Date.now()}`,
    parkName: getMockSession().park?.name ?? '관리 공원',
    robotCount: body.robotCount,
    reason: body.reason,
    status: 'pending',
    rejectReason: null,
    createdAt: new Date().toISOString(),
  };
  mockRequests = [created, ...mockRequests];
  return mockResponse(created, 300);
}

/** POST /robot-assignment-requests/{id}/cancel : 확인 중인 요청 취소 */
export async function cancelRobotRequest(id: string): Promise<RobotRequest> {
  if (!mockFor('robotRequests'))
    return request(`/robot-assignment-requests/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
  const found = mockRequests.find((r) => r.id === id);
  if (!found) throw new ApiError(404, '요청을 찾을 수 없어요', 'request_not_found');
  const cancelled = { ...found, status: 'cancelled' as const };
  mockRequests = mockRequests.map((r) => (r.id === id ? cancelled : r));
  return mockResponse(cancelled, 200);
}
