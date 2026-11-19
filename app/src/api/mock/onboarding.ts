import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AssignedRobot, LatLng, ManagedPark, ParkChange, Profile, RouteConfig } from '../types';
import { mockProfile } from './account';

type Session = {
  application?: { loginId: string; phone: string };
  parkChanges?: ParkChange[];
  profile: Profile;
  park: ManagedPark | null;
  route: RouteConfig | null;
  robots?: AssignedRobot[];
  robotRoutes?: Record<string, RouteConfig>;
  station?: LatLng | null;
};
let loginId = '';
const key = () => `jubjub:onboarding:${loginId}`;
export const hasMockAccount = async (id: string) =>
  (await AsyncStorage.getItem(`jubjub:onboarding:${id.trim()}`)) !== null;
let session: Session = { profile: { ...mockProfile }, park: null, route: null };

export async function openMockSession(id: string, profile?: Profile) {
  loginId = id.trim();
  const saved = profile ? null : await AsyncStorage.getItem(key());
  session = saved ? JSON.parse(saved) : { profile: profile ?? { ...mockProfile }, park: null, route: null };
  if (session.profile.registrationStatus === undefined) session.profile.registrationStatus = session.profile.parkStatus;
  await saveMockSession();
  return session;
}

export const getMockSession = () => session;
export const saveMockSession = () => AsyncStorage.setItem(key(), JSON.stringify(session));
