// A-02 지도 목업. 여의나루역 북쪽 강변의 공원 안쪽 예시 좌표예요 (실제 로봇 위치가 아니에요).
import type { MapOverview } from '../types';
import { HANGANG_AREA, HANGANG_BOUNDS, HANGANG_SPOTS as S } from './parks';

export const mockMapOverview: MapOverview = {
  parkName: '한강공원',
  bounds: HANGANG_BOUNDS,
  area: HANGANG_AREA,
  markers: [
    { id: 'robot', type: 'robot', label: 'Jubi', position: S.robot },
    { id: 'station', type: 'station', label: '분리수거장', position: S.station },
    { id: 'n1', type: 'unpickable', label: '깨진 유리', position: S.unpickable },
  ],
  route: [S.lawn, S.stage, S.bench, S.station, S.lawn],
  updatedAt: '2026-11-10T14:08:00+09:00',
};
