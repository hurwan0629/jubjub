// 로봇 상태·작업 대기열 API (A-01 홈, A-02 지도)
import { mockResponse, request, mockFor } from './client';
import { mockRobot, mockTasks, mockToday } from './mock/robot';
import type { RobotStatus, Task, TodaySummary } from './types';

/** GET /robot/status */
export function getRobotStatus(): Promise<RobotStatus> {
  return mockFor('robot') ? mockResponse(mockRobot) : request('/robot/status');
}

/** GET /tasks/queue */
export function getTaskQueue(): Promise<Task[]> {
  return mockFor('robot') ? mockResponse(mockTasks) : request('/tasks/queue');
}

/** 오늘 요약. 서버 경로는 API 명세서(KAN-23)에서 정해지면 맞춰요. */
export function getTodaySummary(): Promise<TodaySummary> {
  return mockFor('robot') ? mockResponse(mockToday) : request('/robot/today');
}

/** POST /tasks: 지도에서 고른 지점으로 로봇 보내기 */
export function sendRobot(pointId: string): Promise<Task> {
  if (mockFor('robot')) {
    const task: Task = { id: `t${Date.now()}`, type: 'visit', label: '지정 지점 확인', eta: '--:--' };
    mockTasks.push(task);
    return mockResponse(task);
  }
  return request('/tasks', { method: 'POST', body: JSON.stringify({ pointId }) });
}

/** POST /robot/recover: 로봇 복구 완료 */
export function recoverRobot(): Promise<void> {
  if (mockFor('robot')) {
    mockRobot.state = 'idle';
    return mockResponse(undefined);
  }
  return request('/robot/recover', { method: 'POST' });
}
