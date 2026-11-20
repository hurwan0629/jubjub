// 보고 기간 계산 (A-10 오늘 · 이번 주 · 이번 달 · 직접 선택). 주는 월요일부터 일요일까지예요.

export type PeriodKind = 'day' | 'week' | 'month' | 'range';
export type Period = { kind: PeriodKind; from: Date; to: Date };

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_MS = 24 * 60 * 60 * 1000;
/** 직접 선택은 최대 3개월 (92일) */
export const MAX_RANGE_DAYS = 92;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const two = (n: number) => String(n).padStart(2, '0');
export const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();
export const daysBetween = (a: Date, b: Date) =>
  Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS) + 1;

/** 기준 날짜(기본 오늘)가 들어간 기간 */
export function periodOf(kind: Exclude<PeriodKind, 'range'>, anchor = new Date()): Period {
  const day = startOfDay(anchor);
  if (kind === 'day') return { kind, from: day, to: day };
  if (kind === 'week') {
    const from = addDays(day, -((day.getDay() + 6) % 7)); // 월요일
    return { kind, from, to: addDays(from, 6) };
  }
  const from = new Date(day.getFullYear(), day.getMonth(), 1);
  return { kind, from, to: new Date(day.getFullYear(), day.getMonth() + 1, 0) };
}

/** 오늘 이후는 잘라요 (이번 주 · 이번 달은 오늘까지만 집계해요) */
export function clampToToday(p: Period): Period {
  const today = startOfDay(new Date());
  return p.to > today ? { ...p, to: today } : p;
}

/** 화살표로 이전 · 다음 기간 */
export function shiftPeriod(p: Period, dir: -1 | 1): Period {
  if (p.kind === 'day') return periodOf('day', addDays(p.from, dir));
  if (p.kind === 'week') return periodOf('week', addDays(p.from, 7 * dir));
  if (p.kind === 'month') return periodOf('month', new Date(p.from.getFullYear(), p.from.getMonth() + dir, 1));
  const len = daysBetween(p.from, p.to);
  return { kind: 'range', from: addDays(p.from, len * dir), to: addDays(p.to, len * dir) };
}

/** 다음 기간이 미래면 화살표를 막아요 */
export const canGoNext = (p: Period) => shiftPeriod(p, 1).from <= startOfDay(new Date());

const md = (d: Date) => `${two(d.getMonth() + 1)}.${two(d.getDate())}`;
/** '11.03 (화)' */
export const mdWithDay = (d: Date) => `${md(d)} (${DAYS[d.getDay()]})`;

/** 날짜 줄 글자: '2026년 11월 6일 (금)' · '11.02 – 11.08 (이번 주)' · '2026년 11월 (1일 – 9일)' · '11.03 – 11.07' */
export function periodLabel(p: Period) {
  const today = new Date();
  if (p.kind === 'day') {
    return `${p.from.getFullYear()}년 ${p.from.getMonth() + 1}월 ${p.from.getDate()}일 (${DAYS[p.from.getDay()]})`;
  }
  if (p.kind === 'week') {
    const current = periodOf('week');
    return `${md(p.from)} – ${md(p.to)}${sameDay(current.from, p.from) ? ' (이번 주)' : ''}`;
  }
  if (p.kind === 'month') {
    const ym = `${p.from.getFullYear()}년 ${p.from.getMonth() + 1}월`;
    const current = p.from.getFullYear() === today.getFullYear() && p.from.getMonth() === today.getMonth();
    return current ? `${ym} (1일 – ${today.getDate()}일)` : ym;
  }
  return `${md(p.from)} – ${md(p.to)}`;
}

/** 큰 수거량 상자 제목 */
export function heroTitle(p: Period) {
  const today = new Date();
  if (p.kind === 'day')
    return sameDay(p.from, today) ? '오늘의 수거량' : `${p.from.getMonth() + 1}월 ${p.from.getDate()}일 수거량`;
  if (p.kind === 'week') return sameDay(periodOf('week').from, p.from) ? '이번 주 수거량' : '그 주 수거량';
  if (p.kind === 'month')
    return p.from.getMonth() === today.getMonth() && p.from.getFullYear() === today.getFullYear()
      ? '이번 달 수거량'
      : `${p.from.getMonth() + 1}월 수거량`;
  return `${daysBetween(p.from, p.to)}일 동안 수거량`;
}

/** '전날보다 12% 늘었어요' · '지난주보다 9% 줄었어요' */
export function changeText(p: Period, percent: number | null) {
  if (percent === null) return '비교할 지난 기록이 없어요';
  const base = { day: '전날보다', week: '지난주보다', month: '지난달 같은 기간보다', range: '바로 앞 같은 기간보다' }[
    p.kind
  ];
  if (percent === 0) return `${base} 그대로예요`;
  return `${base} ${Math.abs(percent)}% ${percent > 0 ? '늘었어요' : '줄었어요'}`;
}
