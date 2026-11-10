// 화면에 보여 줄 예시 데이터 (Figma 시안 기준)
export type AlertKind = 'robot' | 'pickup' | 'battery' | 'report';

export type AlertItem = {
  id: string;
  kind: AlertKind;
  title: string;
  place: string;
  meta: string;
  unread: boolean;
  pinned?: boolean;
};

export const alerts: AlertItem[] = [
  { id: 'a1', kind: 'robot', title: '로봇이 움직이지 못하고 있어요', place: '벤치 쉼터 근처', meta: '11:02 · 현장 확인이 필요해요', unread: true, pinned: true },
  { id: 'a2', kind: 'pickup', title: '깨진 유리를 발견했어요', place: '벤치 쉼터', meta: '09:50 · 직접 처리가 필요해요', unread: true },
  { id: 'a3', kind: 'report', title: '어제 보고서가 작성됐어요', place: '하루 동안의 수거 기록을 확인해 보세요', meta: '어제 22:00', unread: false },
];

export const loads = [
  { name: '페트', percent: 80, count: 8 },
  { name: '캔', percent: 55, count: 5 },
  { name: '종이', percent: 40, count: 4 },
  { name: '일반', percent: 20, count: 2 },
];

export const decisions = [
  { time: '14:05', title: '페트 칸을 비울 준비를 했어요', lines: ['페트 적재율이 80%에 도달했어요.', '14:20 분리수거장 비우기를 예약했어요.'] },
  { time: '13:52', title: '캔을 캔 칸에 담았어요', lines: ['확신도 96%로 캔이라고 판단했어요.', '캔 칸 적재율이 55%가 됐어요.'] },
  { time: '13:40', title: '잔디광장 순찰을 이어가고 있어요', lines: ['산책로의 캔을 수거했어요.', '주변을 확인하고 안전하게 이동했어요.'] },
];
