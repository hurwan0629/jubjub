import { useEffect, useRef } from 'react';
import type { ParkChange } from '../api/admin';
export function ParkChangeRejectDialog({
  target,
  reason,
  busy,
  error,
  onReason,
  onClose,
  onSubmit,
}: {
  target: ParkChange;
  reason: string;
  busy: boolean;
  error: string;
  onReason: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="decision-dialog"
      aria-labelledby="change-reject-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && reason.trim()) onSubmit();
        }}
      >
        <h2 id="change-reject-title">공원 변경 반려</h2>
        <div className="dialog-body">
          <div className="applicant-summary">
            <strong>
              {target.applicantName} · {target.applicantLoginId}
            </strong>
            <span>
              {target.currentParkName} → {target.requestedParkName}
            </span>
            <small>{target.requestedParkAddress}</small>
          </div>
          <h3>신청 사유</h3>
          <p>{target.reason}</p>
          <label htmlFor="change-reject-reason">반려 사유 (필수)</label>
          <textarea
            id="change-reject-reason"
            placeholder="사유를 입력해 주세요"
            required
            maxLength={1000}
            value={reason}
            disabled={busy}
            onChange={(e) => onReason(e.target.value)}
          />
          <small className="muted">{reason.length}/1000</small>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
        </div>
        <footer className="dialog-actions">
          <button type="button" className="button soft" onClick={onClose} disabled={busy}>
            돌아가기
          </button>
          <button className="button danger" disabled={busy || !reason.trim()}>
            {busy ? '처리 중…' : '반려'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
