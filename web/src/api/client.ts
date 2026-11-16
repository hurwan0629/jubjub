// 웹 세션은 앱 세션과 별개예요. 토큰을 메모리에만 보관해요.
let apiBase = '/api';
let token: string | null = null;
export const configureApi = (base: string) => {
  apiBase = base.replace(/\/$/, '');
};
export const setAuthToken = (value: string | null) => {
  token = value;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError(0, '서버에 연결하지 못했어요. 서버 실행 상태를 확인해 주세요', 'network_error');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 401) setAuthToken(null);
    throw new ApiError(response.status, body?.message ?? `요청을 처리하지 못했어요 (${response.status})`, body?.code);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
