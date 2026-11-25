// W-03 공원별 보고 · W-03 공원별 보고 - 일일 보고 (Figma Page 4 · 290:730 / 290:1050)
import { useEffect, useRef, useState } from 'react';
import * as api from '../api/admin';
import { Pagination } from './Pagination';
import { paginate } from './pageData';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MATERIAL: Record<api.ReportMaterial, { name: string; color: string }> = {
  pet: { name: '페트', color: '#5268d4' },
  can: { name: '캔', color: '#a3b0ff' },
  glass: { name: '유리', color: '#c1caff' },
  general: { name: '일반', color: '#8390a3' },
};
const ERROR_TEXT: Record<string, string> = {
  path_blocked: '길이 막혀 멈췄어요',
  pick_failed_repeatedly: '여러 번 줍지 못해 멈췄어요',
  low_battery: '배터리가 부족해 멈췄어요',
  return_failed: '분리수거장으로 돌아가지 못했어요',
  device_failure: '장치에 문제가 생겼어요',
};
const BAR_MAX = 110;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 30초마다 다시 불러오는 간단한 조회 (AdminOperations와 같은 방식) */
function useLoad<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    loader
      .current(controller.signal)
      .then((v) => !controller.signal.aborted && setData(v))
      .catch((e) => !controller.signal.aborted && setError(e instanceof Error ? e.message : '불러오지 못했어요'))
      .finally(() => !controller.signal.aborted && setLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, ...deps]);
  return { data, error, loading, reload: () => setRevision((v) => v + 1) };
}

export function ParkReports() {
  const parks = useLoad((s) => api.getAdminParks(s), []);
  const robots = useLoad((s) => api.getAdminRobots(s), []);
  const [selected, setSelected] = useState<api.AdminPark>();
  const [page, setPage] = useState(1);
  const list = paginate(parks.data ?? [], page);

  if (selected) return <DailyReport park={selected} robots={robots.data ?? []} onBack={() => setSelected(undefined)} />;

  return (
    <>
      <h1 className="page-title">공원별 보고</h1>
      <div className="banner banner-yellow">
        <span>
          <img src="/icons/report-banner.svg" width="28.08" height="28.08" alt="" />
        </span>
        <strong>하루 보고를 확인할 수 있습니다.</strong>
      </div>
      <section className="board pr-board" aria-label="공원 목록">
        <div className="pr-board-head">
          <h2>공원 {parks.data?.length ?? 0}곳</h2>
          <span>로봇 기록으로 바로 계산해요</span>
        </div>
        {parks.error ? (
          <p className="rq-error" role="alert">
            {parks.error}
          </p>
        ) : null}
        {parks.loading && !parks.data ? <p className="rq-hint">공원 목록을 불러오고 있어요…</p> : null}
        <div className="pr-table" role="table" aria-label="공원별 보고 목록">
          <div className="pr-row pr-head" role="row">
            <span role="columnheader">공원명</span>
            <span role="columnheader">주소</span>
            <span role="columnheader" className="pr-center">
              보기
            </span>
          </div>
          {list.items.map((p) => (
            <div className="pr-row" role="row" key={p.id}>
              <span role="cell" className="pr-name">
                <span className="pr-pin">
                  <img src="/icons/pin-brand.svg" width="17.28" height="17.28" alt="" />
                </span>
                {p.name}
              </span>
              <span role="cell" className="pr-address">
                {p.address}
              </span>
              <span role="cell" className="pr-center">
                <button className="pr-view" onClick={() => setSelected(p)} aria-label={`${p.name} 보고 보기`}>
                  보기
                </button>
              </span>
            </div>
          ))}
          {parks.data && list.total === 0 ? <p className="empty">승인된 공원이 없어요.</p> : null}
        </div>
        <Pagination {...list} onChange={setPage} />
      </section>
    </>
  );
}

/** 일일 보고 화면 */
function DailyReport({ park, robots, onBack }: { park: api.AdminPark; robots: api.AdminRobot[]; onBack: () => void }) {
  const today = startOfDay(new Date());
  const [day, setDay] = useState(today);
  const report = useLoad((s) => api.getParkDailyReport(park, robots, day, s), [park.id, day.getTime(), robots.length]);
  const r = report.data;
  const isToday = day.getTime() === today.getTime();
  const noun = isToday ? '오늘' : '이날';
  const shift = (n: number) => setDay((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
  const change =
    r && r.previousPickups > 0 ? Math.round(((r.pickups - r.previousPickups) / r.previousPickups) * 100) : null;
  const materialTotal = r?.materials.reduce((n, m) => n + m.count, 0) ?? 0;
  const hourTotal = r?.hourly.reduce((n, h) => n + h.count, 0) ?? 0;
  const maxHour = Math.max(1, ...(r?.hourly.map((h) => h.count) ?? [1]));
  const peak = r && hourTotal ? r.hourly.reduce((a, b) => (b.count > a.count ? b : a)) : null;

  return (
    <div className="dr">
      <div className="dr-head">
        <div className="dr-title">
          <button className="dr-back" onClick={onBack}>
            <img src="/icons/back-left.svg" width="17.28" height="17.28" alt="" />
            공원별 보고
          </button>
          <h1>{park.name} 일일 보고</h1>
        </div>
        <div className="dr-date">
          <button onClick={() => shift(-1)} aria-label="이전 날">
            <img src="/icons/date-prev.svg" width="21.6" height="21.6" alt="" />
          </button>
          <strong>
            {day.getFullYear()}년 {day.getMonth() + 1}월 {day.getDate()}일 ({DAYS[day.getDay()]})
          </strong>
          <button onClick={() => shift(1)} aria-label="다음 날" disabled={isToday}>
            <img src="/icons/date-next.svg" width="21.6" height="21.6" alt="" />
          </button>
        </div>
      </div>

      {report.error ? (
        <div className="error-panel" role="alert">
          <p>{report.error}</p>
          <button className="button soft" onClick={report.reload}>
            다시 시도
          </button>
        </div>
      ) : !r ? (
        <p className="rq-hint">보고를 만들고 있어요…</p>
      ) : (
        <>
          {r.robotNames.length === 0 ? (
            <p className="dr-note">이 공원에 배정된 로봇이 없어서 기록이 없어요. 로봇 목록에서 배정할 수 있어요.</p>
          ) : null}
          <div className="dr-columns">
            {/* 1열: 수거량 · 요약 · 통계 · 인사이트 */}
            <div className="dr-col">
              <section className="dr-hero">
                <span>{noun}의 수거량</span>
                <strong>{r.pickups}개</strong>
                <p>
                  {change == null
                    ? '전날 기록이 없어요'
                    : change === 0
                      ? '전날과 같아요'
                      : `전날보다 ${Math.abs(change)}% ${change > 0 ? '늘었어요' : '줄었어요'}`}
                </p>
              </section>
              <section className="dr-summary">
                <h2>에이전트의 하루 요약</h2>
                <p>
                  {r.pickups || r.patrols
                    ? `${noun}은 ${r.patrols}번 순찰하며 쓰레기 ${r.pickups}개를 수거했어요. 분리수거장에 ${r.stationVisits}번 다녀왔어요.`
                    : `${noun}은 로봇이 순찰하거나 수거한 기록이 없어요.`}
                </p>
              </section>
              <section className="dr-stats">
                <div>
                  <span>집기 성공률</span>
                  <strong>{r.pickSuccessRate == null ? '—' : `${r.pickSuccessRate}%`}</strong>
                </div>
                <div>
                  <span>순찰</span>
                  <strong>{r.patrols}회</strong>
                </div>
                <div>
                  <span>분리수거장</span>
                  <strong>{r.stationVisits}회</strong>
                </div>
              </section>
              <section className="dr-insight">
                <span>{noun}의 인사이트</span>
                <p>
                  {peak
                    ? `${peak.range}시에 쓰레기를 가장 많이 주웠어요 (${peak.count}개)`
                    : '아직 인사이트를 만들 기록이 없어요'}
                </p>
              </section>
            </div>

            {/* 2열: 재질별 · 시간대별 */}
            <div className="dr-col">
              <section className="dr-card">
                <h2>재질별 수거량</h2>
                <div className="dr-donut-row">
                  <Donut items={r.materials} total={materialTotal} />
                  <ul className="dr-legend">
                    {r.materials.map((m) => (
                      <li key={m.key}>
                        <i style={{ background: MATERIAL[m.key].color }} />
                        <span>{MATERIAL[m.key].name}</span>
                        <strong>{m.count}개</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
              <section className="dr-card">
                <div className="dr-card-head">
                  <h2>시간대별 수거량</h2>
                  <span>단위: 개</span>
                </div>
                <div className="dr-bars">
                  {r.hourly.map((h) => (
                    <div key={h.range} className="dr-bar-col">
                      <strong>{h.count}</strong>
                      <i style={{ height: Math.max(2, (h.count / maxHour) * BAR_MAX) }} />
                      <span>{h.range}</span>
                    </div>
                  ))}
                </div>
                <span className="dr-foot">08–18시 · 총 {hourTotal}개</span>
              </section>
            </div>

            {/* 3열: 처리 못 한 일 */}
            <div className="dr-col">
              <h2 className="dr-col-title">처리 못 한 일</h2>
              {r.unpickable === 0 && r.errors.length === 0 && r.missedPatrols === 0 ? (
                <p className="rq-hint">처리 못 한 일이 없어요</p>
              ) : null}
              {r.unpickable > 0 ? (
                <Todo icon="report-hand" title={`자동 수거 제외 쓰레기 ${r.unpickable}개`}>
                  집기 불가 대상은 관리자님의 현장 확인과 직접 처리가 필요해요.
                </Todo>
              ) : null}
              {r.errors.length > 0 ? (
                <Todo icon="report-alert" title={`로봇 오류 ${r.errors.length}번`}>
                  {r.errors
                    .slice(0, 3)
                    .map((e) => `${e.robotName} · ${hhmm(e.occurredAt)} ${ERROR_TEXT[e.code] ?? e.code}`)
                    .join('\n')}
                </Todo>
              ) : null}
              {r.missedPatrols > 0 ? (
                <Todo icon="report-route" title={`시작하지 못한 순찰 ${r.missedPatrols}번`}>
                  연결 상태와 로봇 상태를 확인해 주세요.
                </Todo>
              ) : null}
            </div>
          </div>
          <p className="dr-written">
            {r.date.replaceAll('-', '.')} 기록 · {hhmm(r.generatedAt)} 기준
          </p>
        </>
      )}
    </div>
  );
}

function Todo({ icon, title, children }: { icon: string; title: string; children: string }) {
  return (
    <section className="dr-todo">
      <img src={`/icons/${icon}.svg`} width="23.76" height="23.76" alt="" />
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </section>
  );
}

/** 재질별 도넛 (SVG 원호) */
function Donut({
  items,
  total,
  size = 142,
  ring = 24,
}: {
  items: api.ParkDailyReport['materials'];
  total: number;
  size?: number;
  ring?: number;
}) {
  const r = (size - ring) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="dr-donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        {total === 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e8ecf2" strokeWidth={ring} />
        ) : (
          items.map((m) => {
            const len = (m.count / total) * c;
            const el = (
              <circle
                key={m.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={MATERIAL[m.key].color}
                strokeWidth={ring}
                strokeDasharray={`${Math.max(len - 2, 0)} ${c}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += len;
            return el;
          })
        )}
      </svg>
      <div className="dr-donut-center">
        <strong>{total}개</strong>
        <span>총 수거량</span>
      </div>
    </div>
  );
}
