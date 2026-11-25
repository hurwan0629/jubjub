/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const ts = require('typescript');

function loadLayers() {
  const filename = path.join(__dirname, '../src/components/webMapLayers.ts');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  vm.runInNewContext(output.outputText, {
    exports,
    document: {},
    require: () => ({ colors: { brand: 'blue', card: 'white', done: 'green', error: 'red' } }),
  });
  return exports;
}

test('웹 지도는 공원 경계의 구멍과 경로를 실제 좌표로 그린다', () => {
  const calls = [];
  const layer = {
    addTo() {
      return this;
    },
  };
  const lib = {
    polygon: (coords) => {
      calls.push(['polygon', coords]);
      return layer;
    },
    polyline: (coords) => {
      calls.push(['route', coords]);
      return layer;
    },
  };
  const p = { latitude: 37.5, longitude: 127.1 };
  loadLayers().drawParkOverlays(lib, {}, { area: { outer: [p, p, p], holes: [[p, p, p]] }, route: [p, p] });
  assert.equal(calls[0][1].length, 2);
  assert.equal(JSON.stringify(calls[1][1]), '[[37.5,127.1],[37.5,127.1]]');
});

test('지도 마커는 표시 문자열을 HTML로 해석하지 않고 클릭한 ID를 전달한다', () => {
  let tooltip;
  let click;
  let selected;
  const marker = {
    addTo() {
      return this;
    },
    bindTooltip(value) {
      tooltip = value;
      return this;
    },
    on(_, fn) {
      click = fn;
      return this;
    },
  };
  const lib = { circleMarker: () => marker };
  const text = '<img src=x onerror=alert(1)>';
  const document = { createElement: () => ({ textContent: '' }) };
  loadLayers().drawParkOverlays(
    lib,
    {},
    {
      markers: [{ id: 'park-1', kind: 'point', label: text, position: { latitude: 37, longitude: 127 } }],
      onMarkerPress: (id) => {
        selected = id;
      },
    },
    document,
  );
  assert.equal(tooltip.textContent, text);
  click();
  assert.equal(selected, 'park-1');
});
