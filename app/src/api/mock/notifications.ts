// 알림 목업 (Figma Page 5 A-05 알림 목록 · A-06 알림 상세 시안 기준)
import type { ImageSource } from 'expo-image';

import type { AppNotification, NotificationDetailResponse } from '../types';

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
    id: 'a4',
    type: 'parkChange',
    status: 'new',
    title: '공원 변경 요청이 반려됐어요',
    place: '반포한강공원에 이미 담당 관리자가 있어요',
    time: '방금',
    note: '운영 관리자',
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
  {
    id: 'a5',
    type: 'lowBattery',
    status: 'acked',
    title: '배터리가 부족해 멈춰 있어요',
    place: '벤치 쉼터 가는 길',
    time: '어제 14:02',
    note: '충전 위치로 옮겨 주세요',
  },
];

const base = { photoUrl: null, detection: null, recheck: null, robotIssue: null, parkChange: null };

/** 상세에만 있는 값. 목록 항목(mockNotifications)과 합쳐서 돌려줘요. */
export const mockNotificationDetails: Record<string, Omit<NotificationDetailResponse, keyof AppNotification>> = {
  a1: {
    ...base,
    happenedAt: '오늘 11:02',
    robotIssue: { kind: '뒤집힘', since: '11:02', lastPlace: '벤치 쉼터 근처', battery: 72, chargerDistanceM: null },
  },
  a2: {
    ...base,
    happenedAt: '오늘 09:50',
    photoUrl: 'mock:glass',
    detection: { label: '유리', confidence: 91 },
  },
  a3: { ...base, happenedAt: '어제 22:00' },
  a4: {
    ...base,
    happenedAt: '방금',
    parkChange: {
      result: 'rejected',
      requestedOn: '11월 17일',
      currentPark: '한강공원',
      requestedPark: '반포한강공원',
      reasonKind: '이미 담당 관리자가 있는 공원이에요',
      reason: '요청한 반포한강공원에 이미 담당 관리자가 있어요. 다른 공원으로 다시 요청해 주세요.',
      robotNames: 'Jubi',
    },
  },
  a5: {
    ...base,
    happenedAt: '어제 14:02',
    robotIssue: {
      kind: '배터리 부족',
      since: '14:02',
      lastPlace: '벤치 쉼터 가는 길',
      battery: 15,
      chargerDistanceM: 320,
    },
  },
};

/** 목업 사진 (서버에서는 photoUrl로 받아요) */
export const MOCK_PHOTOS: Record<string, ImageSource> = {
  'mock:glass': require('../../../assets/images/alert-glass.jpg'),
};
