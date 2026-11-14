// 입력값 검사 (C-04 회원가입). 서버도 같은 규칙으로 한 번 더 확인해야 해요.

export const RULES = {
  loginId: /^[A-Za-z0-9]{4,16}$/, // 영문 · 숫자 4~16자
  password: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/, // 영문 · 숫자 포함 8자 이상
  name: /^.{1,20}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^01[016789]\d{7,8}$/, // 휴대폰 번호 (숫자만)
} as const;

export const INVALID = '올바른 정보를 입력해 주세요';
export const PASSWORD_MISMATCH = '비밀번호가 서로 달라요';

/** 전화번호에서 숫자만 남겨요 */
export const digitsOnly = (v: string) => v.replace(/\D/g, '');

/** 01012345678 → 010-1234-5678 (입력하는 동안 보기 좋게) */
export function formatPhone(v: string) {
  const d = digitsOnly(v).slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
}
