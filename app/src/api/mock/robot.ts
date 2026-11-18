// 로봇·작업 대기열·오늘 요약 목업 (Figma A-01 홈 시안 기준)
import type { AssignedRobot, RobotStatus, Task, TodaySummary } from '../types';

/** 서버 없이 화면을 확인할 때 쓰는 2대 예시. 계정별 목록이 있으면 그 목록을 우선해요. */
export const mockAssignedRobots: AssignedRobot[] = [
  {
    id: '1',
    name: '로봇 1',
    serialNo: 'DEMO-001',
    parkId: 'demo',
    status: 'working',
    slamX: null,
    slamY: null,
    lat: null,
    lng: null,
    batteryVoltage: null,
    lastSeenAt: null,
  },
  {
    id: '2',
    name: '로봇 2',
    serialNo: 'DEMO-002',
    parkId: 'demo',
    status: 'charging',
    slamX: null,
    slamY: null,
    lat: null,
    lng: null,
    batteryVoltage: null,
    lastSeenAt: null,
  },
];

export const mockRobot: RobotStatus = {
  name: 'Jubi',
  state: 'patrolling',
  activity: '잔디광장을 돌고 있어요',
  nearPoint: '잔디광장',
  nextPoint: '공연장 앞',
  battery: 72,
  slots: [
    { slot: 'pet', percent: 80, count: 8 },
    { slot: 'can', percent: 55, count: 5 },
    { slot: 'paper', percent: 40, count: 4 },
    { slot: 'general', percent: 20, count: 2 },
  ],
  updatedAt: '2026-11-10T14:05:00+09:00',
};

export const mockTasks: Task[] = [
  { id: 't1', type: 'empty', label: '분리수거장 비우기', eta: '14:20' },
  { id: 't2', type: 'patrol', label: '순찰 이어서 하기', eta: '14:40' },
  { id: 't3', type: 'charge', label: '충전', eta: '15:30' },
];

export const mockToday: TodaySummary = {
  pickups: 24,
  stationVisits: 3,
  patrolsDone: 4,
  patrolsPlanned: 6,
};
