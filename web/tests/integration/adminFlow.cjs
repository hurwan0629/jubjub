/* global __dirname */
// 독립 앱·웹 API 모듈 → HTTP → FastAPI → 격리 DB 전체를 검증해요.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const ts = require('typescript');

assert.ok(process.env.JUBJUB_INTEGRATION_URL, '격리 서버를 띄우는 server pytest에서 실행하세요');
process.env.EXPO_PUBLIC_API_URL = process.env.JUBJUB_INTEGRATION_URL;
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  if (name.startsWith('@/')) name = path.join(__dirname, '../../../app/src', name.slice(2));
  return originalResolve.call(this, name, ...args);
};
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === '@react-native-async-storage/async-storage') {
    // 서버 연결 모드에서는 이 목업 전용 저장소에 접근하면 테스트가 실패해요.
    return new Proxy(
      {},
      {
        get(_, key) {
          if (key === '__esModule') return false;
          throw new Error('실제 API 검증 중 목업 저장소 사용');
        },
      },
    );
  }
  return originalLoad.call(this, name, ...args);
};
require.extensions['.ts'] = (mod, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  mod._compile(output.outputText, filename);
};
const account = require('../../../app/src/api/account.ts');
const admin = require('../../src/api/admin.ts');
const auth = require('../../../app/src/api/auth.ts');
const webAuth = require('../../src/api/auth.ts');
const client = require('../../src/api/client.ts');
const mobileClient = require('../../../app/src/api/client.ts');
const parks = require('../../../app/src/api/parks.ts');
const routes = require('../../../app/src/api/route.ts');
client.configureApi(process.env.JUBJUB_INTEGRATION_URL);
const manager = { loginId: 'flowmanager', password: 'testPassword123' };
const superadmin = { loginId: 'superadmin', password: 'password123' };

async function run() {
  const search = await parks.searchParks('테스트');
  const catalog = search[0];
  assert.ok(catalog);
  const created = await auth.signUp({
    ...manager,
    name: '흐름 검증',
    email: 'flow@example.com',
    phone: '01012345678',
    catalogId: catalog.id,
  });
  assert.equal(created.registrationStatus, 'pending');
  await assert.rejects(auth.login(manager), (e) => e.code === 'registration_pending');
  console.log('PASS 가입 신청 / 승인 전 로그인 차단');

  await assert.rejects(auth.login(superadmin), (e) => e.code === 'web_login_required');
  const superSession = await webAuth.login(superadmin);
  assert.equal(superSession.role, 'super_admin');
  let rows = await admin.getRegistrations();
  assert.equal(rows.find((r) => r.userId === created.id).applicantEmail, 'flow@example.com');
  const robot = await client.request('/admin/robots', {
    method: 'POST',
    body: JSON.stringify({ name: 'FLOW-JUBI', serialNo: 'flow-robot' }),
  });
  await admin.approveRegistration(created.id, [robot.id]);
  rows = await admin.getRegistrations();
  assert.equal(rows.find((r) => r.userId === created.id).registrationStatus, 'approved');
  assert.equal((await admin.getAdminRobots()).find((r) => r.id === robot.id).parkId, rows[0].id);
  console.log('PASS 총관리자 실제 목록 조회 / 승인 / 로봇 배정');

  const session = await auth.login(manager);
  assert.equal(auth.onboardingScreen(session), 'RouteSetup');
  const park = await parks.getManagedPark();
  assert.equal(park.catalogId, catalog.id);
  await assert.rejects(webAuth.login(manager), (e) => e.code === 'app_login_required');
  client.setAuthToken(session.accessToken);
  await assert.rejects(admin.getRegistrations(), (e) => e.status === 403);
  await webAuth.login(superadmin);
  const config = {
    parkName: park.name,
    bounds: park.bounds,
    area: park.area,
    station: { latitude: 37, longitude: 127 },
    points: [
      { id: 'temp1', name: '정문', position: { latitude: 37.0001, longitude: 127 } },
      { id: 'temp2', name: '분수대', position: { latitude: 37.0002, longitude: 127.0001 } },
    ],
    schedule: [{ id: 'temp', time: '10:00', label: '매일 순찰', on: true, repeat: 'daily' }],
  };
  await routes.saveRouteConfig(config);
  await account.logout();
  const again = await auth.login(manager);
  assert.equal(auth.onboardingScreen(again), 'Main');
  assert.equal((await account.getProfile()).routeSetupDone, true);
  const saved = await routes.getRouteConfig();
  assert.deepEqual(saved.station, config.station);
  assert.deepEqual(
    saved.points.map((p) => ({ name: p.name, position: p.position })),
    config.points.map((p) => ({ name: p.name, position: p.position })),
  );
  assert.equal(saved.schedule[0].time, '10:00');
  console.log('PASS 승인 후 로그인 / 순찰 경로·시간표 저장 / 로그아웃·재로그인 / 저장값 재조회');

  await account.logout();
  const rejected = await auth.signUp({
    ...manager,
    loginId: 'flowrejected',
    name: '반려 검증',
    email: 'rejected@example.com',
    phone: '01099999999',
    catalogId: catalog.id,
  });
  await webAuth.login(superadmin);
  await assert.rejects(admin.approveRegistration(rejected.id, []), (e) => e.status === 409);
  await assert.rejects(admin.rejectRegistration(rejected.id, '   '), (e) => e.status === 422);
  await admin.rejectRegistration(rejected.id, '담당 공원을 다시 확인해 주세요');
  const rejectedRow = (await admin.getRegistrations()).find((r) => r.userId === rejected.id);
  assert.equal(rejectedRow.registrationStatus, 'rejected');
  assert.equal(rejectedRow.rejectReason, '담당 공원을 다시 확인해 주세요');
  await account.logout();
  await assert.rejects(
    auth.login({ loginId: 'flowrejected', password: manager.password }),
    (e) => e.code === 'registration_rejected',
  );
  console.log('PASS 중복 공원 승인 거부 / 빈 반려 사유 거부 / 반려 사유 저장 / 반려 후 로그인 차단');

  await webAuth.login(superadmin);
  await admin.revokeRegistration(created.id, '운영 담당자 변경');
  assert.equal((await admin.getAdminRobots()).find((r) => r.id === robot.id).parkId, null);
  mobileClient.setAuthToken(again.accessToken);
  await assert.rejects(account.getProfile(), (e) => e.status === 403);
  console.log('PASS 승인 취소 / 로봇 회수 / 기존 관리자 토큰 차단');
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
