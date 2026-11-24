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
  canApprove?: boolean;
  approvalBlockReason?: string | null;
  conflictingManagerId?: string | null;
  conflictingManagerName?: string | null;
  conflictingManagerLoginId?: string | null;
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
  status: 'idle' | 'working' | 'returning' | 'emptying' | 'offline' | 'error';
  slamX: number | null;
  slamY: number | null;
  lat: number | null;
  lng: number | null;
  batteryVoltage: number | null;
  lastSeenAt: string | null;
  slamYaw?: number | null;
  updatedAt?: string | null;
  tokenIssuedAt?: string | null;
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
  request<AdminRobot & { authToken: string }>('/admin/robots', {
    method: 'POST',
    body: JSON.stringify({ name, serialNo }),
  });
export const rotateRobotToken = (id: string) =>
  request<{ robotId: string; authToken: string; tokenIssuedAt: string }>(
    `/admin/robots/${encodeURIComponent(id)}/token`,
    { method: 'POST' },
  );
export const startPatrol = (id: string) =>
  request<{ id: string; result: string | null; accepted?: boolean }>(`/robots/${encodeURIComponent(id)}/patrol/start`, {
    method: 'POST',
  });
export const stopPatrol = (id: string) =>
  request<{ taskId: string; accepted: boolean }>(`/robots/${encodeURIComponent(id)}/patrol/stop`, { method: 'POST' });
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

/** 관리자 앱에서 들어온 로봇 배정 · 추가 요청 (W-04 로봇 목록 - 배정 요청) */
export type RobotAssignmentRequest = {
  id: string;
  userId: string;
  parkId: string;
  catalogId: string;
  parkName: string;
  applicantName: string;
  applicantLoginId: string;
  robotCount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  rejectReason: string | null;
  createdAt: string;
  assignedRobotIds: string[];
};
export const getRobotAssignmentRequests = (signal?: AbortSignal) =>
  allPages<RobotAssignmentRequest>('/admin/robot-assignment-requests?status=pending', signal);
/** 요청한 대수만큼 배정 전 로봇을 골라 승인해요 (서버가 대수가 다르면 422) */
export const approveRobotAssignment = (id: string, robotIds: string[]) =>
  request<RobotAssignmentRequest>(`/admin/robot-assignment-requests/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    body: JSON.stringify({ robotIds }),
  });
export const rejectRobotAssignment = (id: string, reason: string) =>
  request<RobotAssignmentRequest>(`/admin/robot-assignment-requests/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

/* ---------- W-03 공원별 보고: 서버에 보고 API가 없어서 로봇 기록으로 하루 보고를 계산해요 ---------- */
type RobotTaskRecord = {
  id: string;
  taskType: 'patrol' | 'station_move';
  startedAt: string;
  endedAt: string | null;
  result: 'completed' | 'stopped' | 'aborted' | 'missed' | null;
};
type DetectionRecord = {
  id: string;
  material: 'plastic' | 'can' | 'glass' | 'general';
  detectedAt: string;
  pickupResult: 'collected' | 'failed' | null;
};
type RobotErrorRecord = { id: string; code: string; action: string; occurredAt: string };

export type ReportMaterial = 'pet' | 'can' | 'glass' | 'general';
export type ParkDailyReport = {
  date: string; // YYYY-MM-DD
  robotNames: string[];
  pickups: number;
  previousPickups: number;
  pickSuccessRate: number | null; // 0~100, 시도 없으면 null
  patrols: number;
  stationVisits: number;
  materials: { key: ReportMaterial; count: number }[];
  hourly: { range: string; count: number }[]; // 08–18시 2시간 단위 (Figma)
  unpickable: number;
  errors: { code: string; robotName: string; occurredAt: string }[];
  missedPatrols: number;
  generatedAt: string;
};

const RECORD_PAGE = 100;
const RECORD_MAX_PAGES = 5;

/** 최근 순으로 넘기다가 since보다 오래된 기록이 나오면 멈춰요 (로봇 1대당 최대 500건) */
async function records<T>(
  robotId: string,
  kind: string,
  time: (item: T) => string,
  since: number,
  signal?: AbortSignal,
) {
  const out: T[] = [];
  for (let page = 0; page < RECORD_MAX_PAGES; page++) {
    const list = await request<T[]>(
      `/robots/${encodeURIComponent(robotId)}/${kind}?limit=${RECORD_PAGE}&offset=${page * RECORD_PAGE}`,
      { signal },
    );
    out.push(...list);
    if (list.length < RECORD_PAGE || list.some((item) => new Date(time(item)).getTime() < since)) break;
  }
  return out;
}

const MATERIAL_KEY: Record<DetectionRecord['material'], ReportMaterial> = {
  plastic: 'pet',
  can: 'can',
  glass: 'glass',
  general: 'general',
};

/**
 * 공원 하루 보고. day는 그날 0시(로컬 시각)예요.
 * 그 공원에 배정된 로봇들의 작업 · 탐지 · 오류 기록을 모아 계산해요.
 */
export async function getParkDailyReport(
  park: AdminPark,
  robots: AdminRobot[],
  day: Date,
  signal?: AbortSignal,
): Promise<ParkDailyReport> {
  const from = day.getTime();
  const to = from + 86400000;
  const prevFrom = from - 86400000;
  const mine = robots.filter((r) => r.parkId === park.id);
  const within = (iso: string | null | undefined, a: number, b: number) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= a && t < b;
  };
  const all = await Promise.all(
    mine.map(async (robot) => {
      const [tasks, detections, errors] = await Promise.all([
        records<RobotTaskRecord>(robot.id, 'tasks', (t) => t.startedAt, from, signal),
        records<DetectionRecord>(robot.id, 'detections', (d) => d.detectedAt, prevFrom, signal),
        records<RobotErrorRecord>(robot.id, 'errors', (e) => e.occurredAt, from, signal),
      ]);
      return { robot, tasks, detections, errors };
    }),
  );
  const detections = all.flatMap((a) => a.detections);
  const today = detections.filter((d) => within(d.detectedAt, from, to));
  const collected = today.filter((d) => d.pickupResult === 'collected');
  const failed = today.filter((d) => d.pickupResult === 'failed');
  const tasks = all.flatMap((a) => a.tasks).filter((t) => within(t.startedAt, from, to));
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`,
    robotNames: mine.map((r) => r.name),
    pickups: collected.length,
    previousPickups: detections.filter((d) => within(d.detectedAt, prevFrom, from) && d.pickupResult === 'collected')
      .length,
    pickSuccessRate:
      collected.length + failed.length
        ? Math.round((collected.length / (collected.length + failed.length)) * 100)
        : null,
    patrols: tasks.filter((t) => t.taskType === 'patrol' && t.result === 'completed').length,
    stationVisits: tasks.filter((t) => t.taskType === 'station_move' && t.result === 'completed').length,
    materials: (['pet', 'can', 'glass', 'general'] as ReportMaterial[]).map((key) => ({
      key,
      count: collected.filter((d) => MATERIAL_KEY[d.material] === key).length,
    })),
    hourly: [8, 10, 12, 14, 16].map((start) => ({
      range: `${pad(start)}–${pad(start + 2)}`,
      count: collected.filter((d) => {
        const h = new Date(d.detectedAt).getHours();
        return h >= start && h < start + 2;
      }).length,
    })),
    unpickable: failed.length,
    errors: all.flatMap((a) =>
      a.errors
        .filter((e) => within(e.occurredAt, from, to))
        .map((e) => ({ code: e.code, robotName: a.robot.name, occurredAt: e.occurredAt })),
    ),
    missedPatrols: tasks.filter((t) => t.result === 'missed').length,
    generatedAt: new Date().toISOString(),
  };
}
