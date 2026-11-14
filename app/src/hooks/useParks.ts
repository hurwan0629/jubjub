import { useEffect, useState } from 'react';

import { PARK_PAGE_SIZE, searchParks } from '@/api/parks';
import type { Park } from '@/api/types';

/** 글자를 칠 때마다 서버를 부르지 않도록, 입력이 멈춘 뒤에 검색해요 */
const TYPING_DELAY_MS = 300;

type SearchState = {
  key: string; // 이 결과가 어떤 검색어의 결과인지
  items: Park[];
  hasMore: boolean;
  error?: Error;
  loadingMore: boolean;
};

const EMPTY: SearchState = { key: '', items: [], hasMore: false, loadingMore: false };

/**
 * 공원 이름 · 주소 검색 (C-03 공원 찾기). 검색어가 바뀌면 처음부터 다시 찾고, loadMore로 다음 20곳을 이어 붙여요.
 * loading은 첫 페이지를 기다리는 중, loadingMore는 더 보기를 기다리는 중이에요.
 */
export function useParkSearch(query: string) {
  const q = query.trim();
  const [typed, setTyped] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setTyped(q), TYPING_DELAY_MS);
    return () => clearTimeout(t);
  }, [q]);

  const [state, setState] = useState<SearchState>(EMPTY);

  useEffect(() => {
    if (!typed) return;
    let alive = true; // 검색어가 바뀐 뒤 늦게 온 응답은 버려요
    searchParks(typed).then(
      (items) => alive && setState({ key: typed, items, hasMore: items.length === PARK_PAGE_SIZE, loadingMore: false }),
      (error: Error) => alive && setState({ ...EMPTY, key: typed, error }),
    );
    return () => {
      alive = false;
    };
  }, [typed]);

  const current = !!typed && state.key === typed;
  const loadMore = () => {
    if (!current || !state.hasMore || state.loadingMore) return;
    setState((s) => ({ ...s, loadingMore: true }));
    searchParks(typed, state.items.length).then(
      (more) =>
        setState((s) =>
          s.key === typed
            ? { ...s, items: [...s.items, ...more], hasMore: more.length === PARK_PAGE_SIZE, loadingMore: false }
            : s,
        ),
      (error: Error) => setState((s) => (s.key === typed ? { ...s, error, loadingMore: false } : s)),
    );
  };

  return {
    /** 검색어가 있어서 결과 목록을 보여 줄 때 */
    active: !!q,
    items: current ? state.items : [],
    loading: !!q && (!current || q !== typed),
    error: current ? state.error : undefined,
    hasMore: current && state.hasMore,
    loadingMore: current && state.loadingMore,
    loadMore,
  };
}
