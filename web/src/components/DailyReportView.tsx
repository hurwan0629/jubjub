import type { AdminReport } from '../api/admin';

const PALETTE = ['var(--brand)', 'var(--report-can)', 'var(--report-glass)', 'var(--report-general)'];
const MATERIAL: Record<string, string> = {
  plastic: '플라스틱',
  pet: '플라스틱',
  can: '캔',
  glass: '유리',
  general: '일반 쓰레기',
  paper: '종이',
};
const amount = (value: number | null) => (value == null ? '미집계' : value.toLocaleString('ko-KR'));

export function DailyReportView({ report: r }: { report: AdminReport }) {
  const materialTotal = r.materials.reduce((sum, item) => sum + item.count, 0);
  const hourlyTotal = r.hourly.reduce((sum, item) => sum + item.count, 0);
  const maxHourly = Math.max(1, ...r.hourly.map((item) => item.count));
  let offset = 0;
  const segments = r.materials.map((item, i) => {
    const length = materialTotal ? (item.count / materialTotal) * 100 : 0;
    const segment = { ...item, length, offset, color: PALETTE[i % PALETTE.length] };
    offset += length;
    return segment;
  });
  const demo = r.summary.includes('화면 확인용 예시');
  return (
    <article className="daily-report" aria-label={`${r.date} 일일 보고`}>
      <div className="report-date-line">
        <span>{r.date} 일일 보고</span>
        {demo && <span className="report-demo-label">화면 확인용 예시</span>}
      </div>
      <div className="report-columns">
        <div className="report-column">
          <section className="report-card collection-card">
            <div className="report-card-heading">
              <h3>오늘의 수거량</h3>
              <span className="report-symbol">
                <img src="/icons/bot.svg" width="22" height="22" alt="" />
              </span>
            </div>
            <p className="collection-value">
              {amount(r.pickups)}
              {r.pickups != null && <span>개</span>}
            </p>
            <span className="report-subtitle">공원을 더 깨끗하게 만들었어요</span>
            <dl className="report-mini-stats">
              <div>
                <dt>순찰 완료</dt>
                <dd>
                  {amount(r.patrolsDone)}
                  <span> / {amount(r.patrolsPlanned)}회</span>
                </dd>
              </div>
              <div>
                <dt>분리수거장</dt>
                <dd>
                  {amount(r.stationVisits)}
                  <span>회 방문</span>
                </dd>
              </div>
            </dl>
          </section>
          <section className="report-card">
            <div className="report-card-heading">
              <h3>에이전트 요약</h3>
              <span className="report-tag">하루 돌아보기</span>
            </div>
            <p className="report-summary">{r.summary || '아직 작성된 요약이 없어요.'}</p>
          </section>
          <section className="report-card insight-card">
            <div className="report-card-heading">
              <h3>오늘의 인사이트</h3>
              <span className="report-tag">{r.insights.length}개</span>
            </div>
            {r.insights.length ? (
              <ol className="report-insights">
                {r.insights.map((item, i) => (
                  <li key={i}>
                    <span className="insight-number">{i + 1}</span>
                    <p>{item}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="report-no-data">아직 작성된 인사이트가 없어요.</p>
            )}
          </section>
        </div>
        <div className="report-column">
          <section className="report-card">
            <div className="report-card-heading">
              <h3>재질별 수거량</h3>
              <span className="report-subtitle">단위 · 개</span>
            </div>
            {materialTotal > 0 ? (
              <div className="material-breakdown">
                <div className="report-donut" role="img" aria-label={`재질별 수거량 합계 ${materialTotal}개`}>
                  <svg viewBox="0 0 120 120" aria-hidden="true">
                    <circle cx="60" cy="60" r="47" fill="none" stroke="var(--border)" strokeWidth="13" />
                    {segments.map((item, i) => (
                      <circle
                        key={i}
                        cx="60"
                        cy="60"
                        r="47"
                        fill="none"
                        stroke={item.color}
                        strokeWidth="13"
                        pathLength="100"
                        strokeDasharray={`${item.length} ${100 - item.length}`}
                        strokeDashoffset={-item.offset}
                        transform="rotate(-90 60 60)"
                      />
                    ))}
                  </svg>
                  <div className="donut-total">
                    <strong>{materialTotal}</strong>
                    <span>총 수거량</span>
                  </div>
                </div>
                <ul className="material-legend">
                  {segments.map((item, i) => (
                    <li key={i}>
                      <span className="material-name">
                        <i style={{ background: item.color }} />
                        {MATERIAL[item.material] ?? item.material}
                      </span>
                      <strong>
                        {item.count}
                        <small>{Math.round(item.length)}%</small>
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="report-chart-empty">수거 기록이 없어요</div>
            )}
          </section>
          <section className="report-card">
            <div className="report-card-heading">
              <h3>시간대별 수거량</h3>
              <span className="report-subtitle">단위 · 개</span>
            </div>
            {r.hourly.length ? (
              <div className="hourly-chart" role="img" aria-label={`시간대별 수거량 합계 ${hourlyTotal}개`}>
                {r.hourly.map((item, i) => (
                  <div className="hourly-column" key={i}>
                    <div className="hourly-track">
                      <div className="hourly-bar" style={{ height: `${(item.count / maxHourly) * 100}%` }}>
                        <span>{item.count}</span>
                      </div>
                    </div>
                    <span className="hourly-label">{item.hour}시</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="report-chart-empty">시간대별 기록이 없어요</div>
            )}
            <div className="chart-total">
              <span>오늘의 총 수거량</span>
              <strong>
                {hourlyTotal}
                <span>개</span>
              </strong>
            </div>
          </section>
        </div>
        <div className="report-column">
          <section className="report-card events-card">
            <div className="report-card-heading">
              <h3>주요 이벤트</h3>
              <span className="report-tag">{r.events.length}건</span>
            </div>
            {r.events.length ? (
              <ol className="report-timeline">
                {r.events.map((event, i) => (
                  <li key={i}>
                    <span className="timeline-dot" />
                    <time>{event.time}</time>
                    <h4>{event.title}</h4>
                    <p>{event.detail}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="report-no-data">기록된 이벤트가 없어요.</p>
            )}
          </section>
          {demo && (
            <p className="report-demo-note">
              이 보고는 화면 확인용 데이터예요.
              <br />
              실제 로봇의 운행 기록이 아니에요.
            </p>
          )}
        </div>
      </div>
      <footer className="report-written-at">
        보고 작성 · {new Date(r.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
      </footer>
    </article>
  );
}
