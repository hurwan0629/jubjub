// 순찰 경로 API (A-04 경로 편집)
import { ApiError, mockResponse, request, mockFor } from './client';
import { getMockSession, saveMockSession } from './mock/onboarding';
import { mockAssignedRobots } from './mock/robot';
import { mockRouteConfig } from './mock/route';
import type { AssignedRobot, RouteConfig } from './types';

const routePath = (robotId?: string | null) => `/route${robotId ? `?robotId=${encodeURIComponent(robotId)}` : ''}`;

/** 승인된 내 공원에 배정된 로봇. 미배정 상태에서도 초기 설정을 할 수 있어요. */
export function getPatrolRobots(): Promise<AssignedRobot[]> {
  return mockFor('route') ? mockResponse(getMockSession().robots ?? mockAssignedRobots) : request('/robots');
}

/** 선택한 로봇의 최신 이름과 연결 상태를 불러와요. */
export async function getPatrolRobot(robotId: string): Promise<AssignedRobot> {
  if (!mockFor('route')) return request(`/robots/${encodeURIComponent(robotId)}`);
  const robot = (await getPatrolRobots()).find((r) => r.id === robotId);
  if (!robot) throw new ApiError(404, '배정된 로봇을 찾을 수 없어요', 'robot_not_found');
  return robot;
}

/** 로봇 이름만 변경해요. 경로·시간표와 기기 식별 번호는 유지해요. */
export async function renamePatrolRobot(robotId: string, name: string): Promise<AssignedRobot> {
  if (!mockFor('route'))
    return request(`/robots/${encodeURIComponent(robotId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) throw new ApiError(422, '로봇 이름은 1~100자로 입력해 주세요');
  const robot = await getPatrolRobot(robotId);
  const session = getMockSession();
  const updated = { ...robot, name: trimmed };
  session.robots = (session.robots ?? mockAssignedRobots).map((r) => (r.id === robotId ? updated : r));
  await saveMockSession();
  return mockResponse(updated);
}

/** GET /route : 승인된 공원의 순찰 경로 · 시간표. */
export async function getRouteConfig(robotId?: string): Promise<RouteConfig> {
  if (!mockFor('route')) return request(routePath(robotId));
  const session = getMockSession();
  if (robotId) {
    await getPatrolRobot(robotId);
    const firstRobotId = (session.robots ?? mockAssignedRobots)[0]?.id;
    const legacy = robotId === firstRobotId && session.route ? { ...session.route, robotId } : undefined;
    const config = session.robotRoutes?.[robotId] ??
      legacy ?? { ...mockRouteConfig, robotId, points: [], schedule: [] };
    return mockResponse({
      ...config,
      catalogId: config.catalogId ?? session.park?.catalogId,
      station: session.station === undefined ? config.station : session.station,
    });
  }
  const config = session.route ?? mockRouteConfig;
  return mockResponse({ ...config, catalogId: config.catalogId ?? session.park?.catalogId });
}

/**
 * POST /route/complete : 처음 설정을 마쳤는지 서버가 확인해요 (분리수거장 · 순찰 지점 · 시간표가 모두 저장됐는지).
 * 빠진 게 있으면 409 setup_incomplete 예요.
 */
export async function completeRouteSetup(robotId?: string | null, catalogId?: string): Promise<void> {
  if (mockFor('route')) return;
  const query = new URLSearchParams();
  if (robotId) query.set('robotId', robotId);
  if (catalogId) query.set('catalogId', catalogId);
  const qs = query.toString();
  await request(`/route/complete${qs ? `?${qs}` : ''}`, { method: 'POST' });
}

/** PUT /route : 경로 · 시간표 저장 */
export async function saveRouteConfig(config: RouteConfig): Promise<RouteConfig> {
  if (mockFor('route')) {
    const session = getMockSession();
    if (
      session.park &&
      ((config.catalogId && config.catalogId !== session.park.catalogId) ||
        (!config.catalogId && session.parkChanges?.some((change) => change.status === 'approved')))
    ) {
      throw new ApiError(409, '관리 공원이 변경됐어요. 경로를 다시 불러와 주세요', 'park_changed');
    }
    if (config.robotId) {
      await getPatrolRobot(config.robotId);
      session.robotRoutes = { ...session.robotRoutes, [config.robotId]: structuredClone(config) };
    } else session.route = structuredClone(config);
    session.station = config.station;
    session.profile.routeSetupDone = true;
    if (session.park) session.park.routeSetupDone = true;
    await saveMockSession();
    return mockResponse(config, 300);
  }
  const { catalogId, defaultStationId, station, points, schedule } = config;
  return request(routePath(config.robotId), {
    method: 'PUT',
    body: JSON.stringify({ catalogId, defaultStationId, station, points, schedule }),
  });
}
