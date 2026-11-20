// 분리수거장 목업 (Figma Page 5 "C-02 분리수거장 관리": 남문 · 북문 · 동문)
import type { Station } from '../types';
import { HANGANG_SPOTS as S } from './parks';

export const mockStations: Station[] = [
  { id: 's1', name: '남문 분리수거장', position: S.station, primary: true, robots: [{ id: '1', name: 'Jubi 1' }] },
  {
    id: 's2',
    name: '북문 분리수거장',
    position: { latitude: S.lawn.latitude + 0.0006, longitude: S.lawn.longitude - 0.0008 },
    primary: false,
    robots: [],
  },
  {
    id: 's3',
    name: '동문 분리수거장',
    position: { latitude: S.bench.latitude + 0.0004, longitude: S.bench.longitude + 0.0006 },
    primary: false,
    robots: [{ id: '2', name: 'Jubi 2' }],
  },
];
