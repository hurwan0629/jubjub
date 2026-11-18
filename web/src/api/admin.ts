// 총관리자 기능은 항상 실제 서버를 사용해요. 목업으로 승인 성공을 표시하지 않아요.
import { request } from './client';
import type { ManagedPark } from './types';

export type RegistrationStatus = 'pending' | 'approved' | 'rejected';
export type Registration = ManagedPark & {
  userId: string;
  applicantName: string;
  applicantLoginId: string;
  applicantEmail: string;
  applicantPhone: string;
  registrationStatus: RegistrationStatus;
  createdAt: string;
};
export type AdminRobot = {
  id: string;
  name: string;
  serialNo: string;
  parkId: string | null;
  parkName?: string | null;
  managerId?: string | null;
  managerName?: string | null;
  managerLoginId?: string | null;
  status: 'idle' | 'working' | 'emptying' | 'charging' | 'offline' | 'error';
  slamX: number | null;
  slamY: number | null;
  lat: number | null;
  lng: number | null;
  batteryVoltage: number | null;
  lastSeenAt: string | null;
};

async function allPages<T>(path: string, signal?: AbortSignal): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await request<T[]>(`${path}${path.includes('?') ? '&' : '?'}limit=100&offset=${offset}`, { signal });
    result.push(...page);
    if (page.length < 100) return result;
  }
}
export const getRegistrations = (signal?: AbortSignal) =>
  allPages<Registration>('/admin/registrations?status=all', signal);
export const getAdminRobots = (signal?: AbortSignal) => allPages<AdminRobot>('/admin/robots', signal);
export const approveRegistration = (userId: string, robotIds: string[]) =>
  request<ManagedPark>(`/admin/registrations/${encodeURIComponent(userId)}/approve`, {
    method: 'POST',
    body: JSON.stringify({ robotIds }),
  });
export const rejectRegistration = (userId: string, reason: string) =>
  request<ManagedPark>(`/admin/registrations/${encodeURIComponent(userId)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
export const revokeRegistration = (userId: string, reason: string) =>
  request<ManagedPark>(`/admin/registrations/${encodeURIComponent(userId)}/revoke`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

export type AdminPark = {
  id: string;
  catalogId: string;
  name: string;
  address: string;
  managerId: string;
  managerName: string;
  managerLoginId: string;
  status: string;
  robotCount: number;
};
export type ParkChange = {
  id: string;
  parkId: string;
  userId: string;
  applicantName: string;
  applicantLoginId: string;
  currentParkName: string;
  requestedParkName: string;
  requestedParkAddress: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  conflictingManagerName: string | null;
};
export type AdminReport = {
  id: string;
  parkId: string;
  date: string;
  summary: string;
  pickups: number | null;
  stationVisits: number | null;
  patrolsDone: number | null;
  patrolsPlanned: number | null;
  materials: { material: string; count: number }[];
  hourly: { hour: string | number; count: number }[];
  insights: string[];
  events: { time: string; title: string; detail: string }[];
  createdAt: string;
};
export const getAdminParks = (signal?: AbortSignal) => allPages<AdminPark>('/admin/parks', signal);
export const getParkChanges = (signal?: AbortSignal) =>
  allPages<ParkChange>('/admin/park-change-requests?status=all', signal);
export const getParkReports = (id: string, date: string, signal?: AbortSignal, catalogId?: string) =>
  request<AdminReport[]>(
    `/admin/parks/${encodeURIComponent(id)}/reports?date=${encodeURIComponent(date)}${catalogId === undefined ? '' : `&catalogId=${encodeURIComponent(catalogId)}`}`,
    { signal },
  );
export const createAdminRobot = (name: string, serialNo: string) =>
  request<AdminRobot>('/admin/robots', { method: 'POST', body: JSON.stringify({ name, serialNo }) });
export const assignRobot = (id: string, parkId: string | null) =>
  request<AdminRobot>(`/admin/robots/${encodeURIComponent(id)}/assignment`, {
    method: 'PATCH',
    body: JSON.stringify({ parkId }),
  });
export const approveParkChange = (id: string) =>
  request<ParkChange>(`/admin/park-change-requests/${encodeURIComponent(id)}/approve`, { method: 'POST', body: '{}' });
export const rejectParkChange = (id: string, reason: string) =>
  request<ParkChange>(`/admin/park-change-requests/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
