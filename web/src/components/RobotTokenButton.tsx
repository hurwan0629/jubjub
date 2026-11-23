export function RobotTokenButton({
  tokenIssuedAt,
  disabled,
  onIssue,
}: {
  tokenIssuedAt?: string | null;
  disabled: boolean;
  onIssue: () => void;
}) {
  // 발급 여부를 알 수 없는 이전 서버 응답에서도 기존 토큰을 덮어쓰지 않아요.
  if (tokenIssuedAt !== null) return null;
  return (
    <button className="button soft compact-button" disabled={disabled} onClick={onIssue}>
      토큰 발급
    </button>
  );
}
