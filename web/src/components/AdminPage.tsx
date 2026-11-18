import { AdminHome } from './AdminHome';
import { Pagination } from './Pagination';
import { paginate } from './pageData';
import { useEffect, useState } from 'react';
import { ParkChanges, ParkReports, RobotList } from './AdminOperations';
import { Logo } from './Logo';
import type { RegistrationStatus } from '../api/admin';
import { useAdminRegistrations } from '../hooks/useAdminRegistrations';
import { DecisionDialog } from './DecisionDialog';
import type { Decision } from './DecisionDialog';

const FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'pending', label: '승인 대기' },
  { id: 'approved', label: '승인 완료' },
  { id: 'rejected', label: '반려' },
] as const;
export function AdminPage({ onLogout }: { onLogout: () => void }) {
  const { data, loading, error, unauthorized, busy, reload, decide } = useAdminRegistrations();
  const [tab, setTab] = useState<'home' | 'managers' | 'reports' | 'robots'>('home');
  const [managerTab, setManagerTab] = useState<'registrations' | 'changes'>('registrations');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<'all' | RegistrationStatus>('all');
  const [target, setTarget] = useState<Decision>();
  const [notice, setNotice] = useState('');
  const rows = data?.registrations ?? [];
  const visible = rows.filter(
    (row) =>
      (filter === 'all' || row.registrationStatus === filter) &&
      `${row.applicantName} ${row.applicantLoginId} ${row.name} ${row.applicantEmail}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const list = paginate(visible, page);
  useEffect(() => setPage(1), [filter, search]);
  const count = (id: string) =>
    id === 'all' ? rows.length : rows.filter((row) => row.registrationStatus === id).length;
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const submit = async (reason: string, ids: string[]) => {
    if (!target) return false;
    const result = await decide(target.action, target.registration.userId, reason, ids);
    if (result) {
      const verb =
        target.action === 'approve'
          ? '가입을 승인했어요'
          : target.action === 'reject'
            ? '가입을 반려했어요'
            : '승인을 취소하고 로봇을 회수했어요';
      setNotice(`${target.registration.applicantName} 관리자의 ${verb}.`);
      setTarget(undefined);
    }
    return result;
  };
  return (
    <div className="admin-page">
      <header className="topbar">
        <Logo />
        <div className="account-controls">
          <button
            className="icon-button"
            aria-label="승인 대기 알림"
            onClick={() => {
              setTab('managers');
              setManagerTab('registrations');
              setFilter('pending');
              setNotice(`승인 대기 중인 신청이 ${count('pending')}건 있어요.`);
            }}
          >
            <img src="/icons/notification.svg" width="40" height="40" alt="" />
          </button>
          <div className="account-pill">
            <span>관</span>운영 관리자
          </div>
          <button className="logout-button" onClick={onLogout} disabled={busy}>
            <img src="/icons/log-out.svg" width="18" height="18" alt="" />
            로그아웃
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar" aria-label="총관리자 메뉴">
          <p className="menu-label">메뉴</p>
          {(
            [
              { id: 'home', label: '홈', icon: 'home' },
              { id: 'managers', label: '관리자 보기', icon: 'users' },
              { id: 'reports', label: '공원별 보고', icon: 'report' },
              { id: 'robots', label: '로봇 목록', icon: 'bot' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={`menu-item ${tab === item.id ? 'active' : ''}`}
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => setTab(item.id)}
            >
              <img src={`/icons/${item.icon}.svg`} width="21.6" height="21.6" alt="" />
              {item.label}
            </button>
          ))}{' '}
        </aside>
        <main className="admin-main">
          <h1>
            {tab === 'home'
              ? '홈'
              : tab === 'managers'
                ? '관리자 보기'
                : tab === 'reports'
                  ? '공원별 보고'
                  : '로봇 목록'}
          </h1>
          {tab === 'home' ? (
            <AdminHome
              registrations={rows}
              robots={data?.robots ?? []}
              loading={loading}
              error={error}
              onReload={() => void reload()}
              onManagers={() => {
                setTab('managers');
                setManagerTab('registrations');
                setFilter('pending');
              }}
              onRobots={() => setTab('robots')}
              onParkChanges={() => {
                setTab('managers');
                setManagerTab('changes');
              }}
            />
          ) : tab === 'reports' ? (
            <ParkReports />
          ) : tab === 'robots' ? (
            <RobotList />
          ) : (
            <>
              <div className="banner">
                <span>
                  <img src="/icons/banner-bot.svg" width="28.08" height="28.08" alt="" />
                </span>
                <strong>작업 중인 Jubi와 담당 관리자를 확인할 수 있습니다.</strong>
              </div>
              <div className="section-tabs" role="tablist" aria-label="관리자 신청 종류">
                <button
                  role="tab"
                  aria-selected={managerTab === 'registrations'}
                  onClick={() => setManagerTab('registrations')}
                >
                  가입 승인
                </button>
                <button role="tab" aria-selected={managerTab === 'changes'} onClick={() => setManagerTab('changes')}>
                  공원 변경 승인
                </button>
              </div>
              {managerTab === 'changes' ? (
                <ParkChanges onChanged={() => void reload()} />
              ) : (
                <section className="board" aria-label="가입 신청 관리">
                  <div className="toolbar">
                    <label htmlFor="status-filter">승인 상태</label>
                    <select
                      id="status-filter"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value as typeof filter)}
                    >
                      {FILTERS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label} {count(item.id)}
                        </option>
                      ))}
                    </select>
                    <input
                      className="table-search"
                      type="search"
                      aria-label="관리자 검색"
                      placeholder="관리자 · 아이디 · 공원 검색"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <button className="refresh-button" onClick={() => void reload()} disabled={busy || loading}>
                      새로고침
                    </button>
                  </div>
                  {loading ? (
                    <p className="loading" role="status">
                      신청 목록을 불러오고 있어요…
                    </p>
                  ) : null}
                  {error ? (
                    <div className="error-panel" role="alert">
                      <p>{error}</p>
                      <button className="button soft" onClick={unauthorized ? onLogout : () => void reload()}>
                        {unauthorized ? '다시 로그인' : '다시 시도'}
                      </button>
                    </div>
                  ) : null}
                  {!unauthorized && data ? (
                    <div className="table-scroll">
                      <table>
                        <caption className="sr-only">회원가입 신청자와 공원 및 승인 상태</caption>
                        <thead>
                          <tr>
                            {['관리자', '아이디', '전화번호', '이메일', '담당 공원', '담당 로봇', '승인 여부'].map(
                              (title) => (
                                <th scope="col" key={title}>
                                  {title}
                                </th>
                              ),
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {list.items.map((row) => (
                            <tr key={row.userId}>
                              <th scope="row">{row.applicantName}</th>
                              <td className="muted">{row.applicantLoginId}</td>
                              <td>{row.applicantPhone || '미등록'}</td>
                              <td>{row.applicantEmail}</td>
                              <td>{row.name}</td>
                              <td>
                                {data.robots
                                  .filter((robot) => robot.parkId === row.id)
                                  .map((robot) => robot.name)
                                  .join(', ') || <span className="muted">배정 전</span>}
                              </td>
                              <td>
                                <div className="row-actions">
                                  {row.registrationStatus === 'pending' ? (
                                    <>
                                      <button
                                        className="approve-button"
                                        aria-label={`${row.applicantName} 가입 승인`}
                                        disabled={busy || loading || !!error}
                                        onClick={() => setTarget({ action: 'approve', registration: row })}
                                      >
                                        승인
                                      </button>
                                      <button
                                        className="reject-button"
                                        aria-label={`${row.applicantName} 가입 반려`}
                                        disabled={busy || loading || !!error}
                                        onClick={() => setTarget({ action: 'reject', registration: row })}
                                      >
                                        반려
                                      </button>
                                    </>
                                  ) : row.registrationStatus === 'approved' ? (
                                    <button
                                      className="cancel-button"
                                      aria-label={`${row.applicantName} 승인 취소`}
                                      disabled={busy || loading || !!error}
                                      onClick={() => setTarget({ action: 'revoke', registration: row })}
                                    >
                                      승인 취소
                                    </button>
                                  ) : (
                                    <span className="error-text">반려</span>
                                  )}
                                </div>
                                {row.rejectReason ? (
                                  <small className="error-text reason">사유: {row.rejectReason}</small>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {visible.length === 0 ? (
                        <div className="empty">
                          <h2>
                            {filter === 'all'
                              ? '아직 회원가입 신청이 없어요'
                              : `${FILTERS.find((f) => f.id === filter)?.label} 상태의 신청이 없어요`}
                          </h2>
                          <p>새 신청이 접수되면 여기에서 확인할 수 있어요.</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <Pagination {...list} onChange={setPage} />
                </section>
              )}
            </>
          )}
        </main>
      </div>
      {notice ? (
        <div className="toast" role="status">
          <span>
            <img src="/icons/check.svg" width="15.12" height="15.12" alt="" />
          </span>
          {notice}
        </div>
      ) : null}
      {target ? (
        <DecisionDialog
          key={`${target.action}:${target.registration.userId}`}
          target={target}
          robots={data?.robots ?? []}
          busy={busy}
          onClose={() => {
            if (!busy) setTarget(undefined);
          }}
          onSubmit={submit}
        />
      ) : null}
    </div>
  );
}
