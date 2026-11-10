// 알림 목업 (Figma A-05 알림 시안 기준)
import type { AppNotification } from '../types';

export const mockNotifications: AppNotification[] = [
  {
    id: 'a1',
    type: 'robotError',
    status: 'new',
    title: '로봇이 움직이지 못하고 있어요',
    place: '벤치 쉼터 근처',
    time: '11:02',
    note: '현장 확인이 필요해요',
    pinned: true,
  },
  {
    id: 'a2',
    type: 'unpickable',
    status: 'new',
    title: '깨진 유리를 발견했어요',
    place: '벤치 쉼터',
    time: '09:50',
    note: '직접 처리가 필요해요',
  },
  {
    id: 'a3',
    type: 'dailyReport',
    status: 'acked',
    title: '어제 보고서가 작성됐어요',
    place: '하루 동안의 수거 기록을 확인해 보세요',
    time: '어제 22:00',
  },
];
