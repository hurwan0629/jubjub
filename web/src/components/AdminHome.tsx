// W-01 홈 (Figma Page 4 · 286:711)
import type { AdminRobot, Registration, RegistrationStatus } from '../api/admin';

type RobotStatus = AdminRobot['status'];

/** 로봇 상태 배지: 글자와 색 (Figma 배지/순찰 중 · 복귀 중 · 오류 · 대기) */
const ROBOT_STATUS: Record<RobotStatus, { label: string; short: string }> = {
  working: { label: '순찰 중', short: '순찰' },
  returning: { label: '복귀 중', short: '복귀' },
  emptying: { label: '비우는 중', short: '비우기' },
  idle: { label: '대기', short: '대기' },
  error: { label: '오류', short: '오류' },
  offline: { label: '오프라인', short: '오프라인' },
};
const STATUS_ORDER: RobotStatus[] = ['working', 'returning', 'emptying', 'idle', 'error', 'offline'];

const APPROVAL: Record<RegistrationStatus, string> = {
  approved: '승인 완료',
  pending: '승인 대기',
  rejected: '반려',
};

const PREVIEW_ROWS = 5;

function todayLabel(now: Date) {
  const date = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(now);
  const weekday = new Intl.DateTimeFormat('ko-KR', { weekday: 'short' }).format(now);
  return `${date} (${weekday})`;
}

/** 이번 주 월요일 0시 (브라우저 시간 기준) */
function startOfWeek(now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function ViewAll({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="home-view-all" onClick={onClick} aria-label={label}>
      전체 보기
      <img src="/icons/chevron-right.svg" width="17.28" height="17.28" alt="" />
    </button>
  );
}

export function AdminHome({
  registrations,
  robots,
  loading,
  error,
  onManagers,
  onRobots,
  onReload,
}: {
  registrations: Registration[];
  robots: AdminRobot[];
  loading: boolean;
  error?: string;
  onManagers: () => void;
  onRobots: () => void;
  onReload: () => void;
}) {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const pending = registrations.filter((r) => r.registrationStatus === 'pending').length;
  const joinedThisWeek = registrations.filter((r) => new Date(r.createdAt) >= weekStart).length;

  // 공원에 배정된 로봇을 "운영 중"으로 봐요
  const operating = robots.filter((r) => r.parkId);
  const parkCount = new Set(operating.map((r) => r.parkId)).size;
  const breakdown = STATUS_ORDER.map((s) => [s, operating.filter((r) => r.status === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${ROBOT_STATUS[s].short} ${n}`)
    .join(' · ');
  const troubled = robots.filter((r) => r.status === 'error');
  const parkName = (robot: AdminRobot) =>
    robot.parkName || registrations.find((p) => p.id === robot.parkId)?.name || '배정 전';

  const value = (n: number, unit: string) => (loading ? '—' : `${n}${unit}`);
  const stats = [
    {
      label: '전체 관리자',
      value: value(registrations.length, '명'),
      tone: 'default',
      note: `이번 주 새로 가입 ${joinedThisWeek}명`,
    },
    { label: '승인 대기', value: value(pending, '명'), tone: 'warn', note: '승인하면 로봇을 배정할 수 있어요' },
    {
      label: '운영 중인 Jubi',
      value: value(operating.length, '대'),
      tone: 'brand',
      note: breakdown || '공원에 배정된 로봇이 없어요',
    },
    {
      label: '확인이 필요한 로봇',
      value: value(troubled.length, '대'),
      tone: 'error',
      note: troubled.length
        ? `${troubled[0].name} · ${parkName(troubled[0])}${troubled.length > 1 ? ` 외 ${troubled.length - 1}대` : ''}`
        : '모든 로봇이 정상이에요',
    },
  ];

  const managers = [...registrations].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, PREVIEW_ROWS);
  const robotPreview = [...robots]
    .sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }))
    .slice(0, PREVIEW_ROWS);

  return (
    <>
      <header className="home-title">
        <h1>안녕하세요, 운영 관리자님</h1>
        <p>
          {todayLabel(now)}
          {!loading && ` · 공원 ${parkCount}곳에서 Jubi ${operating.length}대가 일하고 있어요`}
        </p>
      </header>

      {error && (
        <p role="alert" className="error-panel">
          {error}{' '}
          <button className="button soft compact-button" onClick={onReload}>
            다시 시도
          </button>
        </p>
      )}

      <div className="home-stats">
        {stats.map((s) => (
          <section className="home-stat" key={s.label}>
            <span>{s.label}</span>
            <strong className={`tone-${s.tone}`}>{s.value}</strong>
            <small>{s.note}</small>
          </section>
        ))}
      </div>

      <div className="home-boards">
        <section className="home-board" aria-labelledby="home-managers">
          <div className="home-board-title">
            <h2 id="home-managers">관리자 보기</h2>
            <ViewAll label="관리자 전체 보기" onClick={onManagers} />
          </div>
          <div className="table-scroll">
            <table className="home-manager-table">
              <thead>
                <tr>
                  <th scope="col">관리자</th>
                  <th scope="col">담당 공원</th>
                  <th scope="col">담당 로봇</th>
                  <th scope="col">승인 여부</th>
                </tr>
              </thead>
              <tbody>
                {managers.map((m) => {
                  const assigned = robots.filter((r) => r.parkId === m.id).map((r) => r.name);
                  return (
                    <tr key={m.id}>
                      <th scope="row">
                        {m.applicantName}
                        <small>{m.applicantLoginId}</small>
                      </th>
                      <td>{m.name}</td>
                      <td className={assigned.length ? undefined : 'muted'}>
                        {assigned.length ? assigned.join(', ') : '배정 전'}
                      </td>
                      <td>
                        <span className={`badge badge-${m.registrationStatus}`}>{APPROVAL[m.registrationStatus]}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!loading && !registrations.length && <p className="empty">가입한 관리자가 없어요.</p>}
          {loading && (
            <p role="status" className="loading">
              관리자 목록을 불러오는 중…
            </p>
          )}
        </section>

        <section className="home-board home-robots" aria-labelledby="home-robots">
          <div className="home-board-title">
            <h2 id="home-robots">로봇 목록</h2>
            <ViewAll label="로봇 전체 보기" onClick={onRobots} />
          </div>
          <ul className="home-robot-list">
            {robotPreview.map((r) => (
              <li key={r.id}>
                <span className={`home-robot-icon ${r.status === 'error' ? 'error' : ''}`}>
                  <img
                    src={r.status === 'error' ? '/icons/bot-error.svg' : '/icons/bot-brand.svg'}
                    width="21.6"
                    height="21.6"
                    alt=""
                  />
                </span>
                <span className="home-robot-name">
                  <strong>{r.name}</strong>
                  <small>{parkName(r)}</small>
                </span>
                <span className={`badge robot-${r.status}`}>{ROBOT_STATUS[r.status].label}</span>
                <span className="home-robot-battery" title="배터리 전압">
                  <img src="/icons/battery.svg" width="17.28" height="17.28" alt="" />
                  {r.batteryVoltage == null ? '—' : `${r.batteryVoltage.toFixed(1)}V`}
                </span>
              </li>
            ))}
          </ul>
          {!loading && !robots.length && <p className="empty">등록된 로봇이 없어요.</p>}
          {loading && (
            <p role="status" className="loading">
              로봇 목록을 불러오는 중…
            </p>
          )}
        </section>
      </div>
    </>
  );
}
