// 내 공원 로봇 API (A-01 홈 로봇 칩 · 순찰 멈추기, A-13 로봇 목록). 서버: server/app/routers/robots.py
import { ApiError, mockFor, mockResponse, request } from './client';
import { mockRobotRequest, mockRobots } from './mock/robots';
import type { ManagedRobot, PauseMode, RobotRequest, RobotRequestInput } from './types';

function findMock(id: string): ManagedRobot {
  const robot = mockRobots.find((r) => r.id === id);
  if (!robot) throw new ApiError(404, '우리 공원에 배정된 로봇이 아니에요', 'robot_not_found');
  return robot;
}

/** GET /robots */
export function getRobots(): Promise<ManagedRobot[]> {
  return mockFor('robots') ? mockResponse(mockRobots) : request('/robots');
}

/** PATCH /robots/{id}: 이름 바꾸기 (10자 이내 · 공원 안에서 겹치지 않게) */
export function renameRobot(id: string, name: string): Promise<ManagedRobot> {
  if (mockFor('robots')) {
    if (mockRobots.some((r) => r.id !== id && r.name === name)) {
      return Promise.reject(new ApiError(409, '공원 안에 같은 이름의 로봇이 있어요', 'robot_name_taken'));
    }
    const robot = findMock(id);
    robot.name = name;
    return mockResponse(robot);
  }
  return request(`/robots/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
}

/** POST /robots/{id}/pause: 그 자리에서 멈추기(stay) · 이번 순찰 끝내고 돌아가기(return) */
export function pausePatrol(id: string, mode: PauseMode): Promise<ManagedRobot> {
  if (mockFor('robots')) {
    const robot = findMock(id);
    if (mode === 'return') {
      robot.state = 'returning';
    } else {
      robot.state = 'paused';
      robot.pausedAt = new Date().toISOString();
    }
    return mockResponse(robot);
  }
  return request(`/robots/${id}/pause`, { method: 'POST', body: JSON.stringify({ mode }) });
}

/** POST /robots/{id}/resume: 순찰 다시 시작 (멈춤) · 지금 순찰 시작 (대기) */
export function resumePatrol(id: string): Promise<ManagedRobot> {
  if (mockFor('robots')) {
    const robot = findMock(id);
    robot.state = 'patrolling';
    robot.pausedAt = null;
    return mockResponse(robot);
  }
  return request(`/robots/${id}/resume`, { method: 'POST' });
}

/** GET /robot-requests/current: 총관리자가 확인 중인 요청 (없으면 null) */
export function getCurrentRobotRequest(): Promise<RobotRequest | null> {
  return mockFor('robotRequests') ? mockResponse(mockRobotRequest.current) : request('/robot-requests/current');
}

/** POST /robot-requests: 로봇 배정 · 추가 요청 */
export function requestRobots(input: RobotRequestInput): Promise<RobotRequest> {
  if (mockFor('robotRequests')) {
    mockRobotRequest.current = {
      id: `r${Date.now()}`,
      count: input.count,
      memo: input.memo ?? null,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    return mockResponse(mockRobotRequest.current);
  }
  return request('/robot-requests', { method: 'POST', body: JSON.stringify(input) });
}

/** POST /robot-requests/{id}/cancel */
export function cancelRobotRequest(id: string): Promise<RobotRequest> {
  if (mockFor('robotRequests')) {
    const canceled = { ...(mockRobotRequest.current as RobotRequest), status: 'canceled' as const };
    mockRobotRequest.current = null;
    return mockResponse(canceled);
  }
  return request(`/robot-requests/${id}/cancel`, { method: 'POST' });
}
