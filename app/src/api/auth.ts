// 계정 API (C-01 로그인 · C-04 회원가입). 서버: server/AUTH.md (KAN-88)
import { ApiError, mockFor, mockResponse, request, setAuthToken } from './client';
import { mockTakenLoginIds } from './mock/auth';
import { getMockSession, hasMockAccount, openMockSession, saveMockSession } from './mock/onboarding';
import { mockParks } from './mock/parks';
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
    if (mockTakenLoginIds.has(loginId) || (await hasMockAccount(body.loginId))) {
      await mockResponse(null, 300);
      throw new ApiError(409, '이미 사용 중인 아이디 또는 이메일이에요', 'account_exists');
    }
    const selected = mockParks.find((p) => p.id === body.catalogId);
    if (!selected) throw new ApiError(404, '선택한 공원을 찾을 수 없어요', 'park_not_found');
    mockTakenLoginIds.add(loginId);
    await openMockSession(body.loginId, {
      name: body.name,
      email: body.email.toLowerCase(),
      role: 'manager',
      parkStatus: 'pending',
      registrationStatus: 'pending',
      routeSetupDone: false,
    });
    const { distance: _distance, ...park } = selected;
    getMockSession().park = {
      ...park,
      catalogId: body.catalogId,
      status: 'pending',
      routeSetupDone: false,
      rejectReason: null,
    };
    await saveMockSession();
    return mockResponse(
      { id: `${Date.now()}`, name: body.name, email: body.email.toLowerCase(), registrationStatus: 'pending' },
      400,
    );
  }
  return request('/auth/register', { method: 'POST', body: JSON.stringify(body) });
}

/**
 * POST /auth/login : 로그인. 받은 토큰은 바로 저장해서 다음 요청부터 붙여요.
 * isFirstLogin = 순찰 경로 처음 설정을 아직 안 끝냄. 로그인만으로는 바뀌지 않아요.
 *   401 · "invalid_credentials" : 아이디 또는 비밀번호가 틀림 (어느 쪽인지 알려 주지 않아요)
 *   503 · "auth_not_configured" : 서버 JWT 설정이 없음
 */
export async function login(body: LoginRequest, signal?: AbortSignal): Promise<LoginResponse> {
  if (signal?.aborted) throw new Error('로그인이 취소되었어요');
  const session = mockFor('auth') ? await openMockSession(body.loginId) : null;
  if (session && session.profile.role !== 'super_admin' && session.profile.registrationStatus !== 'approved') {
    const rejected = session.profile.registrationStatus === 'rejected';
    throw new ApiError(
      403,
      rejected
        ? '회원가입 신청이 반려되었어요. 총관리자에게 문의해 주세요'
        : '총관리자의 회원가입 승인을 기다리고 있어요. 승인 후 로그인해 주세요',
      rejected ? 'registration_rejected' : 'registration_pending',
    );
  }
  const res = mockFor('auth')
    ? await mockResponse(
        {
          accessToken: 'mock-token',
          tokenType: 'bearer' as const,
          expiresIn: 3600,
          // 목업은 비밀번호를 확인하지 않아요. 첫 설정 여부만 서버처럼 흉내 내요.
          isFirstLogin: !session!.profile.routeSetupDone,
          role: session!.profile.role,
          parkStatus: session!.profile.parkStatus,
          registrationStatus: session!.profile.registrationStatus,
          routeSetupDone: session!.profile.routeSetupDone,
        },
        300,
      )
    : await request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body), signal });
  if (signal?.aborted) throw new Error('로그인이 취소되었어요');
  if (res.role === 'super_admin') {
    setAuthToken(null);
    throw new ApiError(403, '총관리자는 웹페이지에서 로그인해 주세요', 'web_login_required');
  }
  setAuthToken(res.accessToken);
  return res;
}

/** 가입 승인 후에만 로그인하고 최초 순찰 설정으로 이동해요. */
export function onboardingScreen(profile: Pick<LoginResponse, 'role' | 'registrationStatus' | 'routeSetupDone'>) {
  if (profile.role === 'super_admin') return 'Login' as const;
  if (profile.registrationStatus !== 'approved') return 'Login' as const;
  return profile.routeSetupDone ? ('Main' as const) : ('RouteSetup' as const);
}
