import AsyncStorage from '@react-native-async-storage/async-storage';

// 계정별 "순찰 경로 처음 설정" 상태를 기기에 저장해요.
// 서버가 생기기 전까지 쓰는 임시 저장소예요. 비밀번호는 저장하지 않아요.
const key = (id: string) => `jubjub:route-setup:${id.trim().toLowerCase()}`;

/** 회원가입 직후: 이 계정은 첫 로그인 때 순찰 경로 설정을 보여 줘야 해요 */
export async function markNeedsRouteSetup(id: string) {
  await AsyncStorage.setItem(key(id), 'pending');
}

/**
 * 로그인할 때 호출해요. 가입 후 첫 로그인이면 true를 돌려주고 바로 '보여 줌'으로 바꿔서
 * 다음 로그인부터는 다시 뜨지 않아요.
 */
export async function takeFirstLoginRouteSetup(id: string): Promise<boolean> {
  if (!id.trim()) return false;
  const state = await AsyncStorage.getItem(key(id));
  if (state !== 'pending') return false;
  await AsyncStorage.setItem(key(id), 'shown');
  return true;
}
