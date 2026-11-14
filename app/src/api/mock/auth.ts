// 회원가입 목업. 이미 있는 아이디로 가입하면 서버처럼 409 에러를 내요 (중복 확인 화면 점검용).
export const mockTakenLoginIds = new Set(['admin', 'jubjub']);
