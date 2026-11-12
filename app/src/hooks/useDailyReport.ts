import { getDailyReport } from '@/api/reports';
import { toDateKey } from '@/utils/date';

import { useApi } from './useApi';

/** 일일 보고. 날짜를 바꾸면 다시 불러와요. */
export function useDailyReport(date: Date) {
  const key = toDateKey(date);
  return useApi(() => getDailyReport(key), [key]);
}
