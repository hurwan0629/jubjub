import { getPeriodReport } from '@/api/reports';

import { useApi } from './useApi';

/** A-10 기간 보고. from · to는 날짜(0시)예요. to는 포함하지 않아요. */
export function usePeriodReport(from: Date, to: Date) {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  return useApi(() => getPeriodReport(new Date(fromMs), new Date(toMs)), [fromMs, toMs]);
}
