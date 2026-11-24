// 보고 API (A-10 보고: 오늘 · 이번 주 · 이번 달 · 직접 선택)
// 서버에 보고 API가 없어서, 실제 서버에서는 로봇마다 탐지 · 작업 · 오류 기록을 모아 앱에서 계산해요.
import { distanceMeters } from '@/utils/geo';

import { mockFor, mockResponse, request } from './client';
import { mockReport } from './mock/reports';
import { getDetections, getRobotErrors, getRobotTasks } from './robotProtocol';
import type { Detection, RobotErrorCode, RobotErrorRecord, RobotTask } from './robotProtocol';
import { getPatrolRobots, getRouteConfig } from './route';
import type { DailyReport, PatrolPoint } from './types';

/** GET /reports/{date}  date: 'YYYY-MM-DD' */
export function getDailyReport(date: string): Promise<DailyReport> {
  return mockFor('reports') ? mockResponse({ ...mockReport, date }) : request(`/reports/${date}`);
}

export type MaterialKey = 'pet' | 'can' | 'glass' | 'general';

/** A-10 기간 보고 한 장 */
export type PeriodReport = {
  from: string; // ISO (그날 0시)
  to: string; // ISO (마지막 날 다음 0시, 미포함)
  pickups: number; // 수거 성공 개수
  previousPickups: number; // 바로 앞 같은 길이 기간
  pickSuccessRate: number | null; // 0~100, 시도가 없으면 null
  patrols: number; // 끝까지 돈 순찰
  stationVisits: number; // 분리수거장 다녀온 횟수
  byMaterial: { key: MaterialKey; count: number }[];
  byPoint: { name: string; count: number }[]; // 순찰 지점별 탐지 (많은 순)
  hourly: { range: string; count: number }[]; // 2시간 단위 06–22시
  unpickable: number; // 집기 불가
  errors: { code: RobotErrorCode; robotName: string; occurredAt: string }[];
  missedPatrols: number; // 시작하지 못한 순찰
};

const MATERIAL: Record<Detection['material'], MaterialKey> = {
  plastic: 'pet',
  can: 'can',
  glass: 'glass',
  general: 'general',
};
const PAGE = 100;
const MAX_PAGES = 5; // 로봇 1대당 최대 500건까지 봐요

/** 최근 순으로 페이지를 넘기다가 기간 시작보다 오래된 기록이 나오면 멈춰요 */
async function pages<T>(load: (offset: number) => Promise<T[]>, time: (item: T) => string, since: number) {
  const out: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const list = await load(i * PAGE).catch(() => [] as T[]);
    out.push(...list);
    if (list.length < PAGE || list.some((item) => new Date(time(item)).getTime() < since)) break;
  }
  return out;
}

const within = (iso: string | null | undefined, from: number, to: number) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from && t < to;
};

function summarize(
  from: number,
  to: number,
  detections: (Detection & { robotName: string })[],
  tasks: RobotTask[],
  errors: (RobotErrorRecord & { robotName: string })[],
  points: PatrolPoint[],
): Omit<PeriodReport, 'previousPickups'> {
  const ds = detections.filter((d) => within(d.detectedAt, from, to));
  const collected = ds.filter((d) => d.pickupResult === 'collected');
  const failed = ds.filter((d) => d.pickupResult === 'failed');
  const ts = tasks.filter((task) => within(task.startedAt, from, to));
  const byMaterial = (['pet', 'can', 'glass', 'general'] as MaterialKey[]).map((key) => ({
    key,
    count: collected.filter((d) => MATERIAL[d.material] === key).length,
  }));
  const pointCount = new Map<string, number>();
  ds.forEach((d) => {
    let best: { name: string; dist: number } | null = null;
    for (const p of points) {
      const dist = distanceMeters(p.position, { latitude: d.lat, longitude: d.lng });
      if (!best || dist < best.dist) best = { name: p.name, dist };
    }
    if (best && best.dist < 150) pointCount.set(best.name, (pointCount.get(best.name) ?? 0) + 1);
  });
  const hourly = Array.from({ length: 8 }, (_, i) => {
    const start = 6 + i * 2;
    return {
      range: `${String(start).padStart(2, '0')}–${String(start + 2).padStart(2, '0')}`,
      count: collected.filter((d) => {
        const h = new Date(d.detectedAt).getHours();
        return h >= start && h < start + 2;
      }).length,
    };
  });
  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    pickups: collected.length,
    pickSuccessRate:
      collected.length + failed.length
        ? Math.round((collected.length / (collected.length + failed.length)) * 100)
        : null,
    patrols: ts.filter((task) => task.taskType === 'patrol' && task.result === 'completed').length,
    stationVisits: ts.filter((task) => task.taskType === 'station_move' && task.result === 'completed').length,
    byMaterial,
    byPoint: [...pointCount.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    hourly,
    unpickable: failed.length,
    errors: errors
      .filter((e) => within(e.occurredAt, from, to))
      .map((e) => ({ code: e.code, robotName: e.robotName, occurredAt: e.occurredAt })),
    missedPatrols: ts.filter((task) => task.result === 'missed').length,
  };
}

/** 목업: 일일 보고 예시를 기간 길이만큼 늘려 보여 줘요 */
function mockPeriod(from: Date, to: Date): PeriodReport {
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
  const k = (n: number) => Math.round(n * days * 0.95);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    pickups: k(mockReport.pickups),
    previousPickups: Math.round(k(mockReport.pickups) * 0.9),
    pickSuccessRate: mockReport.pickSuccessRate,
    patrols: k(mockReport.patrols),
    stationVisits: k(mockReport.stationVisits),
    byMaterial: [
      { key: 'pet', count: k(10) },
      { key: 'can', count: k(7) },
      { key: 'glass', count: k(1) },
      { key: 'general', count: k(2) },
    ],
    byPoint: [
      { name: '공연장 앞', count: k(6) },
      { name: '잔디광장', count: k(4) },
      { name: '벤치 쉼터', count: k(2) },
    ],
    hourly: mockReport.hourly.map((h) => ({ ...h, count: k(h.count) })),
    unpickable: Math.max(1, Math.round(days / 2)),
    errors: [{ code: 'path_blocked', robotName: 'Jubi', occurredAt: from.toISOString() }],
    missedPatrols: 0,
  };
}

/** A-10 기간 보고. from: 시작일 0시, to: 마지막 날 다음 0시 (미포함) */
export async function getPeriodReport(from: Date, to: Date): Promise<PeriodReport> {
  if (mockFor('route')) return mockResponse(mockPeriod(from, to));
  const length = to.getTime() - from.getTime();
  const prevFrom = from.getTime() - length;
  const robots = await getPatrolRobots();
  const all = await Promise.all(
    robots.map(async (r) => {
      const [detections, tasks, errors, route] = await Promise.all([
        pages(
          (o) => getDetections(r.id, PAGE, o),
          (d) => d.detectedAt,
          prevFrom,
        ),
        pages(
          (o) => getRobotTasks(r.id, PAGE, o),
          (t) => t.startedAt,
          from.getTime(),
        ),
        pages(
          (o) => getRobotErrors(r.id, PAGE, o),
          (e) => e.occurredAt,
          from.getTime(),
        ),
        getRouteConfig(r.id).catch(() => null),
      ]);
      return {
        detections: detections.map((d) => ({ ...d, robotName: r.name })),
        tasks,
        errors: errors.map((e) => ({ ...e, robotName: r.name })),
        points: route?.points ?? [],
      };
    }),
  );
  const detections = all.flatMap((a) => a.detections);
  const points = all.flatMap((a) => a.points);
  const current = summarize(
    from.getTime(),
    to.getTime(),
    detections,
    all.flatMap((a) => a.tasks),
    all.flatMap((a) => a.errors),
    points,
  );
  const previous = summarize(prevFrom, from.getTime(), detections, [], [], points);
  return { ...current, previousPickups: previous.pickups };
}
