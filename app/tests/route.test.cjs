/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');

const ts = require('typescript');

// Expo 별칭(@/)만 바꿔 실제 경로 계산 모듈을 실행한다.
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return originalResolve.call(this, name, ...args);
};
require.extensions['.ts'] = (mod, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  mod._compile(result.outputText, filename);
};

const route = require('../src/utils/route.ts');

const station = { latitude: 37.55, longitude: 127.08 };
const a = { id: 'a', name: 'A', position: { latitude: 37.551, longitude: 127.08 } };
const b = { id: 'b', name: 'B', position: { latitude: 37.552, longitude: 127.081 } };

test('한 바퀴는 분리수거장에서 출발해 지점을 순서대로 돌고 분리수거장으로 돌아온다', () => {
  assert.deepEqual(route.loopPath([a, b], station), [station, a.position, b.position, station]);
});

test('분리수거장이 없으면 처음 지점으로 돌아온다', () => {
  assert.deepEqual(route.loopPath([a, b], null), [a.position, b.position, a.position]);
  assert.deepEqual(route.loopPath([], station), []);
});

test('기존 지점에서 1km 넘게 떨어진 곳은 막고, 1km 안은 허용한다', () => {
  // 위도 0.009도 ≈ 1.0km, 0.01도 ≈ 1.1km
  const near = { latitude: station.latitude + 0.008, longitude: station.longitude };
  const far = { latitude: station.latitude + 0.01, longitude: station.longitude };
  assert.equal(route.isTooFar(near, [station]), false);
  assert.equal(route.isTooFar(far, [station]), true);
  // 가장 가까운 지점 기준: 먼 지점이 하나 있어도 가까운 지점이 1km 안이면 허용
  assert.equal(route.isTooFar(far, [station, { latitude: far.latitude - 0.001, longitude: far.longitude }]), false);
});

test('아직 찍은 지점이 없으면 거리 제한을 두지 않는다', () => {
  assert.equal(route.isTooFar(station, []), false);
});
