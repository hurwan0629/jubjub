// 로봇 상태·작업 대기열 API (A-01 홈, A-02 지도)
import { mockResponse, request, mockFor } from './client';
import { mockRobot, mockTasks, mockToday } from './mock/robot';
import { getDetections, getRobotErrors, getRobotState, getRobotTasks } from './robotProtocol';
import type { RobotErrorCode } from './robotProtocol';
import { getPatrolRobots, getRouteConfig } from './route';
import type {
  AssignedRobot,
  HomeRobotStatus,
  PatrolSlot,
  RobotState,
  RobotStatus,
  RouteConfig,
  Task,
  TodaySummary,
} from './types';

const HOME_STATE: Record<AssignedRobot['status'], RobotState> = {
  working: 'patrolling',
  returning: 'returning',
  emptying: 'emptying',
  idle: 'idle',
  offline: 'disconnected',
  error: 'error',
};

/** 로봇 오류 코드 → 홈 카드 한 줄 설명 */
const ERROR_TEXT: Record<RobotErrorCode, string> = {
  path_blocked: '길이 막혀 움직이지 못해요',
  pick_failed_repeatedly: '여러 번 줍지 못해 멈췄어요',
  low_battery: '배터리가 부족해요',
  return_failed: '분리수거장으로 돌아가지 못했어요',
  device_failure: '장치에 문제가 생겼어요',
};

function hhmm(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 서버 상태(GET /robots/{id}/state) + 저장된 경로 + 최근 오류로 홈 카드 문구를 만들어요. */
async function liveRobotStatus(robot: AssignedRobot): Promise<HomeRobotStatus> {
  const [state, route, errors] = await Promise.all([
    getRobotState(robot.id),
    getRouteConfig(robot.id).catch(() => null),
    robot.status === 'error' ? getRobotErrors(robot.id, 1).catch(() => []) : Promise.resolve([]),
  ]);
  const points = route?.points ?? [];
  const onPatrol = state.currentTaskId != null;
  const done = Math.min(state.processedPoints, points.length);
  const next = onPatrol ? (points[done]?.name ?? '분리수거장') : '—';
  const near = onPatrol && done > 0 ? points[done - 1].name : '분리수거장';
  const activity: Record<AssignedRobot['status'], string> = {
    working: onPatrol ? `순찰 지점 ${points.length}곳 중 ${done}곳을 돌았어요` : '순찰하고 있어요',
    returning: '분리수거장으로 돌아가고 있어요',
    emptying: '분리수거장에서 칸을 비우고 있어요',
    idle: '다음 순찰을 기다리고 있어요',
    offline: state.lastSeenAt ? `마지막 연결 ${hhmm(state.lastSeenAt)}` : '아직 연결된 적이 없어요',
    error: errors[0] ? ERROR_TEXT[errors[0].code] : '오류가 생겼어요',
  };
  return {
    id: robot.id,
    name: state.name,
    state: HOME_STATE[state.status],
    activity: activity[state.status],
    nearPoint: near,
    nextPoint: next,
    battery: null,
    batteryVoltage: state.batteryVoltage ?? null,
    slots: [],
    updatedAt: state.lastSeenAt ?? '',
  };
}

/** 홈 선택 버튼과 상태 카드는 같은 배정 로봇 목록을 사용해요. 실제 서버에서는 로봇마다 상태를 불러와요. */
export async function getHomeRobots(): Promise<HomeRobotStatus[]> {
  const robots = await getPatrolRobots();
  const demo = mockFor('route');
  if (!demo) return Promise.all(robots.map(liveRobotStatus));
  return robots.map((robot, index) => ({
    id: robot.id,
    name: robot.name,
    state: HOME_STATE[robot.status],
    activity: demo ? (index === 0 ? mockRobot.activity : '다음 순찰을 준비하고 있어요') : '상세 상태 수신 대기',
    nearPoint: demo && index === 0 ? mockRobot.nearPoint : '수신 대기',
    nextPoint: demo && index === 0 ? mockRobot.nextPoint : '수신 대기',
    battery: demo ? (index === 0 ? mockRobot.battery : 35) : null,
    batteryVoltage: robot.batteryVoltage ?? null,
    slots: demo ? mockRobot.slots : [],
    updatedAt: robot.lastSeenAt ?? '',
  }));
}

/** GET /robot/status */
export function getRobotStatus(): Promise<RobotStatus> {
  return mockFor('robot') ? mockResponse(mockRobot) : request('/robot/status');
}

/** GET /tasks/queue */
export function getTaskQueue(): Promise<Task[]> {
  return mockFor('robot') ? mockResponse(mockTasks) : request('/tasks/queue');
}

const isToday = (iso: string | null | undefined, now: Date) => {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

/** 오늘 요일에 도는 켜진 시간표 수 */
function plannedToday(schedule: PatrolSlot[], now: Date) {
  const weekend = now.getDay() === 0 || now.getDay() === 6;
  return schedule.filter(
    (slot) => slot.on && (slot.repeat === 'daily' || (slot.repeat === 'weekends' ? weekend : !weekend)),
  ).length;
}

/**
 * 오늘 요약 (A-01). 서버에 요약 API가 없어서, 로봇마다 작업 기록(GET /robots/{id}/tasks)과
 * 탐지 기록(GET /robots/{id}/detections)과 시간표를 모아 오늘 것만 세요.
 */
export async function getTodaySummary(): Promise<TodaySummary> {
  if (mockFor('route')) return mockResponse(mockToday);
  const robots = await getPatrolRobots();
  const now = new Date();
  const perRobot = await Promise.all(
    robots.map(async (robot) => {
      const [tasks, detections, route] = await Promise.all([
        getRobotTasks(robot.id, 100).catch(() => []),
        getDetections(robot.id, 100).catch(() => []),
        getRouteConfig(robot.id).catch((): RouteConfig | null => null),
      ]);
      const todayTasks = tasks.filter((task) => isToday(task.startedAt, now));
      return {
        pickups: detections.filter((d) => isToday(d.detectedAt, now) && d.pickupResult === 'collected').length,
        stationVisits: todayTasks.filter((task) => task.taskType === 'station_move' && task.result === 'completed')
          .length,
        patrolsDone: todayTasks.filter((task) => task.taskType === 'patrol' && task.result === 'completed').length,
        patrolsPlanned: route ? plannedToday(route.schedule, now) : 0,
      };
    }),
  );
  return perRobot.reduce(
    (sum, r) => ({
      pickups: sum.pickups + r.pickups,
      stationVisits: sum.stationVisits + r.stationVisits,
      patrolsDone: sum.patrolsDone + r.patrolsDone,
      patrolsPlanned: sum.patrolsPlanned + r.patrolsPlanned,
    }),
    { pickups: 0, stationVisits: 0, patrolsDone: 0, patrolsPlanned: 0 },
  );
}

/** POST /tasks: 지도에서 고른 지점으로 로봇 보내기 */
export function sendRobot(pointId: string): Promise<Task> {
  if (mockFor('robot')) {
    const task: Task = { id: `t${Date.now()}`, type: 'visit', label: '지정 지점 확인', eta: '--:--' };
    mockTasks.push(task);
    return mockResponse(task);
  }
  return request('/tasks', { method: 'POST', body: JSON.stringify({ pointId }) });
}

/** POST /robot/recover: 로봇 복구 완료 */
export function recoverRobot(): Promise<void> {
  if (mockFor('robot')) {
    mockRobot.state = 'idle';
    return mockResponse(undefined);
  }
  return request('/robot/recover', { method: 'POST' });
}
