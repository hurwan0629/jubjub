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
  status: 'idle' | 'working' | 'charging' | 'offline' | 'error';
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
