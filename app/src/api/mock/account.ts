import type { NotificationSettings, OperationSettings, ParkChangeRequest, Profile } from '../types';

export const mockProfile: Profile = {
  name: '공원 관리자',
  email: 'jubjub@hangang.kr',
  role: 'manager',
  parkStatus: 'approved',
  registrationStatus: 'approved',
  routeSetupDone: true,
};

export const mockNotificationSettings: NotificationSettings = {
  unpickable: true,
  dailyReport: true,
};

export const mockOperationSettings: OperationSettings = {
  chargeAt: 20,
  emptyAt: 80,
  agentPaused: false,
};

/** 확인 중인 공원 변경 요청 (없으면 null) */
export const mockParkChange: { current: ParkChangeRequest | null } = { current: null };
