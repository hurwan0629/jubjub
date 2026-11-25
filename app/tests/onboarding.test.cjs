/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');

const ts = require('typescript');

// Expo의 별칭과 기기 저장소만 대체하고 실제 API 모듈을 실행한다.
const storage = new Map();
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return originalResolve.call(this, name, ...args);
};
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === '@react-native-async-storage/async-storage') {
    return { getItem: async (key) => storage.get(key) ?? null, setItem: async (key, value) => storage.set(key, value) };
  }
  return originalLoad.call(this, name, ...args);
};
require.extensions['.ts'] = (mod, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  mod._compile(result.outputText, filename);
};
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000';
const auth = require('../src/api/auth.ts');
const client = require('../src/api/client.ts');
const parks = require('../src/api/parks.ts');
const robotProtocol = require('../src/api/robotProtocol.ts');
const routes = require('../src/api/route.ts');
const calls = [];
let response = {};
let status = 200;

test('새 로봇 API는 선택한 로봇으로 순찰 제어와 기록을 조회한다', async () => {
  response = {};
  await robotProtocol.startPatrol('7');
  assert.equal(calls.at(-1).url, 'http://localhost:8000/robots/7/patrol/start');
  assert.equal(calls.at(-1).method, 'POST');
  await robotProtocol.stopPatrol('7');
  assert.equal(calls.at(-1).url, 'http://localhost:8000/robots/7/patrol/stop');
  response = [];
  await robotProtocol.getDetections('7');
  assert.equal(calls.at(-1).url, 'http://localhost:8000/robots/7/detections?limit=20&offset=0');
});

test('복귀 중인 로봇도 홈 상태로 표시한다', async () => {
  const robot = { id: '7', name: 'A', status: 'returning', batteryVoltage: null, lastSeenAt: null };
  response = (url) =>
    url.endsWith('/robots')
      ? [robot]
      : url.endsWith('/state')
        ? { ...robot, currentTaskId: null, processedPoints: 0 }
        : { points: [], schedule: [] };
  const robots = await require('../src/api/robot.ts').getHomeRobots();
  assert.equal(robots[0].state, 'returning');
  assert.equal(robots[0].activity, '분리수거장으로 돌아가고 있어요');
});

test('route writes carry the original catalog and propagate a park change conflict', async () => {
  response = {};
  const config = { catalogId: 'original', station: null, points: [], schedule: [] };
  await routes.saveRouteConfig(config);
  assert.equal(JSON.parse(calls.at(-1).body).catalogId, 'original');
  status = 409;
  response = { message: 'Park changed', code: 'park_changed' };
  try {
    await assert.rejects(routes.saveRouteConfig(config), { status: 409, code: 'park_changed' });
  } finally {
    status = 200;
  }
});

test('park change API sends only the requested park and reason', async () => {
  response = [];
  await parks.getParkChangeRequests();
  assert.equal(calls.at(-1).url, 'http://localhost:8000/park-change-requests');
  response = { id: '31', status: 'pending' };
  await parks.requestParkChange('18', 'new workplace');
  assert.equal(calls.at(-1).method, 'POST');
  assert.deepEqual(JSON.parse(calls.at(-1).body), { catalogId: '18', reason: 'new workplace' });
  await parks.cancelParkChange('31');
  assert.equal(calls.at(-1).url, 'http://localhost:8000/park-change-requests/31/cancel');
  assert.equal(calls.at(-1).method, 'POST');
});

test('mock park change remains pending and cancellation preserves the approved park and route', async () => {
  // This runs after the API tests; isolate the mock account and restore the module cache.
  const savedUrl = process.env.EXPO_PUBLIC_API_URL;
  const cached = Object.entries(require.cache).filter(([key]) =>
    key.includes(`${path.sep}src${path.sep}api${path.sep}`),
  );
  for (const [key] of cached) delete require.cache[key];
  process.env.EXPO_PUBLIC_API_URL = '';
  try {
    const sessionApi = require('../src/api/mock/onboarding.ts');
    const mockApi = require('../src/api/parks.ts');
    await sessionApi.openMockSession('change-test');
    const session = sessionApi.getMockSession();
    session.park = {
      id: 'current',
      catalogId: 'hangang',
      name: 'Current park',
      status: 'approved',
      routeSetupDone: true,
    };
    session.route = { parkName: 'Current park', points: [{ id: 'keep' }], schedule: [] };
    session.profile.routeSetupDone = true;
    session.parkChanges = [];
    const parkBefore = JSON.stringify(session.park);
    const routeBefore = JSON.stringify(session.route);
    const change = await mockApi.requestParkChange('banpo', 'workplace changed');
    assert.equal(change.status, 'pending');
    await assert.rejects(mockApi.requestParkChange('banpo', 'duplicate'), { status: 409 });
    assert.equal(JSON.stringify(session.park), parkBefore);
    assert.equal(JSON.stringify(session.route), routeBefore);
    assert.equal((await mockApi.cancelParkChange(change.id)).status, 'cancelled');
    assert.equal(session.profile.routeSetupDone, true);
    assert.equal(JSON.stringify(session.park), parkBefore);
    assert.equal(JSON.stringify(session.route), routeBefore);
  } finally {
    process.env.EXPO_PUBLIC_API_URL = savedUrl;
    for (const key of Object.keys(require.cache))
      if (key.includes(`${path.sep}src${path.sep}api${path.sep}`)) delete require.cache[key];
    for (const [key, value] of cached) require.cache[key] = value;
  }
});
global.fetch = async (url, init) => {
  calls.push({ url, ...init });
  const body = typeof response === 'function' ? response(url) : response;
  return new Response(JSON.stringify(body), { status });
};

test('재신청은 별도 인증을 사용하고 수정할 수 없는 아이디를 제출하지 않는다', async () => {
  client.setAuthToken(null);
  response = { reapplicationToken: 'restricted-token', loginId: 'manager01', rejectReason: '정보 확인 필요' };
  const session = await auth.prepareReapplication({ loginId: 'manager01', password: 'password123' });
  assert.equal(calls.at(-1).url, 'http://localhost:8000/auth/reapplication-session');
  assert.equal(session.rejectReason, '정보 확인 필요');
  response = { id: '7', registrationStatus: 'pending' };
  await auth.reapply({
    reapplicationToken: session.reapplicationToken,
    name: '수정',
    password: 'newpass123',
    email: 'new@example.com',
    phone: '01012345678',
    catalogId: '1',
  });
  assert.equal(calls.at(-1).url, 'http://localhost:8000/auth/reapply');
  assert.equal(JSON.parse(calls.at(-1).body).loginId, undefined);
  assert.equal(JSON.parse(calls.at(-1).body).reapplicationToken, 'restricted-token');
  await client.request('/me');
  assert.equal(calls.at(-1).headers.Authorization, undefined);
});

test('승인 상태와 초기 설정 완료 여부에 따라 진입 화면을 결정한다', () => {
  assert.equal(auth.onboardingScreen({ role: 'manager', registrationStatus: null, routeSetupDone: false }), 'Login');
  for (const parkStatus of ['pending', 'rejected']) {
    assert.equal(
      auth.onboardingScreen({ role: 'manager', registrationStatus: parkStatus, routeSetupDone: false }),
      'Login',
    );
  }
  assert.equal(
    auth.onboardingScreen({ role: 'manager', registrationStatus: 'approved', routeSetupDone: false }),
    'Main',
  );
  assert.equal(
    auth.onboardingScreen({ role: 'manager', registrationStatus: 'approved', routeSetupDone: true }),
    'Main',
  );
  assert.equal(
    auth.onboardingScreen({ role: 'super_admin', registrationStatus: 'approved', routeSetupDone: false }),
    'Login',
  );
});

test('총관리자는 앱에서 웹 로그인 안내를 받고 토큰을 보관하지 않는다', async () => {
  status = 200;
  response = { accessToken: 'admin-token', role: 'super_admin', registrationStatus: 'approved', routeSetupDone: false };
  client.setAuthToken('previous-token');
  await assert.rejects(
    auth.login({ loginId: 'superadmin', password: 'password123' }),
    (e) => e.code === 'web_login_required' && e.message.includes('웹페이지'),
  );
  response = {};
  await client.request('/me');
  assert.equal(calls.at(-1).headers.Authorization, undefined);
});

test('공원 신청은 인증 토큰과 catalogId를 전송한다', async () => {
  client.setAuthToken('test-token');
  response = { id: '9', catalogId: '17', status: 'pending' };
  await parks.selectPark('17');
  const call = calls.at(-1);
  assert.equal(call.url, 'http://localhost:8000/park');
  assert.equal(call.method, 'PUT');
  assert.deepEqual(JSON.parse(call.body), { catalogId: '17' });
  assert.equal(call.headers.Authorization, 'Bearer test-token');
});

test('경로는 실제 서버에 저장하며 요청에는 쓰기 가능한 필드만 보낸다', async () => {
  const draft = {
    parkName: '공원',
    bounds: {},
    area: {},
    station: { latitude: 37, longitude: 127 },
    points: [{ id: 'p1', name: '정문', position: { latitude: 37, longitude: 127 } }],
    schedule: [{ id: 's1', time: '10:00', label: '매일 순찰', on: true, repeat: 'daily' }],
  };
  response = { ...draft, points: [{ ...draft.points[0], id: '12' }] };
  const saved = await routes.saveRouteConfig(draft);
  assert.equal(calls.at(-1).url, 'http://localhost:8000/route');
  assert.equal(calls.at(-1).method, 'PUT');
  assert.deepEqual(JSON.parse(calls.at(-1).body), {
    station: draft.station,
    points: draft.points,
    schedule: draft.schedule,
  });
  assert.equal(saved.points[0].id, '12');
});

test('로봇별 경로 조회와 저장은 같은 robotId를 전달한다', async () => {
  response = { robotId: '22', points: [], schedule: [] };
  await routes.getRouteConfig('22');
  assert.equal(calls.at(-1).url, 'http://localhost:8000/route?robotId=22');
  await routes.saveRouteConfig({ robotId: '22', station: null, points: [], schedule: [] });
  assert.equal(calls.at(-1).url, 'http://localhost:8000/route?robotId=22');
  assert.deepEqual(JSON.parse(calls.at(-1).body), { station: null, points: [], schedule: [] });
  response = [{ id: '22', name: '로봇 B' }];
  assert.equal((await routes.getPatrolRobots())[0].id, '22');
  assert.equal(calls.at(-1).url, 'http://localhost:8000/robots');
});

test('경로를 다시 저장할 때 선택한 분리수거장 ID를 유지한다', async () => {
  const config = {
    robotId: '22',
    catalogId: '1',
    defaultStationId: '7',
    stations: [{ id: '7', name: '남문', position: { latitude: 37.5, longitude: 127 } }],
    station: { latitude: 37.5, longitude: 127 },
    points: [],
    schedule: [],
  };
  response = config;
  await routes.saveRouteConfig(config);
  const body = JSON.parse(calls.at(-1).body);
  assert.equal(body.defaultStationId, '7');
  assert.equal(body.catalogId, '1');
  assert.equal(body.stations, undefined);
});

test('홈은 배정된 로봇의 이름과 상태를 각각 표시하고 가짜 배터리 비율을 만들지 않는다', async () => {
  const robots = require('../src/api/robot.ts');
  const list = [
    { id: '1', name: '로봇 1', status: 'working', batteryVoltage: 11.8, lastSeenAt: '2026-11-17T05:00:00Z' },
    { id: '2', name: '로봇 2', status: 'idle', batteryVoltage: null, lastSeenAt: null },
  ];
  // GET /robots → 목록, GET /robots/{id}/state → 상태 (1번은 순찰 중 2번째 지점까지 돌았어요), GET /route → 경로
  response = (url) => {
    if (url.endsWith('/robots')) return list;
    const state = url.match(/\/robots\/(\d+)\/state$/);
    if (state) {
      const r = list.find((x) => x.id === state[1]);
      return { ...r, currentTaskId: r.id === '1' ? '50' : null, processedPoints: r.id === '1' ? 1 : 0 };
    }
    return {
      points: [
        { id: 'a', name: '정문', position: { latitude: 0, longitude: 0 } },
        { id: 'b', name: '놀이터', position: { latitude: 0, longitude: 0 } },
      ],
      schedule: [],
    };
  };
  const home = await robots.getHomeRobots();
  assert.deepEqual(
    home.map((r) => [r.id, r.name, r.state]),
    [
      ['1', '로봇 1', 'patrolling'],
      ['2', '로봇 2', 'idle'],
    ],
  );
  assert.equal(home[0].battery, null);
  assert.equal(home[0].batteryVoltage, 11.8);
  assert.equal(home[1].battery, null);
  // 순찰 중인 로봇은 지점 진행과 다음 지점을 서버 상태와 저장된 경로로 보여 줘요
  assert.equal(home[0].activity, '순찰 지점 2곳 중 1곳을 돌았어요');
  assert.equal(home[0].nextPoint, '놀이터');
  assert.ok(calls.some((c) => c.url === 'http://localhost:8000/robots/1/state'));
  response = [];
  assert.deepEqual(await robots.getHomeRobots(), []);
});

test('로봇 이름 변경은 선택한 로봇 ID와 이름만 전달한다', async () => {
  response = { id: '22', name: '주비 2호' };
  assert.equal((await routes.renamePatrolRobot('22', '주비 2호')).name, '주비 2호');
  assert.equal(calls.at(-1).url, 'http://localhost:8000/robots/22');
  assert.equal(calls.at(-1).method, 'PATCH');
  assert.deepEqual(JSON.parse(calls.at(-1).body), { name: '주비 2호' });
  assert.equal((await routes.getPatrolRobot('22')).id, '22');
  assert.equal(calls.at(-1).url, 'http://localhost:8000/robots/22');
  status = 403;
  response = { code: 'forbidden', message: '변경할 수 없어요' };
  try {
    await assert.rejects(routes.renamePatrolRobot('22', '다른 이름'), { status: 403 });
  } finally {
    status = 200;
  }
});

test('저장 실패를 성공으로 처리하지 않는다', async () => {
  status = 503;
  response = { message: '잠시 후 다시 시도해 주세요', code: 'db_unavailable' };
  try {
    await assert.rejects(routes.saveRouteConfig({ station: {}, points: [], schedule: [] }), { status: 503 });
  } finally {
    status = 200;
  }
});

test('공원 조회와 경로 조회는 서버의 승인 상태와 저장된 값을 사용한다', async () => {
  response = { id: '9', catalogId: '17', status: 'approved', routeSetupDone: false };
  assert.equal((await parks.getManagedPark()).status, 'approved');
  assert.equal(calls.at(-1).url, 'http://localhost:8000/park');
  response = { parkName: '테스트 공원', points: [], schedule: [] };
  assert.equal((await routes.getRouteConfig()).parkName, '테스트 공원');
  assert.equal(calls.at(-1).url, 'http://localhost:8000/route');
});

test('신청 거절 오류는 호출자에게 전달된다', async () => {
  status = 409;
  response = { message: '총관리자에게 문의해 주세요', code: 'approved_park_change_forbidden' };
  try {
    await assert.rejects(parks.selectPark('18'), { status: 409, code: 'approved_park_change_forbidden' });
  } finally {
    status = 200;
  }
});

test('목업도 계정별 승인 대기와 설정을 보존하고 다른 계정과 섞지 않는다', async () => {
  process.env.EXPO_PUBLIC_API_URL = '';
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}src${path.sep}api${path.sep}`)) delete require.cache[key];
  }
  const mockAuth = require('../src/api/auth.ts');
  const mockParks = require('../src/api/parks.ts');
  const mockSession = require('../src/api/mock/onboarding.ts');
  const account = require('../src/api/account.ts');
  const registered = await mockAuth.signUp({
    loginId: 'newmanager',
    name: '관리자',
    email: 'test@example.com',
    catalogId: 'hangang',
  });
  assert.equal(registered.registrationStatus, 'pending');
  assert.equal((await mockParks.getManagedPark()).catalogId, 'hangang');
  await assert.rejects(mockAuth.login({ loginId: 'newmanager' }), { status: 403, code: 'registration_pending' });
  assert.equal((await account.getProfile()).parkStatus, 'pending');
  const session = mockSession.getMockSession();
  session.park.status = 'approved';
  session.profile.parkStatus = 'approved';
  session.profile.registrationStatus = 'approved';
  await mockSession.saveMockSession();
  const mockRoutes = require('../src/api/route.ts');
  await mockRoutes.saveRouteConfig({ parkName: '한강공원', station: {}, points: [], schedule: [] });
  assert.equal(mockAuth.onboardingScreen(await mockAuth.login({ loginId: 'newmanager' })), 'Main');
  assert.equal((await mockRoutes.getRouteConfig()).parkName, '한강공원');
  await mockAuth.signUp({
    loginId: 'othermanager',
    name: '다른 관리자',
    email: 'other@example.com',
    catalogId: 'banpo',
  });
  assert.equal((await mockParks.getManagedPark()).catalogId, 'banpo');
  assert.equal((await account.getProfile()).routeSetupDone, false);
  // 앱 재시작으로 메모리 중복 목록이 초기화되어도 기존 계정은 덮어쓰지 않는다.
  require('../src/api/mock/auth.ts').mockTakenLoginIds.clear();
  await assert.rejects(mockAuth.signUp({ loginId: 'newmanager', name: '덮어쓰기', email: 'new@example.com' }), {
    status: 409,
  });
  assert.equal(mockAuth.onboardingScreen(await mockAuth.login({ loginId: 'newmanager' })), 'Main');
});

test('목업 재신청도 기존 정보를 고치고 승인 대기로 돌아간다', async () => {
  const mockAuth = require('../src/api/auth.ts');
  const sessions = require('../src/api/mock/onboarding.ts');
  const session = await sessions.openMockSession('newmanager');
  session.profile.registrationStatus = session.profile.parkStatus = 'rejected';
  session.park.status = 'rejected';
  session.park.rejectReason = '담당자 정보 확인';
  await sessions.saveMockSession();
  const info = await mockAuth.prepareReapplication({ loginId: 'newmanager', password: 'test1234' });
  assert.equal(info.name, session.profile.name);
  assert.equal(info.rejectReason, '담당자 정보 확인');
  assert.equal(JSON.stringify([...storage.values()]).includes(info.reapplicationToken), false);
  const body = {
    reapplicationToken: info.reapplicationToken,
    password: 'newpass123',
    name: '수정한 이름',
    email: 'changed@example.com',
    phone: '01011112222',
    catalogId: 'banpo',
  };
  assert.equal((await mockAuth.reapply(body)).registrationStatus, 'pending');
  assert.equal(sessions.getMockSession().profile.name, '수정한 이름');
  assert.equal(sessions.getMockSession().park.catalogId, 'banpo');
  assert.equal(sessions.getMockSession().park.rejectReason, null);
  await assert.rejects(mockAuth.reapply(body), { code: 'registration_not_rejected' });
  await assert.rejects(mockAuth.login({ loginId: 'newmanager', password: 'newpass123' }), {
    code: 'registration_pending',
  });
});

test('두 로봇의 목업 경로와 이름도 서로 섞이지 않는다', async () => {
  const mockSession = require('../src/api/mock/onboarding.ts');
  const mockRoutes = require('../src/api/route.ts');
  const session = mockSession.getMockSession();
  session.robots = [
    { id: '1', name: '로봇1' },
    { id: '2', name: '로봇2' },
  ];
  const base = { parkName: '공원', station: { latitude: 37.5, longitude: 127 }, schedule: [] };
  session.route = { ...base, points: [{ id: 'legacy', name: '기존 지점' }] };
  session.robotRoutes = undefined;
  assert.equal((await mockRoutes.getRouteConfig('1')).points[0]?.name, '기존 지점');
  await mockRoutes.saveRouteConfig({ ...base, robotId: '1', points: [{ id: 'a', name: 'A' }] });
  assert.deepEqual((await mockRoutes.getRouteConfig('2')).points, []);
  await mockRoutes.saveRouteConfig({ ...base, robotId: '2', points: [{ id: 'b', name: 'B' }] });
  assert.equal((await mockRoutes.getRouteConfig('1')).points[0].name, 'A');
  assert.equal((await mockRoutes.getRouteConfig('2')).points[0].name, 'B');
  await mockRoutes.renamePatrolRobot('1', '  주비1  ');
  assert.equal((await mockRoutes.getPatrolRobot('1')).name, '주비1');
  assert.equal((await mockRoutes.getPatrolRobot('2')).name, '로봇2');
});

test('취소한 로그인 응답은 기존 인증 토큰을 덮어쓰지 않는다', async () => {
  const controller = new AbortController();
  let finish;
  const normalFetch = global.fetch;
  global.fetch = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  client.setAuthToken('current-session');
  const pending = auth.login({ loginId: 'abandoned', password: 'test1234' }, controller.signal);
  controller.abort();
  finish(new Response(JSON.stringify({ accessToken: 'abandoned-session' }), { status: 200 }));
  try {
    await assert.rejects(pending);
    global.fetch = normalFetch;
    response = {};
    await client.request('/me');
    assert.equal(calls.at(-1).headers.Authorization, 'Bearer current-session');
  } finally {
    global.fetch = normalFetch;
  }
});
