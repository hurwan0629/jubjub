const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
require.extensions['.tsx'] = (mod, filename) => {
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    filename,
  );
};
const { ParkChangeDetailDialog } = require('../src/components/ParkChangeDetailDialog.tsx');
const props = {
  request: {
    applicantName: '김주비',
    applicantLoginId: 'jubi2026',
    parkId: 'park1',
    currentParkName: '여의도한강공원',
    requestedParkName: '난지한강공원',
    reason: '이사해서 가까워졌어요.',
    createdAt: '2026-11-16T00:00:00Z',
    conflictingManagerName: null,
  },
  robots: [
    { parkId: 'park1', name: 'JUBI-01' },
    { parkId: 'park2', name: 'OTHER' },
  ],
  robotsLoading: false,
  robotsError: '',
  busy: false,
  error: '',
  onClose() {},
  onReject() {},
  onApprove() {},
};
test('공원 변경 상세는 해당 공원의 로봇 이동과 요청 정보 및 세 가지 동작을 표시한다', () => {
  const html = renderToStaticMarkup(React.createElement(ParkChangeDetailDialog, props));
  for (const text of [
    '김주비 관리자의 공원 변경 요청',
    '여의도한강공원',
    '난지한강공원',
    'JUBI-01 함께 이동',
    '요청 사유',
    '취소',
    '반려',
    '승인하기',
  ])
    assert.ok(html.includes(text), text);
  assert.ok(!html.includes('OTHER'));
});
test('중복 담당자가 있으면 승인할 수 없고 담당자 정보를 표시한다', () => {
  const html = renderToStaticMarkup(
    React.createElement(ParkChangeDetailDialog, {
      ...props,
      request: { ...props.request, conflictingManagerName: '기존 담당자' },
    }),
  );
  assert.match(html, /disabled="">승인하기/);
  assert.ok(html.includes('담당 관리자 기존 담당자'));
});
