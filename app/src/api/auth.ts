// 계정 API (C-01 로그인 · C-04 회원가입)
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError, mockResponse, request, setAuthToken, USE_MOCK } from './client';
import { mockTakenLoginIds } from './mock/auth';
import type { LoginRequest, LoginResponse, SignUpRequest, SignUpResponse } from './types';

/**
 * POST /auth/signup : 회원가입.
 * 실패하면 서버 에러 형식({status, message, code})대로 ApiError를 던져요.
 *   409 · code "duplicate_login_id" : 이미 쓰는 아이디
 *   422 · code "validation_error"   : 형식이 맞지 않는 값 (details에 칸 이름)
 * 경로 · 필드 이름은 API 명세서(KAN-23)가 나오면 맞춰요.
 */
export async function signUp(body: SignUpRequest): Promise<SignUpResponse> {
  if (USE_MOCK) {
    const loginId = body.loginId.trim().toLowerCase();
    if (mockTakenLoginIds.has(loginId)) {
      await mockResponse(null, 300);
      throw new ApiError(409, '이미 쓰고 있는 아이디예요', 'duplicate_login_id');
    }
    mockTakenLoginIds.add(loginId);
    await mockFirstLogin.mark(loginId); // 서버라면 새 계정의 '첫 로그인 전' 상태를 저장해요
    return mockResponse({ id: `u${Date.now()}`, loginId: body.loginId, name: body.name }, 400);
  }
  return request('/auth/signup', { method: 'POST', body: JSON.stringify(body) });
}

/**
 * POST /auth/login : 로그인. 받은 토큰은 바로 저장해서 다음 요청부터 붙여요.
 * 첫 로그인인지(isFirstLogin)는 서버가 판단해서 알려 주고, 응답한 뒤 '첫 로그인 끝'으로 바꿔요.
 *   401 · code "invalid_credentials" : 아이디 또는 비밀번호가 틀림
 */
export async function login(body: LoginRequest): Promise<LoginResponse> {
  const res = USE_MOCK
    ? await mockResponse(
        {
          accessToken: 'mock-token',
          user: { id: 'u1', loginId: body.loginId, name: body.loginId },
          // 목업은 비밀번호를 확인하지 않아요. 가입 직후 첫 로그인 여부만 서버처럼 흉내 내요.
          isFirstLogin: await mockFirstLogin.take(body.loginId),
        },
        300,
      )
    : await request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) });
  setAuthToken(res.accessToken);
  return res;
}

// ---- 목업 전용: 가입 후 첫 로그인 판별 ----
// 서버가 없을 때만 써요. 계정별 상태를 기기(AsyncStorage)에 저장해 새로고침해도 유지돼요. 비밀번호는 저장하지 않아요.
const firstLoginKey = (id: string) => `jubjub:first-login:${id.trim().toLowerCase()}`;

const mockFirstLogin = {
  /** 회원가입 직후: 이 계정의 다음 로그인은 첫 로그인이에요 */
  mark: (id: string) => AsyncStorage.setItem(firstLoginKey(id), 'pending'),
  /** 첫 로그인이면 true를 돌려주고 바로 '끝'으로 바꿔요. 다음 로그인부터는 false예요. */
  async take(id: string) {
    if (!id.trim()) return false;
    if ((await AsyncStorage.getItem(firstLoginKey(id))) !== 'pending') return false;
    await AsyncStorage.setItem(firstLoginKey(id), 'done');
    return true;
  },
};
