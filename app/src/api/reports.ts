// 일일 보고 API (A-10)
import { mockResponse, request, mockFor } from './client';
import { mockReport } from './mock/reports';
import type { DailyReport } from './types';

/** GET /reports/{date}  date: 'YYYY-MM-DD' */
export function getDailyReport(date: string): Promise<DailyReport> {
  return mockFor('reports') ? mockResponse({ ...mockReport, date }) : request(`/reports/${date}`);
}
