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
export const getRobotTasks = (id: string) => live<RobotTask[]>(`${robotPath(id)}/tasks`);
export const getDetections = (id: string) => live<Detection[]>(`${robotPath(id)}/detections`);
export const getRobotErrors = (id: string) =>
  live<{ id: string; code: string; action: string; occurredAt: string }[]>(`${robotPath(id)}/errors`);
export const startPatrol = (id: string) => live<RobotTask>(`${robotPath(id)}/patrol/start`, 'POST');
export const stopPatrol = (id: string) =>
  live<{ taskId: string; accepted: boolean; reason?: string | null }>(`${robotPath(id)}/patrol/stop`, 'POST');
export const getDetectionPhoto = (id: string) =>
  live<{ url: string; expiresIn: number }>(`/detections/${encodeURIComponent(id)}/photo`);
