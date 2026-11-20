import { getReport } from '@/api/reports';
import { toDateKey } from '@/utils/date';

import { useApi } from './useApi';

/** 기간 보고 (A-10). 기간을 바꾸면 다시 불러와요. */
export function useReport(from: Date, to: Date) {
  const a = toDateKey(from);
  const b = toDateKey(to);
  return useApi(() => getReport(a, b), [a, b]);
}
