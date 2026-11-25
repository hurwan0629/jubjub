import { useEffect, useRef } from 'react';
import type { AdminRobot, ParkChange } from '../api/admin';

export function ParkChangeDetailDialog({
  request,
  robots,
  robotsLoading,
  robotsError,
  busy,
  error,
  onClose,
  onReject,
  onApprove,
}: {
  request: ParkChange;
  robots: AdminRobot[];
  robotsLoading: boolean;
  robotsError: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onReject: () => void;
  onApprove: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  const assigned = robots.filter((robot) => robot.parkId === request.parkId);
  const names = assigned.map((robot) => robot.name).join(', ');
  const robotSummary = robotsLoading
    ? '담당 로봇 확인 중…'
    : robotsError
      ? '담당 로봇 조회 실패'
      : names
        ? `${names} 운영 중`
        : '배정된 로봇 없음';
  const requested = new Date(request.createdAt).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
  });
  return (
    <dialog
      ref={ref}
      className="decision-dialog park-change-dialog"
      aria-labelledby="park-change-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && !request.conflictingManagerName) onApprove();
        }}
      >
        <header className="park-change-heading">
          <h2 id="park-change-title">{request.applicantName} 관리자의 공원 변경 요청</h2>
          <p>
            {request.applicantLoginId} · {requested} 요청
          </p>
        </header>
        <div className="dialog-body">
          <div className="park-change-comparison">
            <section className="park-change-current">
              <small>현재 공원</small>
              <strong>{request.currentParkName}</strong>
              <p>{robotSummary}</p>
            </section>
            <span className="park-change-arrow" aria-hidden="true">
              →
            </span>
            <section className="park-change-requested">
              <small>요청 공원</small>
              <strong>{request.requestedParkName}</strong>
              <p>
                {request.conflictingManagerName ? `담당 관리자 ${request.conflictingManagerName}` : '담당 관리자 없음'}
                {!robotsLoading && !robotsError && names ? ` · ${names} 함께 이동` : ''}
              </p>
            </section>
          </div>
          <section className="park-change-reason">
            <h3>요청 사유</h3>
            <p>{request.reason}</p>
          </section>
          <section className="park-change-notice">
            <h3>
              {names ? `${names}도 ${request.applicantName} 관리자와 함께 옮겨가요` : '공원 변경 전에 확인해 주세요'}
            </h3>
            <p>
              {request.conflictingManagerName
                ? `요청한 공원은 현재 ${request.conflictingManagerName} 관리자가 담당하고 있어요. 중복 담당자를 확인한 후 승인할 수 있어요.`
                : '요청한 공원은 지금 담당 관리자가 없어서 승인할 수 있어요.'}{' '}
              {names ? `승인하면 ${names}도 새 공원 소속으로 바뀌어요. ` : ''}공원이 달라져서 기존 순찰 경로는
              비활성화되고 지도 지점과 시간표, 운영 설정이 초기화돼요. 관리자 앱에서 경로와 시간을 다시 설정해야 해요.
            </p>
          </section>
          {robotsError && (
            <p className="error-text" role="alert">
              {robotsError}
            </p>
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="dialog-actions park-change-actions">
          <button type="button" className="button soft" disabled={busy} onClick={onClose}>
            취소
          </button>
          <button type="button" className="button reject-outline" disabled={busy} onClick={onReject}>
            반려
          </button>
          <button className="button orange" disabled={busy || !!request.conflictingManagerName}>
            {busy ? '처리 중…' : '승인하기'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
