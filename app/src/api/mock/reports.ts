// 일일 보고 목업 (Figma A-10 일일 보고 시안 기준)
import type { DailyReport } from '../types';

export const mockReport: DailyReport = {
  date: '2026-11-09',
  summary:
    '오늘은 6번 순찰하며 쓰레기 24개를 수거했어요. 분리수거장에 3번 다녀왔고, 공연장 앞에서 쓰레기가 가장 많았어요.',
  pickups: 24,
  pickSuccessRate: 87,
  patrols: 6,
  stationVisits: 3,
  byMaterial: [
    { slot: 'pet', count: 10 },
    { slot: 'can', count: 7 },
    { slot: 'paper', count: 5 },
    { slot: 'general', count: 2 },
  ],
  hourly: [
    { range: '08–10', count: 3 },
    { range: '10–12', count: 5 },
    { range: '12–14', count: 7 },
    { range: '14–16', count: 6 },
    { range: '16–18', count: 3 },
  ],
  unresolved: [
    {
      kind: 'unpickable',
      title: '자동 수거 제외 쓰레기',
      body: '집기 불가 대상은 관리자님의 현장 확인과 직접 처리가 필요해요.',
    },
    { kind: 'robotError', title: '로봇 오류 1번', body: '벤치 쉼터 근처에서 뒤집혀 13:58부터 22분 동안 멈췄어요.' },
    {
      kind: 'missedPoint',
      title: '돌지 못한 순찰 지점 1곳',
      body: '로봇 오류 때문에 오후 순찰에서 벤치 쉼터를 건너뛰었어요.',
    },
  ],
};
