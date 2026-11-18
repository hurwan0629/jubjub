import { useEffect, useState } from 'react';
import { getParkChanges } from '../api/admin';
import type { AdminRobot, Registration } from '../api/admin';
import { Pagination } from './Pagination';
import { paginate } from './pageData';

const STATUS: Record<AdminRobot['status'], string> = {
  idle: '대기',
  working: '작업 중',
  charging: '충전 중',
  emptying: '비우는 중',
  offline: '오프라인',
  error: '오류',
};
export function AdminHome({
  registrations,
  robots,
  loading,
  error,
  onManagers,
  onParkChanges,
  onRobots,
  onReload,
}: {
  registrations: Registration[];
  robots: AdminRobot[];
  loading: boolean;
  error?: string;
  onManagers: () => void;
  onParkChanges: () => void;
  onRobots: () => void;
  onReload: () => void;
}) {
  const [page, setPage] = useState(1);
  const [changeCount, setChangeCount] = useState<number>();
  const [changeError, setChangeError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setChangeCount(undefined);
    setChangeError('');
    void getParkChanges(controller.signal)
      .then((requests) => {
        if (!controller.signal.aborted)
          setChangeCount(new Set(requests.filter((r) => r.status === 'pending').map((r) => r.userId)).size);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setChangeError(e instanceof Error ? e.message : '공원 변경 대기 인원을 불러오지 못했어요.');
      });
    return () => controller.abort();
  }, [revision]);
  const list = paginate(robots, page);
  const pending = registrations.filter((r) => r.registrationStatus === 'pending').length;
  return (
    <>
      <div className="home-stats">
        {[
          ['전체 로봇', robots.length, '대의 Jubi가 등록되어 있어요'],
          [
            '작업 중',
            robots.filter((r) => ['working', 'emptying'].includes(r.status)).length,
            '대가 공원을 관리하고 있어요',
          ],
          [
            '승인된 관리자',
            registrations.filter((r) => r.registrationStatus === 'approved').length,
            '명이 공원을 관리하고 있어요',
          ],
          ['가입 승인 대기', pending, '건의 신청을 확인해 주세요'],
        ].map(([label, value, description]) => (
          <section className="home-stat" key={label}>
            <span>{label}</span>
            <strong>{loading ? '—' : value}</strong>
            <small>{description}</small>
          </section>
        ))}
        <button className="home-stat home-stat-link" onClick={onParkChanges} aria-label="공원 변경 승인 대기 보기">
          <span>공원 변경 승인 대기</span>
          <strong>{changeCount ?? '—'}</strong>
          <small>{changeError ? '조회 실패 · 다시 확인해 주세요' : '명의 신청을 확인해 주세요'}</small>
        </button>
      </div>
      {changeError && (
        <p role="alert" className="error-panel">
          {changeError}{' '}
          <button className="button soft compact-button" onClick={() => setRevision((v) => v + 1)}>
            다시 시도
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="error-panel">
          {error}
        </p>
      )}
      <div className="home-columns">
        <section className="board">
          <div className="toolbar">
            <h2>로봇 운영 현황</h2>
            <button
              className="refresh-button"
              onClick={() => {
                onReload();
                setRevision((v) => v + 1);
              }}
              disabled={loading}
            >
              새로고침
            </button>
          </div>
          <div className="table-scroll">
            <table className="home-table">
              <thead>
                <tr>
                  {['로봇', '담당 공원', '관리자', '상태'].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.items.map((r) => (
                  <tr key={r.id}>
                    <th>
                      {r.name}
                      <small>{r.serialNo}</small>
                    </th>
                    <td>{r.parkName || registrations.find((p) => p.id === r.parkId)?.name || '미배정'}</td>
                    <td>{r.managerName || registrations.find((p) => p.id === r.parkId)?.applicantName || '미배정'}</td>
                    <td>
                      <span className={`status-pill status-${r.status}`}>{STATUS[r.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && !robots.length && <p className="empty">등록된 로봇이 없어요.</p>}
          {loading && (
            <p role="status" className="loading">
              운영 현황을 불러오는 중…
            </p>
          )}
          <Pagination {...list} onChange={setPage} />
        </section>
        <aside className="home-side">
          <section className="board">
            <h2>확인이 필요한 신청</h2>
            <p className="home-pending">
              가입 승인 대기 <strong>{loading ? '—' : pending}건</strong>
            </p>
            <button className="home-pending home-pending-link" onClick={onParkChanges}>
              공원 변경 승인 대기 <strong>{changeCount == null ? '—' : `${changeCount}명`}</strong>
            </button>
            <button className="button primary" onClick={onManagers}>
              관리자 보기
            </button>
          </section>
          <section className="board">
            <h2>로봇 상태</h2>
            {(['idle', 'working', 'charging', 'offline', 'error'] as const).map((s) => (
              <div className="status-summary" key={s}>
                <span className={`status-pill status-${s}`}>{STATUS[s]}</span>
                <strong>{loading ? '—' : robots.filter((r) => r.status === s).length}대</strong>
              </div>
            ))}
            <button className="button soft" onClick={onRobots}>
              로봇 목록 보기
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}
