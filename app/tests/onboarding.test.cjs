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
const routes = require('../src/api/route.ts');
const calls = [];
let response = {};
let status = 200;
global.fetch = async (url, init) => {
  calls.push({ url, ...init });
  return new Response(JSON.stringify(response), { status });
};

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
    'RouteSetup',
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
