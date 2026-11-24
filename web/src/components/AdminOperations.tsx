import { ParkChangeDetailDialog } from './ParkChangeDetailDialog';
import { useEffect, useRef, useState } from 'react';
import * as api from '../api/admin';
import { Pagination } from './Pagination';
import { paginate } from './pageData';
import { ParkChangeRejectDialog } from './ParkChangeRejectDialog';
import { IssueConfirmDialog, RegisterDialog, TokenDialog } from './RobotDialogs';
import { RobotRequests } from './RobotRequests';
import { SelectMenu } from './SelectMenu';
import { RobotTokenButton } from './RobotTokenButton';

function useRemote<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [loadedAt, setLoadedAt] = useState<Date>();
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    let active = true;
    let controller: AbortController;
    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      setLoading(true);
      try {
        const result = await loader.current(signal);
        if (active && !signal.aborted) {
          setData(result);
          setError('');
          setLoadedAt(new Date());
        }
      } catch (e) {
        if (active && !signal.aborted) setError(e instanceof Error ? e.message : '불러오지 못했어요');
      } finally {
        if (active && !signal.aborted) setLoading(false);
      }
    };
    setData(undefined);
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      active = false;
      controller?.abort();
      clearInterval(timer);
    };
    // Each caller supplies the identities used by its request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, ...deps]);
  return { data, error, loading, loadedAt, reload: () => setRevision((v) => v + 1) };
}
function Feedback({ error, loading }: { error: string; loading: boolean }) {
  return (
    <>
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">불러오는 중…</p>}
    </>
  );
}
const changeStatus = { pending: '승인 대기', approved: '승인 완료', rejected: '반려', cancelled: '취소' };
export function ParkChanges({ onChanged }: { onChanged: () => void }) {
  const { data, error, loading, reload } = useRemote(api.getParkChanges);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [target, setTarget] = useState<api.ParkChange>();
  const [approval, setApproval] = useState<api.ParkChange>();
  const assignedRobots = useRemote(api.getAdminRobots);
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const list = paginate(
    (data ?? []).filter(
      (r) =>
        (filter === 'all' || r.status === filter) &&
        `${r.applicantName} ${r.applicantLoginId} ${r.currentParkName} ${r.requestedParkName}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ),
    page,
  );
  useEffect(() => setPage(1), [filter, search]);
  async function decide(row: api.ParkChange, reject: boolean) {
    if (busy) return;
    setBusy(true);
    setFailure('');
    try {
      if (reject) await api.rejectParkChange(row.id, reason.trim());
      else await api.approveParkChange(row.id);
      setTarget(undefined);
      setApproval(undefined);
      setReason('');
      reload();
      onChanged();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : '처리하지 못했어요');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="board operations-board" aria-label="공원 변경 신청">
      <div className="toolbar">
        <h2 className="board-title">공원 변경 신청</h2>
        <SelectMenu
          label="변경 신청 상태"
          value={filter}
          options={[
            { value: 'pending', label: '승인 대기' },
            { value: 'all', label: '전체 이력' },
            { value: 'approved', label: '승인 완료' },
            { value: 'rejected', label: '반려' },
            { value: 'cancelled', label: '취소' },
          ]}
          onChange={setFilter}
        />
        <input
          className="table-search"
          type="search"
          aria-label="공원 변경 신청 검색"
          placeholder="관리자 · 공원 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="refresh-button" onClick={reload} disabled={busy || loading}>
          새로고침
        </button>
      </div>
      <Feedback error={error || failure} loading={loading} />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {['관리자', '현재 → 요청 공원', '신청 사유', '중복 담당자', '신청일 / 처리일', '상태'].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.items.map((r) => (
              <tr key={r.id}>
                <th>
                  {r.applicantName}
                  <small>{r.applicantLoginId}</small>
                </th>
                <td>
                  {r.currentParkName} → {r.requestedParkName}
                  <small>{r.requestedParkAddress}</small>
                </td>
                <td>{r.reason}</td>
                <td className={r.conflictingManagerName ? undefined : 'muted'}>{r.conflictingManagerName || '없음'}</td>
                <td>
                  {new Date(r.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                  <small>
                    {r.reviewedAt
                      ? new Date(r.reviewedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
                      : '미처리'}
                  </small>
                </td>
                <td>
                  <span className={`change-status change-${r.status}`}>{changeStatus[r.status]}</span>
                  {r.rejectReason && <small className="change-reject-reason">{r.rejectReason}</small>}
                  {r.status === 'pending' && (
                    <div className="row-actions">
                      <button
                        className="approve-button"
                        disabled={busy || loading || !!error}
                        onClick={() => {
                          setApproval(r);
                          setFailure('');
                        }}
                      >
                        승인
                      </button>
                      <button
                        className="reject-button"
                        disabled={busy || loading || !!error}
                        onClick={() => {
                          setTarget(r);
                          setReason('');
                          setFailure('');
                        }}
                      >
                        반려
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && list.total === 0 && <p className="empty">해당 공원 변경 신청이 없어요.</p>}
      </div>
      <Pagination {...list} onChange={setPage} />
      {approval && (
        <ParkChangeDetailDialog
          request={approval}
          robots={assignedRobots.data ?? []}
          robotsLoading={assignedRobots.loading}
          robotsError={assignedRobots.error}
          busy={busy}
          error={failure}
          onClose={() => setApproval(undefined)}
          onReject={() => {
            setTarget(approval);
            setApproval(undefined);
            setReason('');
            setFailure('');
          }}
          onApprove={() => void decide(approval, false)}
        />
      )}
      {target && (
        <ParkChangeRejectDialog
          target={target}
          reason={reason}
          busy={busy}
          error={failure}
          onReason={setReason}
          onClose={() => setTarget(undefined)}
          onSubmit={() => void decide(target, true)}
        />
      )}
    </section>
  );
}
/** W-04 로봇 목록 (Figma Page 4 · 381:813, 배정 모달 381:1346) */
const STATUS_LABEL: Record<api.AdminRobot['status'], string> = {
  idle: '대기',
  working: '순찰 중',
  returning: '복귀 중',
  emptying: '비우는 중',
  offline: '오프라인',
  error: '오류',
};
/** 배터리 전압이 이 값보다 낮으면 노란색으로 보여줘요 (서버에 기준값이 생기면 맞춰 바꿔요) */
const LOW_VOLTAGE = 11;

function clock(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 마지막 연결: 방금 · N분 전 · 오늘이면 HH:MM · 그 전이면 M월 D일 */
function lastSeen(iso: string | null) {
  if (!iso) return '연결 기록 없음';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '연결 기록 없음';
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return '방금';
  if (minutes < 10) return `${minutes}분 전`;
  if (d.toDateString() === new Date().toDateString()) return clock(d);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function RobotList({ onRequestsChanged }: { onRequestsChanged?: () => void } = {}) {
  const robots = useRemote(api.getAdminRobots),
    parks = useRemote(api.getAdminParks),
    requests = useRemote(api.getRobotAssignmentRequests);
  const [target, setTarget] = useState<api.AdminRobot>();
  const [search, setSearch] = useState('');
  const [listSearch, setListSearch] = useState('');
  const [page, setPage] = useState(1);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [issuedToken, setIssuedToken] = useState<{ title: string; subtitle: string; token: string }>();
  const [issueTarget, setIssueTarget] = useState<api.AdminRobot>();
  const list = paginate(
    (robots.data ?? []).filter((r) =>
      `${r.name} ${r.serialNo} ${r.parkName ?? ''} ${r.managerName ?? ''}`
        .toLowerCase()
        .includes(listSearch.toLowerCase()),
    ),
    page,
  );
  useEffect(() => setPage(1), [listSearch]);
  const [parkId, setParkId] = useState('');
  const [busy, setBusy] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (target) el?.showModal();
    return () => el?.close();
  }, [target]);
  /** 로봇 등록 팝업 → 등록 완료(토큰 복사) */
  async function register(name: string, serial: string) {
    if (busy) return;
    setBusy(true);
    setRegisterError('');
    try {
      const registered = await api.createAdminRobot(name, serial);
      setRegisterOpen(false);
      setIssuedToken({
        title: `${registered.name}을 등록했어요`,
        subtitle: `S/N ${registered.serialNo} · 배정 전`,
        token: registered.authToken,
      });
      robots.reload();
    } catch (e) {
      setRegisterError(e instanceof Error ? e.message : '등록하지 못했어요');
    } finally {
      setBusy(false);
    }
  }
  /** 토큰 발급 확인 → 발급 완료(토큰 복사) */
  async function issueToken(r: api.AdminRobot) {
    setBusy(true);
    setError('');
    try {
      const result = await api.rotateRobotToken(r.id);
      setIssueTarget(undefined);
      setIssuedToken({ title: `${r.name} 토큰을 발급했어요`, subtitle: `S/N ${r.serialNo}`, token: result.authToken });
      robots.reload();
    } catch (e) {
      setIssueTarget(undefined);
      setError(e instanceof Error ? e.message : '토큰을 발급하지 못했어요');
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!target) return;
      await api.assignRobot(target.id, parkId || null);
      const park = parks.data?.find((p) => p.id === parkId);
      setTarget(undefined);
      robots.reload();
      parks.reload();
      setNotice(
        park
          ? `${target.name}을 ${park.managerName} 관리자에게 맡겼어요.`
          : `${target.name}을 회수했어요. 이제 배정 전이에요.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리하지 못했어요');
    } finally {
      setBusy(false);
    }
  }
  const all = robots.data ?? [];
  const unassigned = all.filter((r) => !r.parkId).length;
  const runningCount = (id: string) => all.filter((r) => r.parkId === id).length;
  const chosen = parks.data?.find((p) => p.id === parkId);
  const stamp = robots.loadedAt ? clock(robots.loadedAt) : '';
  return (
    <>
      <div className="banner banner-yellow">
        <span>
          <img src="/icons/banner-bot-yellow.svg" width="28.08" height="28.08" alt="" />
        </span>
        <strong>공원에서 일하는 Jubi의 상태를 확인할 수 있습니다.</strong>
      </div>
      {/* W-04 로봇 목록 - 배정 요청 알림: 관리자 앱에서 들어온 로봇 배정 · 추가 요청 */}
      <RobotRequests
        requests={requests.data ?? []}
        robots={all}
        onChanged={(message) => {
          requests.reload();
          robots.reload();
          parks.reload();
          onRequestsChanged?.();
          setNotice(message);
        }}
      />
      {requests.error ? <p className="warning-text">배정 요청을 불러오지 못했어요: {requests.error}</p> : null}
      <section className="board operations-board rl-board">
        <div className="rl-head">
          <h2 className="board-title">
            Jubi {all.length}대{unassigned ? ` · 배정 전 ${unassigned}대` : ''}
          </h2>
          {stamp ? <span className="rl-stamp">{stamp} 기준 · 30초마다 새로 고침</span> : null}
        </div>
        <div className="toolbar rl-toolbar">
          <label className="rl-search">
            <img src="/icons/search.svg" width="18" height="18" alt="" />
            <input
              type="search"
              aria-label="로봇 검색"
              placeholder="로봇, 공원, 관리자로 찾기"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
            />
          </label>
          <button className="refresh-button" onClick={robots.reload} disabled={busy || robots.loading}>
            새로고침
          </button>
          <button
            className="button primary compact-button"
            onClick={() => {
              setRegisterError('');
              setRegisterOpen(true);
            }}
          >
            + 로봇 등록
          </button>
        </div>
        <Feedback error={robots.error || (!target ? error : '')} loading={robots.loading && !robots.data} />
        {notice && (
          <p className="rl-notice" role="status">
            {notice}
          </p>
        )}
        <div className="table-scroll">
          <table className="rl-table">
            <thead>
              <tr>
                {['로봇', '담당 공원', '담당 관리자', '상태', '배터리', '마지막 연결', '관리'].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.items.map((r) => {
                const changeable = ['idle', 'offline'].includes(r.status);
                const low = r.batteryVoltage != null && r.batteryVoltage < LOW_VOLTAGE;
                return (
                  <tr key={r.id}>
                    <th scope="row">
                      <span className="rl-robot">
                        <span className={`rl-robot-icon ${r.status === 'error' ? 'error' : ''}`}>
                          <img
                            src={r.status === 'error' ? '/icons/bot-error-red.svg' : '/icons/bot-brand.svg'}
                            width="20"
                            height="20"
                            alt=""
                          />
                        </span>
                        <span className="rl-robot-text">
                          <strong>{r.name}</strong>
                          <small>S/N {r.serialNo}</small>
                        </span>
                      </span>
                    </th>
                    <td className={r.parkId ? undefined : 'muted'}>
                      {r.parkName || (r.parkId ? '공원 정보 없음' : '배정 전')}
                    </td>
                    <td className={r.managerName ? undefined : 'muted'}>{r.managerName || '배정 전'}</td>
                    <td>
                      <span className={`rl-status rl-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                    </td>
                    <td>
                      {r.batteryVoltage == null ? (
                        <span className="muted">측정값 없음</span>
                      ) : (
                        <span className={`rl-battery ${low ? 'low' : ''}`}>
                          <img
                            src={low ? '/icons/battery-warn.svg' : '/icons/battery-ok.svg'}
                            width="19"
                            height="19"
                            alt=""
                          />
                          {r.batteryVoltage} V
                        </span>
                      )}
                    </td>
                    <td className="muted">{lastSeen(r.lastSeenAt)}</td>
                    <td className="rl-manage">
                      <button
                        className={`rl-assign ${r.parkId ? '' : 'primary'}`}
                        disabled={busy || !!robots.error || !changeable}
                        title={changeable ? undefined : '대기 · 오프라인일 때 바꿀 수 있어요'}
                        onClick={() => {
                          setTarget(r);
                          setParkId(r.parkId ?? '');
                          setSearch('');
                          setError('');
                        }}
                      >
                        {r.parkId ? '배정 변경' : '배정하기'}
                      </button>
                      <RobotTokenButton
                        tokenIssuedAt={r.tokenIssuedAt}
                        disabled={busy}
                        onIssue={() => setIssueTarget(r)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {robots.data && list.total === 0 && <p className="empty">해당 로봇이 없어요.</p>}
        </div>
        <Pagination {...list} onChange={setPage} />
      </section>
      {registerOpen ? (
        <RegisterDialog busy={busy} error={registerError} onClose={() => setRegisterOpen(false)} onSubmit={register} />
      ) : null}
      {issueTarget ? (
        <IssueConfirmDialog
          name={issueTarget.name}
          serial={issueTarget.serialNo}
          busy={busy}
          onClose={() => setIssueTarget(undefined)}
          onConfirm={() => void issueToken(issueTarget)}
        />
      ) : null}
      {issuedToken ? (
        <TokenDialog
          title={issuedToken.title}
          subtitle={issuedToken.subtitle}
          token={issuedToken.token}
          onClose={() => setIssuedToken(undefined)}
        />
      ) : null}
      {target && (
        <dialog
          ref={dialog}
          className="rq-dialog rl-assign-dialog"
          aria-labelledby="assignment-title"
          data-dialog="assignment"
          onCancel={(e) => {
            e.preventDefault();
            if (!busy) setTarget(undefined);
          }}
        >
          <form
            className="rq-body"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <header className="rq-title">
              <h2 id="assignment-title">{target.name}을 누구에게 맡길까요?</h2>
              <p>로봇은 맡은 관리자의 공원에서 일해요</p>
            </header>
            <div className="rl-target">
              <span className="rq-robot-icon">
                <img src="/icons/bot-brand.svg" width="20" height="20" alt="" />
              </span>
              <span className="rq-robot-text">
                <strong>{target.name}</strong>
                <small>
                  S/N {target.serialNo}
                  {target.batteryVoltage != null ? ` · 배터리 ${target.batteryVoltage} V` : ''}
                  {` · ${STATUS_LABEL[target.status]}`}
                </small>
              </span>
            </div>
            <div className="rl-field">
              <span className="rq-label">하위 관리자</span>
              <label className="rl-search rl-search-wide">
                <img src="/icons/search.svg" width="18" height="18" alt="" />
                <input
                  type="search"
                  aria-label="관리자 찾기"
                  placeholder="이름, 아이디, 공원으로 찾기"
                  value={search}
                  disabled={busy}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            <Feedback error={parks.error} loading={parks.loading && !parks.data} />
            <div className="rl-options" role="radiogroup" aria-label="맡길 관리자">
              {parks.data
                ?.filter((p) =>
                  `${p.managerName} ${p.managerLoginId} ${p.name} ${p.address}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((p) => (
                  <label className={`rl-option ${parkId === p.id ? 'on' : ''}`} key={p.id}>
                    <input
                      type="radio"
                      name="park"
                      checked={parkId === p.id}
                      disabled={busy}
                      onChange={() => setParkId(p.id)}
                    />
                    <span className="rl-option-who">
                      <strong>{p.managerName}</strong>
                      <small>{p.managerLoginId}</small>
                    </span>
                    <span className="rl-option-park">{p.name}</span>
                    <span className="rl-option-count">로봇 {runningCount(p.id)}대 운영 중</span>
                  </label>
                ))}
              {parks.data?.length === 0 && <p className="rq-hint">승인된 관리자가 없어요.</p>}
              {target.parkId ? (
                <label className={`rl-option rl-release ${!parkId ? 'on' : ''}`}>
                  <input type="radio" name="park" checked={!parkId} disabled={busy} onChange={() => setParkId('')} />
                  <span className="rl-option-who">
                    <strong>배정 해제</strong>
                    <small>로봇을 회수해 배정 전으로 돌려요</small>
                  </span>
                </label>
              ) : null}
            </div>
            {chosen ? (
              <div className="rq-info">
                <strong>
                  {chosen.managerName} 관리자는 로봇 {runningCount(chosen.id) + (target.parkId === chosen.id ? 0 : 1)}
                  대를 운영하게 돼요
                </strong>
                <p>배정하면 관리자 앱에 바로 보이고, {chosen.name}에서 순찰을 시작할 수 있어요.</p>
              </div>
            ) : target.parkId ? (
              <div className="rq-info">
                <strong>{target.managerName} 관리자에게서 로봇을 회수해요</strong>
                <p>회수한 로봇은 배정 전으로 바뀌고, 다른 관리자에게 다시 맡길 수 있어요.</p>
              </div>
            ) : null}
            {error && (
              <p className="rq-error" role="alert">
                {error}
              </p>
            )}
            <footer className="rq-footer">
              <button
                type="button"
                className="rq-button rq-light rq-tall"
                disabled={busy}
                onClick={() => setTarget(undefined)}
              >
                취소
              </button>
              <button
                className="rq-button rq-primary rq-tall"
                disabled={busy || parks.loading || !!parks.error || (parkId || null) === (target.parkId ?? null)}
              >
                {busy ? '처리 중…' : !parkId && target.parkId ? '회수하기' : '배정하기'}
              </button>
            </footer>
          </form>
        </dialog>
      )}
    </>
  );
}
