// 서버 통신 공통 함수.
// EXPO_PUBLIC_API_URL 이 비어 있으면 목업 데이터(api/mock)를 써요. 백엔드가 생기면 app/.env 에 주소만 넣으면 돼요.

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
export const USE_MOCK = API_URL === '';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let authToken: string | null = null;

/** 로그인 후 받은 JWT를 저장해 다음 요청부터 붙여요 */
export function setAuthToken(token: string | null) {
  authToken = token;
}

/** 실제 서버에 요청해요. 응답이 2xx가 아니면 ApiError를 던져요. */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : null),
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `${init.method ?? 'GET'} ${path} 실패 (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** 목업 응답: 네트워크처럼 잠깐 기다렸다가 복사본을 돌려줘요 (화면에서 고쳐도 원본이 안 바뀌게) */
export function mockResponse<T>(data: T, delayMs = 200): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(data)), delayMs));
}
