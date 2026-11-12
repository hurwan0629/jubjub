// 서버 통신 공통 함수.
// EXPO_PUBLIC_API_URL 이 비어 있으면 목업 데이터(api/mock)를 써요. 주소를 넣으면 서버에 만들어진 API(SERVER_READY)만
// 서버로 보내고, 나머지는 계속 목업을 써요. 백엔드가 API를 만들면 SERVER_READY에 추가해요.

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
export const USE_MOCK = API_URL === '';

/** 서버 API 묶음. 파일(api/<자원>.ts)마다 하나씩이에요. */
export type ApiResource =
  | 'auth' // 로그인 · 회원가입
  | 'me' // 내 정보
  | 'settings'
  | 'notifications'
  | 'map'
  | 'parks'
  | 'reports'
  | 'robot'
  | 'route'
  | 'decisions';

/**
 * 서버에 이미 만들어진 API. EXPO_PUBLIC_API_URL 이 있어도 여기 없는 자원은 목업을 써요.
 * 백엔드가 API를 만들면 여기에 추가해요. (server/AUTH.md: 로그인 · 회원가입 · /me, server/PARKS.md: 공원 검색)
 */
const SERVER_READY: readonly ApiResource[] = ['auth', 'me', 'parks'];

/** 이 자원을 목업으로 처리할지 */
export const mockFor = (resource: ApiResource) => USE_MOCK || !SERVER_READY.includes(resource);

/** 422 입력 오류의 칸별 이유 (server/app/core/errors.py). field 예) "body.loginId" */
export type ApiErrorDetail = { field: string; reason: string };

/**
 * 서버 에러 응답 형식 (server/app/core/errors.py): {"status": 404, "message": "...", "code": "not_found", "details"?}
 * 서버에 닿지 못하면 status 0 · code "network_error" 예요.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: ApiErrorDetail[],
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
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : null),
        ...init.headers,
      },
    });
  } catch {
    // 서버가 꺼져 있거나 주소 · Wi-Fi가 달라서 응답 자체를 못 받았어요
    throw new ApiError(0, '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요', 'network_error');
  }
  if (!res.ok) {
    // 서버가 보낸 message가 있으면 그대로 쓰고, 없으면(네트워크 장비 에러 등) 기본 문구를 써요
    const body = (await res.json().catch(() => null)) as {
      message?: string;
      code?: string;
      details?: ApiErrorDetail[];
    } | null;
    throw new ApiError(
      res.status,
      body?.message ?? `${init.method ?? 'GET'} ${path} 실패 (${res.status})`,
      body?.code,
      Array.isArray(body?.details) ? body.details : undefined,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** 목업 응답: 네트워크처럼 잠깐 기다렸다가 복사본을 돌려줘요 (화면에서 고쳐도 원본이 안 바뀌게) */
export function mockResponse<T>(data: T, delayMs = 200): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(data)), delayMs));
}
