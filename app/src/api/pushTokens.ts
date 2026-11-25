// 알림 푸시 기기 등록 API. 서버: PUT/DELETE /push-tokens (server/app/routers/notifications.py)
// 기기의 Expo 푸시 토큰을 얻으려면 expo-notifications 모듈이 앱 빌드에 들어가야 해요 (아직 설치 전).
import { Platform } from 'react-native';

import { mockFor, request } from './client';

/** Expo 푸시 토큰 모양 (서버 검사와 같아요) */
const EXPO_TOKEN = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

/** PUT /push-tokens: 이 기기의 토큰 등록 · 갱신 (로그인 후) */
export async function registerPushToken(token: string): Promise<void> {
  if (mockFor('notifications') || !EXPO_TOKEN.test(token)) return;
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
  await request('/push-tokens', { method: 'PUT', body: JSON.stringify({ token, platform: Platform.OS }) });
}

/** DELETE /push-tokens: 로그아웃 · 알림 권한 해제 때 이 기기 토큰 해제 */
export async function unregisterPushToken(token: string): Promise<void> {
  if (mockFor('notifications') || !EXPO_TOKEN.test(token)) return;
  await request('/push-tokens', { method: 'DELETE', body: JSON.stringify({ token }) });
}
