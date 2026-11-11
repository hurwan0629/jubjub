// A-04 경로 편집 목업: 지금 쓰는 한강공원 순찰 경로 (공원 경계 안쪽 예시 좌표)
import type { RouteConfig } from '../types';
import { HANGANG_AREA, HANGANG_BOUNDS, HANGANG_SPOTS as S } from './parks';

export const mockRouteConfig: RouteConfig = {
  parkName: '한강공원',
  bounds: HANGANG_BOUNDS,
  area: HANGANG_AREA,
  station: S.station,
  points: [
    { id: 'p1', name: '잔디광장', position: S.lawn, stay: 2 },
    { id: 'p2', name: '공연장 앞', position: S.stage, stay: 3 },
    { id: 'p3', name: '벤치 쉼터', position: S.bench, stay: 1 },
  ],
  schedule: [
    { id: 's1', time: '10:00', label: '매일 순찰', on: true, repeat: 'daily' },
    { id: 's2', time: '13:00', label: '점심 시간 순찰', on: true, repeat: 'daily' },
    { id: 's3', time: '17:00', label: '저녁 시간 순찰', on: true, repeat: 'daily' },
    { id: 's4', time: '21:10', label: '야간 점검', on: true, repeat: 'daily' },
  ],
};
