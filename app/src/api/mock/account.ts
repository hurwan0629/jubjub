import type { NotificationSettings, Profile } from '../types';

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
