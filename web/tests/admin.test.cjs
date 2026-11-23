const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  mod._compile(result.outputText, filename);
};
const client = require('../src/api/client.ts');
const admin = require('../src/api/admin.ts');
const auth = require('../src/api/auth.ts');
client.configureApi('http://localhost:8000');
const calls = [];
let response = {};
let status = 200;
global.fetch = async (url, init) => {
  calls.push({ url, ...init });
  return new Response(JSON.stringify(response), { status });
};

test('로봇 토큰 재발급과 순찰 제어는 실제 API를 호출한다', async () => {
  response = { robotId: '7', authToken: 'new-token' };
  assert.equal((await admin.rotateRobotToken('7')).authToken, 'new-token');
  assert.equal(calls.at(-1).url, 'http://localhost:8000/admin/robots/7/token');
  assert.equal(calls.at(-1).method, 'POST');
  await admin.startPatrol('7');
  assert.equal(calls.at(-1).url, 'http://localhost:8000/robots/7/patrol/start');
});

test('총관리자 웹은 하위관리자 로그인을 거부하고 토큰을 보관하지 않는다', async () => {
  response = { accessToken: 'manager-token', role: 'manager' };
  await assert.rejects(
    auth.login({ loginId: 'manager', password: 'password123' }),
    (e) => e.code === 'app_login_required',
  );
  response = {};
  await client.request('/me');
  assert.equal(calls.at(-1).headers.Authorization, undefined);
});

test('총관리자 웹 로그인은 독립 세션 토큰을 후속 요청에 첨부한다', async () => {
  response = { accessToken: 'web-admin', role: 'super_admin' };
  await auth.login({ loginId: 'admin', password: 'password123' });
  response = {};
  await client.request('/me');
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer web-admin');
  auth.logout();
});
test('총관리자 전체 신청 목록은 pending 기본값에 의존하지 않고 모든 페이지를 조회한다', async () => {
  const normalFetch = global.fetch;
  const urls = [];
  global.fetch = async (url) => {
    urls.push(url);
    return new Response(
      JSON.stringify(
        urls.length === 1 ? Array.from({ length: 100 }, (_, i) => ({ userId: `${i}` })) : [{ userId: '100' }],
      ),
    );
  };
  try {
    const rows = await admin.getRegistrations();
    assert.equal(rows.length, 101);
    assert.match(urls[0], /status=all/);
    assert.match(urls[1], /offset=100/);
  } finally {
    global.fetch = normalFetch;
  }
});

test('총관리자 승인은 사용자 ID와 선택한 로봇 ID 및 인증 토큰을 전송한다', async () => {
  status = 200;
  response = {};
  client.setAuthToken('admin-session');
  await admin.approveRegistration('42', ['3', '7']);
  assert.equal(calls.at(-1).url, 'http://localhost:8000/admin/registrations/42/approve');
  assert.deepEqual(JSON.parse(calls.at(-1).body), { robotIds: ['3', '7'] });
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer admin-session');
});

test('총관리자 목록은 10,100개 이상이어도 마지막 짧은 페이지까지 조회한다', async () => {
  const normalFetch = global.fetch;
  let pages = 0;
  global.fetch = async () =>
    new Response(JSON.stringify(++pages <= 101 ? Array.from({ length: 100 }, () => ({ userId: 'test' })) : []));
  try {
    assert.equal((await admin.getRegistrations()).length, 10100);
    assert.equal(pages, 102);
  } finally {
    global.fetch = normalFetch;
  }
});

test('반려·승인 취소 사유를 전송하고 서버 실패를 성공으로 바꾸지 않는다', async () => {
  response = {};
  status = 200;
  await admin.rejectRegistration('42', '담당자 확인 필요');
  assert.deepEqual(JSON.parse(calls.at(-1).body), { reason: '담당자 확인 필요' });
  assert.match(calls.at(-1).url, /42\/reject$/);
  await admin.revokeRegistration('42', '운영 담당자 변경');
  assert.match(calls.at(-1).url, /42\/revoke$/);
  status = 409;
  response = { code: 'park_request_not_pending', message: '이미 처리된 신청이에요' };
  try {
    await assert.rejects(admin.approveRegistration('42', []), (e) => e.code === response.code);
  } finally {
    status = 200;
    response = {};
  }
});

test('admin operations use real paginated endpoints and preserve mutation errors', async () => {
  response = [];
  status = 200;
  const signal = new AbortController().signal;
  await admin.getAdminParks(signal);
  assert.match(calls.at(-1).url, /admin\/parks\?limit=100&offset=0$/);
  assert.equal(calls.at(-1).signal, signal);
  await admin.getParkChanges(signal);
  assert.match(calls.at(-1).url, /park-change-requests\?status=all&limit=100&offset=0$/);
  await admin.getParkReports('park/a', '2026-11-17', signal);
  assert.match(calls.at(-1).url, /parks\/park%2Fa\/reports\?date=2026-11-17$/);
  await admin.getParkReports('park/a', '2026-11-17', signal, 'catalog/a');
  assert.match(calls.at(-1).url, /date=2026-11-17&catalogId=catalog%2Fa$/);
  response = {};
  await admin.createAdminRobot('Jubi', 'SN-01');
  assert.deepEqual(JSON.parse(calls.at(-1).body), { name: 'Jubi', serialNo: 'SN-01' });
  await admin.assignRobot('robot/a', null);
  assert.equal(calls.at(-1).method, 'PATCH');
  assert.deepEqual(JSON.parse(calls.at(-1).body), { parkId: null });
  await admin.approveParkChange('change/a');
  assert.match(calls.at(-1).url, /change%2Fa\/approve$/);
  await admin.rejectParkChange('1', '중복 담당');
  assert.deepEqual(JSON.parse(calls.at(-1).body), { reason: '중복 담당' });
  status = 409;
  response = { message: '작업 중', code: 'robot_busy' };
  try {
    await assert.rejects(admin.assignRobot('1', '2'), (e) => e.code === 'robot_busy');
  } finally {
    status = 200;
    response = {};
  }
});
