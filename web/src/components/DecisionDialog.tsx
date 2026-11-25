// W-02 관리자 보기 - 가입 승인 · 반려 사유 입력 · 승인 취소 (Figma Page 4 · 377:881)
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AdminRobot, Registration } from '../api/admin';

export type Action = 'approve' | 'reject' | 'revoke';
export type Decision = { action: Action; registration: Registration };

/** 자주 쓰는 반려 사유 (Figma "자주 쓰는 사유") */
const REJECT_REASONS = ['이미 담당 관리자가 있는 공원이에요', '입력한 정보가 맞지 않아요', '관리 대상 공원이 아니에요'];
const REVOKE_REASONS = ['담당자가 바뀌었어요', '공원 운영을 그만둬요'];
const REASON_MAX = 200;

function appliedOn(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : ` · ${d.getMonth() + 1}월 ${d.getDate()}일 신청`;
}

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
  const [chip, setChip] = useState('직접 입력');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const { action, registration: row } = target;
  const eligible = robots.filter((robot) => robot.parkId === null && ['idle', 'offline'].includes(robot.status));
  const chips = action === 'reject' ? REJECT_REASONS : REVOKE_REASONS;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (action === 'approve' && row.canApprove === false) {
      setError(row.approvalBlockReason ?? '현재 승인할 수 없는 신청이에요');
      return;
    }
    setError('');
    try {
      await onSubmit(reason.trim(), selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리하지 못했어요. 다시 시도해 주세요');
    }
  };
  const title =
    action === 'approve'
      ? `${row.applicantName} 관리자의 가입을 승인할까요?`
      : action === 'reject'
        ? `${row.applicantName} 관리자의 가입을 반려할까요?`
        : `${row.applicantName} 관리자의 승인을 취소할까요?`;
  return (
    <dialog
      ref={dialog}
      className="rq-dialog decision-modal"
      aria-labelledby="decision-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form className="rq-body" onSubmit={submit}>
        <header className="rq-title">
          <h2 id="decision-title">{title}</h2>
          <p>
            {row.applicantLoginId} · {row.name}
            {appliedOn(row.createdAt)}
          </p>
        </header>

        {action === 'approve' ? (
          <>
            <div className="applicant-summary">
              <strong>
                {row.applicantName} · {row.applicantLoginId}
              </strong>
              <span>{row.name}</span>
              <small>
                {row.applicantPhone || '전화번호 미등록'} · {row.applicantEmail}
              </small>
            </div>
            {row.approvalBlockReason ? (
              <p className="rq-error" role="alert">
                {row.approvalBlockReason}
              </p>
            ) : null}
            <div className="rq-label">
              담당 로봇 <span className="rq-optional">선택</span>
            </div>
            <p className="rq-hint">
              배정 전 로봇만 고를 수 있어요. 로봇 없이 승인하고 나중에 로봇 목록에서 배정해도 돼요.
            </p>
            <div className="rq-robots">
              {eligible.length === 0 ? (
                <p className="rq-hint">지금 배정할 수 있는 로봇이 없어요.</p>
              ) : (
                eligible.map((robot) => {
                  const on = selected.includes(robot.id);
                  return (
                    <label key={robot.id} className={`rq-robot ${on ? 'on' : ''}`}>
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={on}
                        onChange={() =>
                          setSelected((ids) =>
                            ids.includes(robot.id) ? ids.filter((id) => id !== robot.id) : [...ids, robot.id],
                          )
                        }
                      />
                      <span className="rq-robot-icon">
                        <img src="/icons/bot-brand.svg" width="20" height="20" alt="" />
                      </span>
                      <span className="rq-robot-text">
                        <strong>{robot.name}</strong>
                        <small>
                          S/N {robot.serialNo} · {robot.status === 'idle' ? '대기' : '오프라인'}
                        </small>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <>
            {action === 'revoke' ? (
              <div className="tk-caution">
                <strong>담당 로봇을 회수하고 관리자 로그인을 막아요</strong>
                <p>작업 중인 로봇이 있으면 취소할 수 없어요.</p>
              </div>
            ) : null}
            <div className="rq-label">
              {action === 'reject' ? '반려 사유' : '승인 취소 사유'} <span className="rq-required">필수</span>
            </div>
            <div className="rq-chips">
              {[...chips, '직접 입력'].map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`rq-chip ${chip === c ? 'on' : ''}`}
                  aria-pressed={chip === c}
                  disabled={busy}
                  onClick={() => {
                    setChip(c);
                    if (c !== '직접 입력') setReason(c);
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
            <label className="rq-textarea decision-textarea">
              <textarea
                id="decision-reason"
                aria-label={action === 'reject' ? '반려 사유' : '승인 취소 사유'}
                placeholder="사유를 입력해 주세요"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setChip('직접 입력');
                }}
                maxLength={REASON_MAX}
                disabled={busy}
                required
              />
              <small>
                {reason.length} / {REASON_MAX}
              </small>
            </label>
            <p className="rq-hint">
              {action === 'reject'
                ? '반려 사유는 신청자가 앱에 로그인하면 보여요. 신청자는 정보를 고쳐 다시 신청할 수 있어요.'
                : '승인 취소 사유는 관리자 앱 알림으로 전달돼요.'}
            </p>
          </>
        )}

        {error ? (
          <p className="rq-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="rq-footer">
          <button type="button" className="rq-button rq-light rq-tall" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button
            className={`rq-button rq-tall ${action === 'approve' ? 'rq-primary' : 'rq-danger'}`}
            disabled={
              busy || (action === 'approve' && row.canApprove === false) || (action !== 'approve' && !reason.trim())
            }
          >
            {busy ? '처리 중…' : action === 'approve' ? '승인하기' : action === 'reject' ? '반려하기' : '승인 취소하기'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
