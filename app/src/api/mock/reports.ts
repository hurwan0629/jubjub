// 기간 보고 목업 (Figma Page 5 A-10 보고: 오늘 · 이번 주 · 이번 달 시안 기준)
import type { PeriodReport } from '../types';

type Sample = Omit<PeriodReport, 'from' | 'to'>;

const UNPICKABLE = {
  kind: 'unpickable' as const,
  title: '자동 수거 제외 쓰레기',
  body: '집기 불가 대상은 관리자님의 현장 확인과 직접 처리가 필요해요.',
};

/** 하루 */
export const mockDayReport: Sample = {
  pickups: 24,
  changePercent: 12,
  pickSuccessRate: 87,
  patrols: 6,
  stationVisits: 3,
  byMaterial: [
    { slot: 'pet', count: 10 },
    { slot: 'can', count: 7 },
    { slot: 'paper', count: 5 },
    { slot: 'general', count: 2 },
  ],
  byPoint: [
    { name: '공연장 앞', percent: 50 },
    { name: '잔디광장', percent: 33 },
    { name: '벤치 쉼터', percent: 17 },
  ],
  unresolved: [
    UNPICKABLE,
    { kind: 'robotError', title: '로봇 오류 1번', body: '벤치 쉼터 근처에서 뒤집혀 13:58부터 22분 동안 멈췄어요.' },
    {
      kind: 'missedPoint',
      title: '돌지 못한 순찰 지점 1곳',
      body: '로봇 오류 때문에 오후 순찰에서 벤치 쉼터를 건너뛰었어요.',
    },
  ],
};

/** 일주일 안팎 */
export const mockWeekReport: Sample = {
  pickups: 168,
  changePercent: 9,
  pickSuccessRate: 85,
  patrols: 42,
  stationVisits: 21,
  byMaterial: [
    { slot: 'pet', count: 71 },
    { slot: 'can', count: 49 },
    { slot: 'paper', count: 35 },
    { slot: 'general', count: 13 },
  ],
  byPoint: [
    { name: '공연장 앞', percent: 58 },
    { name: '잔디광장', percent: 27 },
    { name: '벤치 쉼터', percent: 15 },
  ],
  unresolved: [
    UNPICKABLE,
    { kind: 'robotError', title: '로봇 오류 3번', body: '가장 길게 멈춘 건 11.06 벤치 쉼터 근처 22분이에요.' },
    {
      kind: 'missedPoint',
      title: '돌지 못한 순찰 지점 4곳',
      body: '로봇 오류와 배터리 부족으로 순찰 지점을 건너뛰었어요.',
    },
  ],
};

/** 한 달 안팎 */
export const mockMonthReport: Sample = {
  ...mockWeekReport,
  pickups: 212,
  changePercent: 6,
  pickSuccessRate: 86,
  patrols: 54,
  stationVisits: 27,
  byMaterial: [
    { slot: 'pet', count: 87 },
    { slot: 'can', count: 64 },
    { slot: 'paper', count: 44 },
    { slot: 'general', count: 17 },
  ],
};
