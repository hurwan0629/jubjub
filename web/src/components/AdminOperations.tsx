import { ParkChangeDetailDialog } from './ParkChangeDetailDialog';
import { useEffect, useRef, useState } from 'react';
import * as api from '../api/admin';
import { DailyReportView } from './DailyReportView';
import { Pagination } from './Pagination';
import { paginate } from './pageData';
import { ParkChangeRejectDialog } from './ParkChangeRejectDialog';
import { RobotTokenButton } from './RobotTokenButton';

function useRemote<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
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
  return { data, error, loading, reload: () => setRevision((v) => v + 1) };
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
        <h2>공원 변경 신청</h2>
        <select aria-label="변경 신청 상태" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="pending">승인 대기</option>
          <option value="all">전체 이력</option>
          <option value="approved">승인 완료</option>
          <option value="rejected">반려</option>
          <option value="cancelled">취소</option>
        </select>
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
                <td>{r.conflictingManagerName || '없음'}</td>
                <td>
                  {new Date(r.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                  <small>
                    {r.reviewedAt
                      ? new Date(r.reviewedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
                      : '미처리'}
                  </small>
                </td>
                <td>
                  {changeStatus[r.status]}
                  {r.rejectReason && <small>{r.rejectReason}</small>}
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
export function ParkReports() {
  const parks = useRemote(api.getAdminParks);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const list = paginate(
    (parks.data ?? []).filter((p) =>
      `${p.name} ${p.address} ${p.managerName}`.toLowerCase().includes(search.toLowerCase()),
    ),
    page,
  );
  useEffect(() => setPage(1), [search]);
  const [selected, setSelected] = useState<api.AdminPark>();
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const reports = useRemote(
    (signal) => (selected ? api.getParkReports(selected.id, date, signal, selected.catalogId) : Promise.resolve([])),
    [selected?.id, selected?.catalogId, date],
  );
  return (
    <section className="board operations-board reports-board">
      {!selected && (
        <div className="banner">
          <span>
            <img src="/icons/report.svg" width="28" height="28" alt="" />
          </span>
          <strong>공원별 일일 보고를 확인할 수 있습니다.</strong>
        </div>
      )}
      <div className="toolbar report-toolbar">
        <h2>{selected ? `${selected.name} 일일 보고` : '공원 목록'}</h2>
        {selected ? (
          <>
            <button className="button soft" onClick={() => setSelected(undefined)}>
              공원 목록
            </button>
            <label>
              날짜{' '}
              <input
                type="date"
                required
                value={date}
                onChange={(e) => {
                  if (e.target.value) setDate(e.target.value);
                }}
              />
            </label>
          </>
        ) : (
          <button className="refresh-button" onClick={parks.reload}>
            새로고침
          </button>
        )}
      </div>
      <Feedback error={selected ? reports.error : parks.error} loading={selected ? reports.loading : parks.loading} />
      {!selected ? (
        <div className="table-scroll park-report-list">
          <div className="toolbar">
            <input
              className="table-search"
              type="search"
              aria-label="보고 공원 검색"
              placeholder="공원명 · 관리자 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <table>
            <thead>
              <tr>
                <th>공원명</th>
                <th>주소</th>
                <th>담당 관리자</th>
                <th>보고</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((p) => (
                <tr key={p.id}>
                  <th>
                    <span className="park-report-name">
                      <img src="/icons/report.svg" width="22" height="22" alt="" />
                      {p.name}
                    </span>
                  </th>
                  <td>{p.address}</td>
                  <td>
                    {p.managerName}
                    <small>{p.managerLoginId}</small>
                  </td>
                  <td>
                    <button className="approve-button report-view-button" onClick={() => setSelected(p)}>
                      보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {parks.data && list.total === 0 && <p className="empty">해당 공원이 없어요.</p>}
          <Pagination {...list} onChange={setPage} />
        </div>
      ) : (
        <>
          {!reports.loading && !reports.error && reports.data?.length === 0 && (
            <div className="empty">
              <h3>선택한 날짜의 보고가 없어요.</h3>
              <p>서버에 저장된 보고가 있으면 여기에 표시돼요.</p>
            </div>
          )}
          {(!reports.error ? reports.data : undefined)?.map((r) => (
            <DailyReportView report={r} key={r.id} />
          ))}
        </>
      )}
    </section>
  );
}

export function RobotList() {
  const robots = useRemote(api.getAdminRobots),
    parks = useRemote(api.getAdminParks);
  const [target, setTarget] = useState<api.AdminRobot>();
  const [search, setSearch] = useState('');
  const [listSearch, setListSearch] = useState('');
  const [page, setPage] = useState(1);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [issuedToken, setIssuedToken] = useState<{ robotId: string; token: string }>();
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
  const [name, setName] = useState('');
  const [serial, setSerial] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (target) el?.showModal();
    return () => el?.close();
  }, [target]);
  async function save(register: boolean) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (register) {
        const registered = await api.createAdminRobot(name.trim(), serial.trim());
        setIssuedToken({ robotId: registered.id, token: registered.authToken });
        setName('');
        setSerial('');
      } else if (target) await api.assignRobot(target.id, parkId || null);
      setTarget(undefined);
      robots.reload();
      parks.reload();
      setNotice('저장했어요.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리하지 못했어요');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="board operations-board">
      <div className="toolbar">
        <h2>로봇 목록</h2>
        <input
          className="table-search"
          type="search"
          aria-label="로봇 검색"
          placeholder="로봇 · 공원 · 관리자 검색"
          value={listSearch}
          onChange={(e) => setListSearch(e.target.value)}
        />
        <button className="refresh-button" onClick={robots.reload} disabled={busy || robots.loading}>
          새로고침
        </button>
        <button
          className="button soft compact-button"
          aria-expanded={registerOpen}
          onClick={() => setRegisterOpen(!registerOpen)}
        >
          로봇 등록
        </button>
      </div>
      {registerOpen && (
        <form
          className="robot-registration"
          onSubmit={(e) => {
            e.preventDefault();
            void save(true);
          }}
        >
          <h3>로봇 등록</h3>
          <label>
            이름
            <input required maxLength={100} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            시리얼 번호
            <input
              required
              maxLength={100}
              value={serial}
              disabled={busy}
              onChange={(e) => setSerial(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy || !name.trim() || !serial.trim()}>
            등록
          </button>
        </form>
      )}
      <Feedback error={robots.error || (!target ? error : '')} loading={robots.loading} />
      {notice && <p role="status">{notice}</p>}
      {issuedToken && (
        <section className="error-panel" aria-label="발급된 로봇 토큰">
          <h3>로봇 {issuedToken.robotId} 인증 토큰</h3>
          <p>이번에만 보여드려요. 로봇 설정에 안전하게 복사해 주세요. 닫으면 다시 볼 수 없어요.</p>
          <textarea readOnly aria-label="로봇 인증 토큰" value={issuedToken.token} />
          <button className="button soft" onClick={() => setIssuedToken(undefined)}>
            확인하고 닫기
          </button>
        </section>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {['로봇 / 시리얼', '공원', '관리자', '상태', '배터리 전압', '마지막 연결', '배정'].map((x) => (
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
                <td>{r.parkName || (r.parkId ? '공원 정보 없음' : '미배정')}</td>
                <td>
                  {r.managerName || '미배정'}
                  <small>{r.managerLoginId}</small>
                </td>
                <td>
                  {
                    {
                      idle: '대기',
                      working: '작업 중',
                      returning: '복귀 중',
                      emptying: '비우는 중',
                      offline: '오프라인',
                      error: '오류',
                    }[r.status]
                  }
                </td>
                <td>{r.batteryVoltage == null ? '측정값 없음' : `${r.batteryVoltage} V`}</td>
                <td>{r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString('ko-KR') : '연결 기록 없음'}</td>
                <td>
                  <button
                    className="approve-button"
                    disabled={busy || !!robots.error || !['idle', 'offline'].includes(r.status)}
                    onClick={() => {
                      setTarget(r);
                      setParkId(r.parkId ?? '');
                      setSearch('');
                      setError('');
                    }}
                  >
                    배정 변경
                  </button>
                  {!['idle', 'offline'].includes(r.status) && <small>대기·오프라인일 때 변경 가능</small>}
                  <RobotTokenButton
                    tokenIssuedAt={r.tokenIssuedAt}
                    disabled={busy}
                    onIssue={async () => {
                      if (!window.confirm('로봇 인증 토큰을 발급할까요? 원문은 이번에만 보여드려요.')) return;
                      setBusy(true);
                      setError('');
                      try {
                        const result = await api.rotateRobotToken(r.id);
                        setIssuedToken({ robotId: r.id, token: result.authToken });
                        robots.reload();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : '토큰을 발급하지 못했어요');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {robots.data && list.total === 0 && <p className="empty">해당 로봇이 없어요.</p>}
      </div>
      <Pagination {...list} onChange={setPage} />
      {target && (
        <dialog
          ref={dialog}
          className="decision-dialog"
          aria-labelledby="assignment-title"
          data-dialog="assignment"
          onCancel={(e) => {
            e.preventDefault();
            if (!busy) setTarget(undefined);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(false);
            }}
          >
            <h2 id="assignment-title">{target.name} 배정 변경</h2>
            <div className="dialog-body">
              <p>승인된 관리자와 공원을 선택하세요. 대기·오프라인 로봇만 변경할 수 있어요.</p>
              <label className="assignment-search">
                관리자 / 공원 검색
                <input type="search" value={search} disabled={busy} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <Feedback error={parks.error} loading={parks.loading} />
              <div className="assignment-options" role="group" aria-label="배정할 관리자와 공원">
                <label className="robot-option">
                  <input type="radio" name="park" checked={!parkId} disabled={busy} onChange={() => setParkId('')} />
                  배정 해제 (회수)
                </label>
                {parks.data
                  ?.filter((p) =>
                    `${p.managerName} ${p.managerLoginId} ${p.name} ${p.address}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((p) => (
                    <label className="robot-option" key={p.id}>
                      <input
                        type="radio"
                        name="park"
                        checked={parkId === p.id}
                        disabled={busy}
                        onChange={() => setParkId(p.id)}
                      />
                      <span>
                        <strong>
                          {p.managerName} · {p.managerLoginId}
                        </strong>
                        <small>
                          {p.name} · {p.address}
                        </small>
                      </span>
                    </label>
                  ))}
                {parks.data?.length === 0 && <p>승인된 관리자와 공원이 없어요.</p>}
              </div>
              {error && (
                <p className="error-text" role="alert">
                  {error}
                </p>
              )}
            </div>
            <footer className="dialog-actions">
              <button type="button" className="button soft" disabled={busy} onClick={() => setTarget(undefined)}>
                닫기
              </button>
              <button className="button primary" disabled={busy || parks.loading || !!parks.error}>
                {busy ? '처리 중…' : '저장'}
              </button>
            </footer>
          </form>
        </dialog>
      )}
    </section>
  );
}
