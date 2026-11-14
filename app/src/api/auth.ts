// 계정 API (C-01 로그인 · C-04 회원가입). 서버: server/AUTH.md (KAN-88)
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError, mockFor, mockResponse, request, setAuthToken } from './client';
import { mockTakenLoginIds } from './mock/auth';
import type { LoginRequest, LoginResponse, SignUpRequest, SignUpResponse } from './types';

/**
 * POST /auth/register : 회원가입 (201).
 * 실패하면 서버 에러 형식({status, message, code, details})대로 ApiError를 던져요.
 *   409 · "account_exists"   : 이미 쓰는 아이디 또는 이메일
 *   422 · "validation_error" : 형식이 맞지 않는 값. details[].field 에 칸 이름 ("body.loginId")
 */
export async function signUp(body: SignUpRequest): Promise<SignUpResponse> {
  if (mockFor('auth')) {
    const loginId = body.loginId.trim().toLowerCase();
    if (mockTakenLoginIds.has(loginId)) {
      await mockResponse(null, 300);
      throw new ApiError(409, '이미 사용 중인 아이디 또는 이메일이에요', 'account_exists');
    }
    mockTakenLoginIds.add(loginId);
    await mockRouteSetup.set(loginId, 'pending'); // 서버의 users.route_setup_done = false
    return mockResponse({ id: `${Date.now()}`, name: body.name, email: body.email.toLowerCase() }, 400);
  }
  return request('/auth/register', { method: 'POST', body: JSON.stringify(body) });
}

/**
 * POST /auth/login : 로그인. 받은 토큰은 바로 저장해서 다음 요청부터 붙여요.
 * isFirstLogin = 순찰 경로 처음 설정을 아직 안 끝냄. 로그인만으로는 바뀌지 않아요.
 *   401 · "invalid_credentials" : 아이디 또는 비밀번호가 틀림 (어느 쪽인지 알려 주지 않아요)
 *   503 · "auth_not_configured" : 서버 JWT 설정이 없음
 */
export async function login(body: LoginRequest): Promise<LoginResponse> {
  const res = mockFor('auth')
    ? await mockResponse(
        {
          accessToken: 'mock-token',
          tokenType: 'bearer' as const,
          expiresIn: 3600,
          // 목업은 비밀번호를 확인하지 않아요. 첫 설정 여부만 서버처럼 흉내 내요.
          isFirstLogin: (await mockRouteSetup.get(body.loginId)) === 'pending',
        },
        300,
      )
    : await request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) });
  setAuthToken(res.accessToken);
  lastLoginId = body.loginId;
  return res;
}

let lastLoginId = '';

/**
 * 순찰 경로 처음 설정(C-03)을 끝냈어요. 다음 로그인부터는 A-01 홈으로 가요.
 * 서버에는 아직 완료 API가 없어요 (server/AUTH.md: route_setup_done 저장 API는 다음 작업).
 * 생기면 여기서 호출해요. 그전까지 서버 연결 시에는 새 계정이 로그인할 때마다 C-03으로 가요.
 */
export async function completeRouteSetup(): Promise<void> {
  if (mockFor('auth')) {
    if (lastLoginId) await mockRouteSetup.set(lastLoginId, 'done');
  }
}

// ---- 목업 전용: 계정별 순찰 경로 처음 설정 상태 (서버의 users.route_setup_done) ----
// 기기(AsyncStorage)에 저장해 새로고침해도 유지돼요. 비밀번호는 저장하지 않아요.
const routeSetupKey = (id: string) => `jubjub:route-setup:${id.trim().toLowerCase()}`;

const mockRouteSetup = {
  get: (id: string) => (id.trim() ? AsyncStorage.getItem(routeSetupKey(id)) : Promise.resolve(null)),
  set: (id: string, state: 'pending' | 'done') => AsyncStorage.setItem(routeSetupKey(id), state),
};
