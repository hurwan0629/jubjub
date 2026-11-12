// 판단 로그 목업 (Figma A-01 "에이전트가 방금 한 일" 시안 기준)
import type { Decision } from '../types';

export const mockDecisions: Decision[] = [
  {
    id: 'd1',
    type: 'empty',
    time: '14:05',
    title: '페트 칸을 비울 준비를 했어요',
    details: ['페트 적재율이 80%에 도달했어요.', '14:20 분리수거장 비우기를 예약했어요.'],
  },
  {
    id: 'd2',
    type: 'store',
    time: '13:52',
    title: '캔을 캔 칸에 담았어요',
    details: ['확신도 96%로 캔이라고 판단했어요.', '캔 칸 적재율이 55%가 됐어요.'],
  },
  {
    id: 'd3',
    type: 'plan',
    time: '13:40',
    title: '잔디광장 순찰을 이어가고 있어요',
    details: ['산책로의 캔을 수거했어요.', '주변을 확인하고 안전하게 이동했어요.'],
  },
];
