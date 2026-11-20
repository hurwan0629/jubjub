// 내 공원 로봇 목록 · 로봇 요청 목업 (Figma Page 5 "A-01 홈: 순찰 멈추기 (시안)" · "A-13 로봇 목록")
import type { ManagedRobot, RobotRequest } from '../types';

export const mockRobots: ManagedRobot[] = [
  {
    id: '1',
    name: 'Jubi 1',
    state: 'patrolling',
    battery: 72,
    nearPoint: '잔디광장',
    nextPoint: '공연장 앞',
    remainingPoints: 2,
    pausedAt: null,
    nextPatrolAt: '17:00',
    routePointCount: 3,
    patrolsPerDay: 4,
    todayPickups: 24,
  },
  {
    id: '2',
    name: 'Jubi 2',
    state: 'charging',
    battery: 40,
    nearPoint: null,
    nextPoint: null,
    remainingPoints: null,
    pausedAt: null,
    nextPatrolAt: '17:00',
    routePointCount: 2,
    patrolsPerDay: 3,
    todayPickups: 12,
  },
];

/** 확인 중인 로봇 요청 (없으면 null) */
export const mockRobotRequest: { current: RobotRequest | null } = { current: null };
