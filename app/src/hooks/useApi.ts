import { useCallback, useEffect, useState } from 'react';
import type { DependencyList } from 'react';

type ApiState<T> = {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
};

/**
 * api 함수를 불러서 { data, error, loading, reload } 로 돌려주는 공통 훅.
 * 화면은 이 훅을 감싼 useRobotStatus 같은 훅을 써요. (화면에서 api를 직접 부르지 않기)
 *
 * @param fetcher api 함수를 부르는 함수. 예) () => getNotifications(type)
 * @param deps fetcher 안에서 쓰는 값. 바뀌면 다시 불러와요. (useEffect의 deps와 같아요)
 * @param options.refreshMs 주기적으로 다시 불러올 간격(ms). 실시간 상태에 써요.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: DependencyList, options: { refreshMs?: number } = {}) {
  const { refreshMs } = options;
  const [state, setState] = useState<ApiState<T>>({ data: undefined, error: undefined, loading: true });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true; // 화면을 벗어난 뒤 늦게 온 응답은 버려요
    const load = () => {
      fetcher().then(
        (data) => alive && setState({ data, error: undefined, loading: false }),
        (error: Error) => alive && setState((prev) => ({ ...prev, error, loading: false })),
      );
    };
    load();
    const timer = refreshMs ? setInterval(load, refreshMs) : undefined;
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
    // deps는 호출하는 쪽에서 넘겨요. 호출부의 deps는 ESLint(additionalHooks: useApi)가 검사해요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey, refreshMs]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { ...state, reload };
}
