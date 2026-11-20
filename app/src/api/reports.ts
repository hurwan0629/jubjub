// 기간 보고 API (A-10 보고). 서버: server/app/routers/reports.py
import { mockFor, mockResponse, request } from './client';
import { mockDayReport, mockMonthReport, mockWeekReport } from './mock/reports';
import type { PeriodReport } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** GET /reports?from=YYYY-MM-DD&to=YYYY-MM-DD (둘 다 포함, 최대 92일) */
export function getReport(from: string, to: string): Promise<PeriodReport> {
  if (mockFor('reports')) {
    const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
    const sample = days <= 1 ? mockDayReport : days <= 8 ? mockWeekReport : mockMonthReport;
    return mockResponse({ ...sample, from, to });
  }
  return request(`/reports?from=${from}&to=${to}`);
}
