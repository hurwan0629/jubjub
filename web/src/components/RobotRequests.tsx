// W-04 로봇 목록 - 배정 요청 알림 · 배정 요청 목록 · 요청 배정 · 요청 반려 (Figma Page 4)
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import * as api from '../api/admin';

const REJECT_REASONS = ['남는 로봇이 없어요', '공원 규모에 비해 많아요'];
const REASON_MAX = 200;
const STATUS: Record<api.AdminRobot['status'], string> = {
  idle: '대기',
  working: '작업 중',
  returning: '복귀 중',
  emptying: '비우는 중',
  offline: '오프라인',
  error: '오류',
};

function when(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** showModal로 여는 대화상자. 닫기(Esc)는 busy가 아닐 때만 받아요. */
function Modal({
  open,
  label,
  busy,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      className="rq-dialog"
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

type Props = {
  requests: api.RobotAssignmentRequest[];
  robots: api.AdminRobot[];
  onChanged: (message: string) => void;
};

/** 목록 위 노란 알림 + 요청 목록 · 배정 · 반려 대화상자 */
export function RobotRequests({ requests, robots, onChanged }: Props) {
  const [listOpen, setListOpen] = useState(false);
  const [assigning, setAssigning] = useState<api.RobotAssignmentRequest>();
  const [rejecting, setRejecting] = useState<api.RobotAssignmentRequest>();
  const free = robots.filter((r) => !r.parkId);
  const running = (req: api.RobotAssignmentRequest) => robots.filter((r) => r.parkId === req.parkId).length;
  const kind = (req: api.RobotAssignmentRequest) => (running(req) ? '추가 요청' : '첫 배정');

  if (requests.length === 0) return null;
  return (
    <>
      <div className="rq-banner" role="status">
        <span className="rq-banner-icon" aria-hidden>
          <img src="/icons/bot-brand.svg" width="20" height="20" alt="" />
        </span>
        <div className="rq-banner-text">
          <strong>로봇 배정 요청이 {requests.length}건 있어요</strong>
          <small>
            {requests
              .slice(0, 2)
              .map((r) => `${r.applicantName} · ${r.parkName} · ${r.robotCount}대 요청`)
              .join('  ·  ')}
          </small>
        </div>
        <button className="rq-button rq-light" onClick={() => setListOpen(true)}>
          요청 보기
        </button>
      </div>

      {/* 배정 요청 목록 */}
      <Modal open={listOpen && !assigning && !rejecting} label="로봇 배정 요청" onClose={() => setListOpen(false)}>
        <div className="rq-body">
          <header className="rq-title">
            <h2>로봇 배정 요청 {requests.length}건</h2>
            <p>관리자 앱에서 들어온 요청이에요. 배정 전 로봇을 맡기거나 사유를 적어 반려할 수 있어요.</p>
          </header>
          <div className="rq-free">
            <strong>
              배정 전 로봇 {free.length}대{free.length ? ` · ${free.map((r) => r.name).join(', ')}` : ''}
            </strong>
            {free.length === 0 ? (
              <span>새 로봇을 등록하거나 다른 공원에서 회수해야 배정할 수 있어요</span>
            ) : requests.length > 1 ? (
              <span>요청한 대수만큼 로봇을 골라 배정해요</span>
            ) : null}
          </div>
          <div className="rq-list">
            {requests.map((req) => (
              <article key={req.id} className="rq-card">
                <div className="rq-card-head">
                  <div className="rq-who">
                    <strong>{req.applicantName}</strong>
                    <small>{req.applicantLoginId}</small>
                  </div>
                  <span className="rq-park">{req.parkName}</span>
                  <small className="rq-time">{when(req.createdAt)}</small>
                </div>
                <div className="rq-count">
                  <span className="rq-badge">{kind(req)}</span>
                  <strong>
                    지금 {running(req)}대{running(req) ? ' 운영 중' : ''} → {running(req) + req.robotCount}대
                  </strong>
                </div>
                <p className={`rq-memo ${req.reason && req.reason !== '로봇 배정 요청' ? '' : 'rq-empty'}`}>
                  {req.reason && req.reason !== '로봇 배정 요청' ? req.reason : '메모 없음'}
                </p>
                <div className="rq-actions">
                  <button className="rq-button rq-danger-soft" onClick={() => setRejecting(req)}>
                    반려
                  </button>
                  <button
                    className="rq-button rq-primary"
                    disabled={free.length < req.robotCount}
                    title={free.length < req.robotCount ? '배정 전 로봇이 모자라요' : undefined}
                    onClick={() => setAssigning(req)}
                  >
                    로봇 고르기
                  </button>
                </div>
              </article>
            ))}
          </div>
          <footer className="rq-footer">
            <button className="rq-button rq-light rq-tall" onClick={() => setListOpen(false)}>
              닫기
            </button>
          </footer>
        </div>
      </Modal>

      {assigning ? (
        <AssignDialog
          request={assigning}
          kindLabel={kind(assigning)}
          running={running(assigning)}
          free={free}
          onClose={() => setAssigning(undefined)}
          onDone={(message) => {
            setAssigning(undefined);
            setListOpen(false);
            onChanged(message);
          }}
        />
      ) : null}
      {rejecting ? (
        <RejectDialog
          request={rejecting}
          kindLabel={kind(rejecting)}
          onClose={() => setRejecting(undefined)}
          onDone={(message) => {
            setRejecting(undefined);
            setListOpen(false);
            onChanged(message);
          }}
        />
      ) : null}
    </>
  );
}

/** 요청 배정: 배정 전 로봇 중에서 요청한 대수만큼 골라요 */
function AssignDialog({
  request,
  kindLabel,
  running,
  free,
  onClose,
  onDone,
}: {
  request: api.RobotAssignmentRequest;
  kindLabel: string;
  running: number;
  free: api.AdminRobot[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [picked, setPicked] = useState<string[]>(free.slice(0, request.robotCount).map((r) => r.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const single = request.robotCount === 1;
  const names = free.filter((r) => picked.includes(r.id)).map((r) => r.name);

  const toggle = (id: string) =>
    setPicked((p) =>
      single ? [id] : p.includes(id) ? p.filter((x) => x !== id) : p.length < request.robotCount ? [...p, id] : p,
    );

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.approveRobotAssignment(request.id, picked);
      onDone(
        `${names.join(', ')}을 ${request.applicantName} 관리자에게 배정했어요. 관리자가 앱에서 경로를 정하면 순찰을 시작해요.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '배정하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open label="요청 배정" busy={busy} onClose={onClose}>
      <div className="rq-body">
        <header className="rq-title">
          <h2>{request.applicantName} 관리자에게 어떤 로봇을 맡길까요?</h2>
          <p>배정 전 로봇 중에서 {single ? '골라' : `${request.robotCount}대를 골라`} 주세요</p>
        </header>
        <div className="rq-request">
          <div className="rq-count">
            <span className="rq-badge">{kindLabel}</span>
            <strong className="rq-request-line">
              {request.applicantName} · {request.parkName} · 지금 {running}대 → {running + request.robotCount}대
            </strong>
          </div>
          <p>{request.reason && request.reason !== '로봇 배정 요청' ? request.reason : '메모 없음'}</p>
        </div>
        <strong className="rq-label">배정 전 로봇</strong>
        <div className="rq-robots" role={single ? 'radiogroup' : 'group'} aria-label="배정 전 로봇">
          {free.map((r) => {
            const on = picked.includes(r.id);
            return (
              <label key={r.id} className={`rq-robot ${on ? 'on' : ''}`}>
                <input
                  type={single ? 'radio' : 'checkbox'}
                  name="assign-robot"
                  checked={on}
                  disabled={busy}
                  onChange={() => toggle(r.id)}
                />
                <span className="rq-robot-icon">
                  <img src="/icons/bot-brand.svg" width="20" height="20" alt="" />
                </span>
                <span className="rq-robot-text">
                  <strong>{r.name}</strong>
                  <small>
                    S/N {r.serialNo}
                    {r.batteryVoltage != null ? ` · 배터리 ${r.batteryVoltage}V` : ''} · {STATUS[r.status]}
                  </small>
                </span>
              </label>
            );
          })}
        </div>
        {picked.length === request.robotCount ? (
          <div className="rq-info">
            <strong>
              {request.applicantName} 관리자는 로봇 {running + request.robotCount}대를 운영하게 돼요
            </strong>
            <p>
              {names.join(', ')}은 {request.parkName}에서 일해요. 관리자 앱에 배정 알림이 가고, 홈에 순찰 경로를 처음
              정하는 카드가 떠요.
            </p>
          </div>
        ) : (
          <p className="rq-hint">
            {request.robotCount}대를 골라 주세요 · 지금 {picked.length}대 골랐어요
          </p>
        )}
        {error ? (
          <p className="rq-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="rq-footer">
          <button className="rq-button rq-light rq-tall" disabled={busy} onClick={onClose}>
            취소
          </button>
          <button
            className="rq-button rq-primary rq-tall"
            disabled={busy || picked.length !== request.robotCount}
            onClick={submit}
          >
            {busy ? '배정 중…' : '배정하기'}
          </button>
        </footer>
      </div>
    </Modal>
  );
}

/** 요청 반려: 빠른 사유를 고르거나 직접 적어요 (최대 200자) */
function RejectDialog({
  request,
  kindLabel,
  onClose,
  onDone,
}: {
  request: api.RobotAssignmentRequest;
  kindLabel: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [chip, setChip] = useState<string>('직접 입력');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const trimmed = reason.trim();

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.rejectRobotAssignment(request.id, trimmed);
      onDone(`${request.applicantName} 관리자의 요청을 반려했어요. 사유는 관리자 앱 알림으로 전달돼요.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '반려하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open label="요청 반려" busy={busy} onClose={onClose}>
      <div className="rq-body">
        <header className="rq-title">
          <h2>{request.applicantName} 관리자의 요청을 반려할까요?</h2>
          <p>반려 사유는 관리자 앱 알림으로 전달돼요</p>
        </header>
        <div className="rq-request">
          <div className="rq-count">
            <span className="rq-badge">{kindLabel}</span>
            <strong className="rq-request-line">
              {request.applicantName} · {request.parkName} · 로봇 {request.robotCount}대 요청
            </strong>
          </div>
          <p className={request.reason && request.reason !== '로봇 배정 요청' ? '' : 'rq-muted'}>
            {request.reason && request.reason !== '로봇 배정 요청' ? request.reason : '메모 없음'}
          </p>
        </div>
        <div className="rq-label">
          반려 사유 <span className="rq-required">필수</span>
        </div>
        <div className="rq-chips">
          {[...REJECT_REASONS, '직접 입력'].map((c) => (
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
        <label className="rq-textarea">
          <textarea
            aria-label="반려 사유"
            maxLength={REASON_MAX}
            value={reason}
            disabled={busy}
            placeholder="사유를 입력해 주세요"
            onChange={(e) => {
              setReason(e.target.value);
              setChip('직접 입력');
            }}
          />
          <small>
            {reason.length} / {REASON_MAX}
          </small>
        </label>
        {error ? (
          <p className="rq-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="rq-footer">
          <button className="rq-button rq-light rq-tall" disabled={busy} onClick={onClose}>
            취소
          </button>
          <button className="rq-button rq-danger rq-tall" disabled={busy || !trimmed} onClick={submit}>
            {busy ? '반려 중…' : '반려하기'}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
