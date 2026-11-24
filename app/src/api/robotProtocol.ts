// 로봇 통신 DB를 사용하는 실제 조회·제어 API예요.
import { API_URL, request } from './client';
import type { AssignedRobot } from './types';

export type RobotTask = {
  id: string;
  robotId: string;
  parkId: string;
  taskType: 'patrol' | 'station_move';
  routeId: string | null;
  trigger: 'request' | 'schedule' | null;
  startedAt: string;
  endedAt: string | null;
  result: 'completed' | 'stopped' | 'aborted' | 'missed' | null;
  accepted?: boolean;
  reason?: string | null;
};
export type Detection = {
  id: string;
  robotId: string;
  taskId: string;
  clientDetectionId: string;
  material: 'plastic' | 'can' | 'glass' | 'general';
  confidence: number;
  lat: number;
  lng: number;
  detectedAt: string;
  pickupResult: 'collected' | 'failed' | null;
  pickupFailReason: string | null;
};

const robotPath = (id: string) => `/robots/${encodeURIComponent(id)}`;
function live<T>(path: string, method = 'GET'): Promise<T> {
  if (!API_URL) return Promise.reject(new Error('실제 서버에 연결한 뒤 사용할 수 있어요'));
  return request<T>(path, { method });
}
export const getRobotState = (id: string) =>
  live<AssignedRobot & { currentTaskId: string | null; processedPoints: number }>(`${robotPath(id)}/state`);
/** 최근 순서로 limit개 (서버 최대 100) */
export const getRobotTasks = (id: string, limit = 20) => live<RobotTask[]>(`${robotPath(id)}/tasks?limit=${limit}`);
export const getDetections = (id: string, limit = 20) =>
  live<Detection[]>(`${robotPath(id)}/detections?limit=${limit}`);

/** 로봇이 보낸 오류 코드 (server/app/schemas/robot_protocol.py ErrorInput) */
export type RobotErrorCode =
  'path_blocked' | 'pick_failed_repeatedly' | 'low_battery' | 'return_failed' | 'device_failure';
export type RobotErrorRecord = {
  id: string;
  taskId: string | null;
  code: RobotErrorCode;
  action: string;
  detail: string | null;
  lat: number | null;
  lng: number | null;
  occurredAt: string;
};
export const getRobotErrors = (id: string, limit = 20) =>
  live<RobotErrorRecord[]>(`${robotPath(id)}/errors?limit=${limit}`);
export const startPatrol = (id: string) => live<RobotTask>(`${robotPath(id)}/patrol/start`, 'POST');
export const stopPatrol = (id: string) =>
  live<{ taskId: string; accepted: boolean; reason?: string | null }>(`${robotPath(id)}/patrol/stop`, 'POST');
export const getDetectionPhoto = (id: string) =>
  live<{ url: string; expiresIn: number }>(`/detections/${encodeURIComponent(id)}/photo`);
