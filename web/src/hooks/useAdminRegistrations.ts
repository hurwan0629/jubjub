import { useCallback, useEffect, useRef, useState } from 'react';

import {
  approveRegistration,
  getAdminRobots,
  getRegistrations,
  rejectRegistration,
  revokeRegistration,
} from '../api/admin';
import type { AdminRobot, Registration } from '../api/admin';
import { ApiError, request as apiRequest } from '../api/client';
import type { Profile } from '../api/types';

export function useAdminRegistrations() {
  const [data, setData] = useState<{ registrations: Registration[]; robots: AdminRobot[] }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [unauthorized, setUnauthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const locked = useRef(false);
  const request = useRef<AbortController | null>(null);
  const message = (e: unknown) => (e instanceof Error ? e.message : '요청을 처리하지 못했어요');
  const reload = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(undefined);
    try {
      // 목업 프로필로 총관리자 권한을 대신하지 않고 서버 권한을 확인해요.
      const profile = await apiRequest<Profile>('/me', { signal: controller.signal });
      if (profile.role !== 'super_admin') throw new ApiError(403, '총관리자만 접근할 수 있어요');
      const [registrations, robots] = await Promise.all([
        getRegistrations(controller.signal),
        getAdminRobots(controller.signal),
      ]);
      if (!controller.signal.aborted && active.current) setData({ registrations, robots });
    } catch (e) {
      if (!controller.signal.aborted && active.current) {
        setError(message(e));
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setUnauthorized(true);
          setData(undefined);
        }
      }
    } finally {
      if (!controller.signal.aborted && active.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    active.current = true;
    // 최초 서버 조회를 시작해요. 로딩 상태는 이 외부 요청의 생명주기를 반영해요.
    void reload();
    return () => {
      active.current = false;
      request.current?.abort();
    };
  }, [reload]);

  const decide = async (
    action: 'approve' | 'reject' | 'revoke',
    userId: string,
    reason: string,
    robotIds: string[],
  ) => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    try {
      if (action === 'approve') await approveRegistration(userId, robotIds);
      else if (action === 'reject') await rejectRegistration(userId, reason);
      else await revokeRegistration(userId, reason);
      if (active.current) await reload();
      return true;
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  };
  return { data, loading, error, unauthorized, busy, reload, decide };
}
