import { useEffect, useRef, useState } from 'react';
import * as api from '../api/admin';
import { DailyReportView } from './DailyReportView';

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
  const approvalDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = approvalDialog.current;
    if (approval) element?.showModal();
    return () => element?.close();
  }, [approval]);
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState('pending');
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
        </select>
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
            {data
              ?.filter((r) => filter === 'all' || r.status === filter)
              .map((r) => (
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
                    {r.createdAt}
                    <small>{r.reviewedAt || '미처리'}</small>
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
        {data && !data.some((r) => filter === 'all' || r.status === filter) && (
          <p className="empty">해당 공원 변경 신청이 없어요.</p>
        )}
      </div>
      {approval && (
        <dialog
          ref={approvalDialog}
          className="decision-dialog"
          aria-labelledby="park-approval-title"
          onCancel={(e) => {
            e.preventDefault();
            if (!busy) setApproval(undefined);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!approval.conflictingManagerName) void decide(approval, false);
            }}
          >
            <h2 id="park-approval-title">공원 변경 승인</h2>
            <div className="dialog-body">
              <div className="applicant-summary">
                <strong>
                  {approval.applicantName} · {approval.applicantLoginId}
                </strong>
                <span>
                  {approval.currentParkName} → {approval.requestedParkName}
                </span>
                <small>{approval.requestedParkAddress}</small>
              </div>
              <h3>신청 사유</h3>
              <p>{approval.reason}</p>
              <h3>중복 담당자</h3>
              <p>{approval.conflictingManagerName || '없음'}</p>
              {approval.conflictingManagerName && (
                <p className="error-text">요청한 공원에 승인된 담당자가 있어 승인할 수 없어요.</p>
              )}
              <p className="warning-text">
                승인하면 로봇 배정은 유지되지만 기존 경로가 비활성화되고 지도·시간표와 운영 설정 완료 상태가 초기화돼요.
                새 공원의 경로와 시간을 다시 설정해야 해요.
              </p>
              <p className="muted">저장 시 서버가 중복 담당자와 로봇 작업 상태를 다시 확인해요.</p>
              {failure && (
                <p className="error-text" role="alert">
                  {failure}
                </p>
              )}
            </div>
            <footer className="dialog-actions">
              <button type="button" className="button soft" disabled={busy} onClick={() => setApproval(undefined)}>
                돌아가기
              </button>
              <button className="button primary" disabled={busy || !!approval.conflictingManagerName}>
                {busy ? '처리 중…' : '공원 변경 승인'}
              </button>
            </footer>
          </form>
        </dialog>
      )}{' '}
      {target && (
        <div className="inline-decision">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void decide(target, true);
            }}
          >
            <h3>{target.applicantName} 공원 변경 반려</h3>
            <label>
              반려 사유 (필수)
              <textarea
                required
                maxLength={1000}
                value={reason}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button className="button danger" disabled={busy || !reason.trim()}>
              반려
            </button>
            <button type="button" className="button soft" disabled={busy} onClick={() => setTarget(undefined)}>
              닫기
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
export function ParkReports() {
  const parks = useRemote(api.getAdminParks);
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
      <div className="toolbar report-toolbar">
        <h2>{selected ? `${selected.name} 보고` : '공원별 보고'}</h2>
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
          <table>
            <thead>
              <tr>
                <th>공원명</th>
                <th>주소</th>
                <th>보고</th>
              </tr>
            </thead>
            <tbody>
              {parks.data?.map((p) => (
                <tr key={p.id}>
                  <th>
                    <span className="park-report-name">
                      <img src="/icons/report.svg" width="22" height="22" alt="" />
                      {p.name}
                    </span>
                  </th>
                  <td>{p.address}</td>
                  <td>
                    <button className="approve-button report-view-button" onClick={() => setSelected(p)}>
                      보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {parks.data?.length === 0 && <p className="empty">승인된 공원이 없어요.</p>}
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
        await api.createAdminRobot(name.trim(), serial.trim());
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
        <button onClick={robots.reload} disabled={busy || robots.loading}>
          새로고침
        </button>
      </div>
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
          <input required maxLength={100} value={serial} disabled={busy} onChange={(e) => setSerial(e.target.value)} />
        </label>
        <button className="button primary" disabled={busy || !name.trim() || !serial.trim()}>
          등록
        </button>
      </form>
      <Feedback error={robots.error || (!target ? error : '')} loading={robots.loading} />
      {notice && <p role="status">{notice}</p>}
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
            {robots.data?.map((r) => (
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
                      emptying: '비우는 중',
                      charging: '충전 중',
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {robots.data?.length === 0 && <p className="empty">등록된 로봇이 없어요.</p>}
      </div>
      {target && (
        <dialog
          ref={dialog}
          className="decision-dialog"
          aria-labelledby="assignment-title"
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
              <label>
                관리자 / 공원 검색
                <input type="search" value={search} disabled={busy} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <Feedback error={parks.error} loading={parks.loading} />
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
