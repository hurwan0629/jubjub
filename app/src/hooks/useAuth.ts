import { login, prepareReapplication, reapply, signUp } from '@/api/auth';

/** 계정 화면에서 실제 서버와 목업에 같은 동작을 요청해요. */
export function useAuth() {
  return { login, prepareReapplication, reapply, signUp };
}
