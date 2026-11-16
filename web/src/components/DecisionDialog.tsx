import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AdminRobot, Registration } from '../api/admin';

export type Action = 'approve' | 'reject' | 'revoke';
export type Decision = { action: Action; registration: Registration };
const LABEL = { approve: '가입 승인', reject: '가입 반려', revoke: '승인 취소' };

export function DecisionDialog({
  target,
  robots,
  busy,
  onClose,
  onSubmit,
}: {
  target: Decision;
  robots: AdminRobot[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string, ids: string[]) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const { action, registration: row } = target;
  const eligible = robots.filter((robot) => robot.parkId === null && ['idle', 'offline'].includes(robot.status));
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    try {
      await onSubmit(reason.trim(), selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리하지 못했어요. 다시 시도해 주세요');
    }
  };
  return (
    <dialog
      ref={dialog}
      className="decision-dialog"
      aria-labelledby="decision-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <h2 id="decision-title">{LABEL[action]}</h2>
        <div className="dialog-body">
          <div className="applicant-summary">
            <strong>
              {row.applicantName} · {row.applicantLoginId}
            </strong>
            <span>{row.name}</span>
            <small>
              {row.applicantPhone} · {row.applicantEmail}
            </small>
          </div>
          {action === 'approve' ? (
            <>
              <h3>담당 로봇 선택 (선택)</h3>
              <p className="muted">미할당 로봇만 선택할 수 있어요. 로봇 없이도 가입을 승인할 수 있어요.</p>
              {eligible.length === 0 ? (
                <p className="muted">현재 배정 가능한 로봇이 없어요.</p>
              ) : (
                eligible.map((robot) => (
                  <label className="robot-option" key={robot.id}>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={selected.includes(robot.id)}
                      onChange={() =>
                        setSelected((ids) =>
                          ids.includes(robot.id) ? ids.filter((id) => id !== robot.id) : [...ids, robot.id],
                        )
                      }
                    />
                    <span>
                      <strong>{robot.name}</strong>
                      <small>{robot.serialNo}</small>
                    </span>
                    <small>{robot.status === 'idle' ? '대기' : '오프라인'}</small>
                  </label>
                ))
              )}
            </>
          ) : (
            <>
              <label htmlFor="decision-reason">{action === 'reject' ? '반려 사유' : '승인 취소 사유'} (필수)</label>
              {action === 'revoke' ? (
                <p className="warning-text">
                  담당 로봇을 회수하고 관리자 로그인을 차단해요. 작업 중인 로봇이 있으면 취소할 수 없어요.
                </p>
              ) : null}
              <textarea
                id="decision-reason"
                placeholder="사유를 입력해 주세요"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                disabled={busy}
                required
              />
              <small className="muted">{reason.length}/1000</small>
            </>
          )}
          {error ? (
            <p className="error-text" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="dialog-actions">
          <button type="button" className="button soft" onClick={onClose} disabled={busy}>
            돌아가기
          </button>
          <button
            className={`button ${action === 'approve' ? 'primary' : 'danger'}`}
            disabled={busy || (action !== 'approve' && !reason.trim())}
          >
            {busy ? '처리 중…' : LABEL[action]}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
