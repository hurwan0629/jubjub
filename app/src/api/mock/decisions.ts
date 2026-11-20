// 판단 로그 목업 (Figma Page 5 A-08 판단 로그 · A-09 판단 로그 상세 · A-01 "에이전트가 방금 한 일")
import type { ImageSource } from 'expo-image';

import type { Decision, DecisionDetailResponse } from '../types';

export const mockDecisions: Decision[] = [
  {
    id: 'd1',
    type: 'empty',
    time: '14:05',
    title: '페트 칸을 비울 준비를 했어요',
    summary: '페트 적재율 80%',
    details: ['페트 적재율이 80%에 도달했어요.', '14:20 분리수거장 비우기를 예약했어요.'],
  },
  {
    id: 'd2',
    type: 'store',
    time: '13:52',
    title: '캔을 캔 칸에 담았어요',
    summary: '캔(확신도 96%)',
    details: ['확신도 96%로 캔이라고 판단했어요.', '캔 칸 적재율이 55%가 됐어요.'],
  },
  {
    id: 'd3',
    type: 'plan',
    time: '13:40',
    title: '잔디광장 순찰을 이어가고 있어요',
    summary: '다음 지점 · 공연장 앞',
    details: ['산책로의 캔을 수거했어요.', '주변을 확인하고 안전하게 이동했어요.'],
  },
  {
    id: 'd4',
    type: 'pick',
    time: '10:20',
    title: '쓰레기 탐지 및 줍기',
    summary: '페트(확신도 98%)',
    details: ['확신도 98%로 페트라고 판단했어요.', '페트 칸에 1개 담았어요.'],
    photoUrl: 'mock:pet',
  },
  {
    id: 'd5',
    type: 'empty',
    time: '10:18',
    title: '분리수거장 이동 시작',
    summary: '페트 칸 80%',
    details: ['페트 칸이 80%가 됐어요.', '분리수거장으로 이동을 시작했어요.'],
  },
  {
    id: 'd6',
    type: 'recapture',
    time: '10:15',
    title: '다시 촬영',
    summary: '확신도가 낮아 각도를 바꿨어요',
    details: ['확신도 62%로 낮아 각도를 바꿨어요.', '다시 찍어 확신도 94%가 됐어요.'],
  },
  {
    id: 'd7',
    type: 'store',
    time: '10:02',
    title: '일반 칸 투입',
    summary: '재질을 확정하지 못했어요',
    details: ['재촬영 후에도 확신도가 낮았어요.', '잘못 분리하지 않도록 일반 칸에 담았어요.'],
  },
  {
    id: 'd8',
    type: 'notify',
    time: '09:50',
    title: '집기 불가 알림',
    summary: '유리 · 벤치 쉼터',
    details: ['유리라서 집지 않았어요.', '관리자에게 알림을 보냈어요.'],
  },
  {
    id: 'd9',
    type: 'route',
    time: '09:30',
    title: '순찰 경로 변경',
    summary: '관리자 수정',
    details: ['관리자님이 순찰 경로를 수정했어요.', '다음 순찰부터 적용해요.'],
  },
];

const base = {
  heading: null,
  tag: null,
  kicker: null,
  headline: null,
  photoSlot: false,
  shots: [],
  facts: [],
  reason: null,
  boxes: [],
  cards: [],
  footer: null,
};

/** 상세에만 있는 값. 목록 항목(mockDecisions)과 합쳐서 돌려줘요. */
export const mockDecisionDetails: Record<string, Omit<DecisionDetailResponse, keyof Decision>> = {
  d4: {
    ...base,
    happenedAt: '오늘 10:20',
    tag: '줍기 완료',
    headline: { text: '페트 · 확신도 98%', tone: 'brand' },
    photoSlot: true,
    facts: [
      { label: '고른 행동', value: '페트를 집어 수거했어요' },
      { label: '이유', value: '페트로 판단한 확신도가 높고, 줍기 대상이라 수거했어요.' },
      { label: '담은 칸', value: '페트 칸 · 1개 투입' },
      { label: '결과', value: '줍기와 칸 투입을 완료했어요' },
    ],
  },
  d6: {
    ...base,
    happenedAt: '오늘 10:15',
    kicker: { text: '재촬영 · 오늘 10:15', tone: 'brand' },
    heading: '각도를 바꿔 다시 촬영했어요',
    shots: [
      { photoUrl: null, caption: '첫 촬영 · 확신도 62%', highlight: false },
      { photoUrl: null, caption: '재촬영 · 페트 · 확신도 94%', highlight: true },
    ],
    reason: '처음에는 확신도가 낮아 각도를 바꿔 다시 찍었어요. 재촬영 후 확신도 94%로 페트라고 판단했어요.',
  },
  d7: {
    ...base,
    happenedAt: '오늘 10:02',
    kicker: { text: '일반 칸 투입', tone: 'brand' },
    heading: '재질을 확정하지 못했어요',
    photoSlot: true,
    reason: '각도를 바꿔 재촬영했지만 재질을 확실하게 구분하지 못했어요. 잘못 분리하지 않도록 일반 칸에 담았어요.',
    cards: [
      { title: '분류 재질 · 불확실해요', lines: ['재촬영 후에도 확신도가 낮아요'], emphasis: '담은 칸 · 일반 칸' },
    ],
  },
  d8: {
    ...base,
    happenedAt: '오늘 09:50',
    kicker: { text: '집기 불가 알림 · 오늘 09:50', tone: 'warn' },
    heading: '쓰레기를 줍지 못했어요',
    headline: { text: '벤치 쉼터 · 유리 · 확신도 91%', tone: 'body' },
    photoSlot: true,
    reason: '쓰레기를 집으려 했으나 집지 못했어요. 관리자에게 알림을 남겨 처리를 요청했어요.',
    footer: '담은 칸 · 담지 못했어요',
  },
  d9: {
    ...base,
    happenedAt: '오늘 09:30',
    kicker: { text: '관리자 수정 · 오늘 09:30', tone: 'brand' },
    heading: '순찰 경로를 변경했어요',
    boxes: [
      { title: '바꾼 주체', body: '관리자님이 순찰 경로를 수정했어요' },
      { title: '적용 시점', body: '지금 진행 중인 순찰은 유지하고, 다음 순찰부터 적용해요' },
    ],
    cards: [
      { title: '현재 저장된 순찰 지점', lines: ['1 · 잔디광장', '2 · 공연장 앞', '3 · 벤치 쉼터'], emphasis: null },
    ],
  },
};

/** 상세가 따로 없는 기록은 목록 값으로 만들어요 */
export function mockDetailOf(d: Decision): Omit<DecisionDetailResponse, keyof Decision> {
  return (
    mockDecisionDetails[d.id] ?? {
      ...base,
      happenedAt: `오늘 ${d.time}`,
      reason: d.details.join(' '),
    }
  );
}

/** 목업 사진 (서버에서는 photoUrl로 받아요) */
export const MOCK_LOG_PHOTOS: Record<string, ImageSource> = {
  'mock:pet': require('../../../assets/images/log-pet.jpg'),
};
