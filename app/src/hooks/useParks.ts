import { searchParks } from '@/api/parks';

import { useApi } from './useApi';

/** 공원 검색. 검색어가 바뀔 때마다 다시 찾아요. */
export function useParkSearch(query: string) {
  return useApi(() => searchParks(query), [query]);
}
