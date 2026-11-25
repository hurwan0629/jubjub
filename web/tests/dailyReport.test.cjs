const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

require.extensions['.tsx'] = (mod, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  mod._compile(result.outputText, filename);
};

test('보고 차트는 수거가 없는 날에도 유효한 수치와 빈 상태를 표시한다', () => {
  const { DailyReportView } = require('../src/components/DailyReportView.tsx');
  const html = renderToStaticMarkup(
    React.createElement(DailyReportView, {
      report: {
        id: '1',
        date: '2026-11-17',
        summary: '<script>bad</script>',
        pickups: 0,
        stationVisits: 0,
        patrolsDone: 0,
        patrolsPlanned: 0,
        materials: [{ material: '캔', count: 0 }],
        hourly: [{ hour: '09', count: 0 }],
        insights: [],
        events: [],
        createdAt: '2026-11-17T07:00:00Z',
      },
    }),
  );
  assert.ok(!html.includes('NaN'));
  assert.ok(!html.includes('Infinity'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('수거 기록이 없어요'));
  assert.ok(html.includes('기록된 이벤트가 없어요'));
});
