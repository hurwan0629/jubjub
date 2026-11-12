// 공원 목업. 여의도한강공원 경계는 OpenStreetMap(relation 7550666, ODbL)의 실제 경계를 단순화한 값이에요.
// 반포 · 뚝섬은 같은 모양을 옮겨 놓은 가짜 경계예요 (화면 확인용).
import { boundsOf } from '@/utils/geo';

import type { LatLng, Park, ParkArea } from '../types';

/** 여의도한강공원: 섬을 둘러싼 띠 모양이라 바깥 경계에서 섬 안쪽(구멍)을 빼요 */
export const HANGANG_AREA: ParkArea = {
  outer: [
    { latitude: 37.53344, longitude: 126.909181 },
    { latitude: 37.531781, longitude: 126.909984 },
    { latitude: 37.531629, longitude: 126.910156 },
    { latitude: 37.531158, longitude: 126.910296 },
    { latitude: 37.530788, longitude: 126.910268 },
    { latitude: 37.529317, longitude: 126.910512 },
    { latitude: 37.527261, longitude: 126.911158 },
    { latitude: 37.5265, longitude: 126.911501 },
    { latitude: 37.523088, longitude: 126.913836 },
    { latitude: 37.523146, longitude: 126.913957 },
    { latitude: 37.520778, longitude: 126.915575 },
    { latitude: 37.520003, longitude: 126.916195 },
    { latitude: 37.519137, longitude: 126.917242 },
    { latitude: 37.518485, longitude: 126.918366 },
    { latitude: 37.516438, longitude: 126.923653 },
    { latitude: 37.51604, longitude: 126.925198 },
    { latitude: 37.515592, longitude: 126.927158 },
    { latitude: 37.515414, longitude: 126.92869 },
    { latitude: 37.515393, longitude: 126.930896 },
    { latitude: 37.515514, longitude: 126.932653 },
    { latitude: 37.516079, longitude: 126.935648 },
    { latitude: 37.517221, longitude: 126.941011 },
    { latitude: 37.518385, longitude: 126.945509 },
    { latitude: 37.519003, longitude: 126.944712 },
    { latitude: 37.519385, longitude: 126.944366 },
    { latitude: 37.520074, longitude: 126.944076 },
    { latitude: 37.520826, longitude: 126.943569 },
    { latitude: 37.528445, longitude: 126.934533 },
    { latitude: 37.529288, longitude: 126.933469 },
    { latitude: 37.530179, longitude: 126.93215 },
    { latitude: 37.531479, longitude: 126.929609 },
    { latitude: 37.5331, longitude: 126.925472 },
    { latitude: 37.533933, longitude: 126.922657 },
    { latitude: 37.535038, longitude: 126.917217 },
    { latitude: 37.535052, longitude: 126.916878 },
    { latitude: 37.535983, longitude: 126.911874 },
    { latitude: 37.53596, longitude: 126.91117 },
    { latitude: 37.535771, longitude: 126.910686 },
    { latitude: 37.535435, longitude: 126.910243 },
    { latitude: 37.535231, longitude: 126.910271 },
    { latitude: 37.535098, longitude: 126.910433 },
    { latitude: 37.535064, longitude: 126.910869 },
    { latitude: 37.535295, longitude: 126.911139 },
    { latitude: 37.535398, longitude: 126.911572 },
    { latitude: 37.535243, longitude: 126.912282 },
    { latitude: 37.535054, longitude: 126.912468 },
    { latitude: 37.535052, longitude: 126.91265 },
    { latitude: 37.534954, longitude: 126.912652 },
    { latitude: 37.534953, longitude: 126.912477 },
    { latitude: 37.534848, longitude: 126.912426 },
    { latitude: 37.534746, longitude: 126.912237 },
    { latitude: 37.534628, longitude: 126.911361 },
    { latitude: 37.534615, longitude: 126.91009 },
    { latitude: 37.534678, longitude: 126.909869 },
    { latitude: 37.534313, longitude: 126.909519 },
    { latitude: 37.53344, longitude: 126.909181 },
  ],
  holes: [
    [
      { latitude: 37.532655, longitude: 126.911166 },
      { latitude: 37.532893, longitude: 126.911215 },
      { latitude: 37.533382, longitude: 126.911528 },
      { latitude: 37.533582, longitude: 126.911796 },
      { latitude: 37.533795, longitude: 126.912493 },
      { latitude: 37.533641, longitude: 126.914841 },
      { latitude: 37.533338, longitude: 126.917036 },
      { latitude: 37.53221, longitude: 126.921232 },
      { latitude: 37.530862, longitude: 126.925672 },
      { latitude: 37.530288, longitude: 126.927217 },
      { latitude: 37.528657, longitude: 126.930387 },
      { latitude: 37.520803, longitude: 126.940681 },
      { latitude: 37.520354, longitude: 126.940991 },
      { latitude: 37.519815, longitude: 126.941086 },
      { latitude: 37.519383, longitude: 126.941018 },
      { latitude: 37.518919, longitude: 126.940819 },
      { latitude: 37.51832, longitude: 126.940128 },
      { latitude: 37.5181, longitude: 126.939722 },
      { latitude: 37.517958, longitude: 126.939136 },
      { latitude: 37.517017, longitude: 126.932469 },
      { latitude: 37.516798, longitude: 126.928826 },
      { latitude: 37.516817, longitude: 126.928176 },
      { latitude: 37.517023, longitude: 126.926777 },
      { latitude: 37.517269, longitude: 126.925785 },
      { latitude: 37.519938, longitude: 126.919134 },
      { latitude: 37.521227, longitude: 126.917391 },
      { latitude: 37.521609, longitude: 126.917011 },
      { latitude: 37.527064, longitude: 126.913231 },
      { latitude: 37.530043, longitude: 126.912012 },
      { latitude: 37.531907, longitude: 126.911329 },
      { latitude: 37.532371, longitude: 126.911182 },
      { latitude: 37.532655, longitude: 126.911166 },
    ],
  ],
};

export const HANGANG_BOUNDS = boundsOf(HANGANG_AREA.outer, 0.03);

/** 여의나루역 북쪽 강변 (공원 경계 안쪽으로 확인한 예시 좌표) */
export const HANGANG_SPOTS = {
  robot: { latitude: 37.5292, longitude: 126.9312 },
  station: { latitude: 37.5287, longitude: 126.9328 },
  unpickable: { latitude: 37.5281, longitude: 126.9343 },
  lawn: { latitude: 37.5296, longitude: 126.9302 },
  stage: { latitude: 37.5288, longitude: 126.9322 },
  bench: { latitude: 37.5276, longitude: 126.935 },
} satisfies Record<string, LatLng>;

const shiftPoint = (p: LatLng, dLat: number, dLng: number): LatLng => ({
  latitude: p.latitude + dLat,
  longitude: p.longitude + dLng,
});

const shiftArea = (a: ParkArea, dLat: number, dLng: number): ParkArea => ({
  outer: a.outer.map((p) => shiftPoint(p, dLat, dLng)),
  holes: a.holes?.map((h) => h.map((p) => shiftPoint(p, dLat, dLng))),
});

const parkFrom = (id: string, name: string, address: string, distance: string, area: ParkArea): Park => ({
  id,
  name,
  address,
  distance,
  area,
  bounds: boundsOf(area.outer, 0.03),
});

export const mockParks: Park[] = [
  parkFrom('hangang', '한강공원', '서울 영등포구 여의동로 330', '2.1km', HANGANG_AREA),
  parkFrom('banpo', '반포한강공원', '서울 서초구 신반포로11길 40', '6.8km', shiftArea(HANGANG_AREA, -0.017, 0.064)),
  parkFrom('ttukseom', '뚝섬한강공원', '서울 광진구 강변북로 139', '12.4km', shiftArea(HANGANG_AREA, 0.002, 0.135)),
];
