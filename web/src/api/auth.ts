import { ApiError, request, setAuthToken } from './client';
import type { LoginRequest, LoginResponse } from './types';

export async function login(body: LoginRequest, signal?: AbortSignal): Promise<LoginResponse> {
  setAuthToken(null);
  const result = await request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body), signal });
  if (signal?.aborted) throw new Error('로그인이 취소되었어요');
  if (result.role !== 'super_admin')
    throw new ApiError(403, '하위관리자는 모바일 앱에서 로그인해 주세요', 'app_login_required');
  setAuthToken(result.accessToken);
  return result;
}
export function logout() {
  setAuthToken(null);
}
