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
const { DecisionDialog } = require('../src/components/DecisionDialog.tsx');

test('중복 공원의 가입 승인에는 기존 담당자와 승인 불가 사유를 표시한다', () => {
  const html = renderToStaticMarkup(
    React.createElement(DecisionDialog, {
      target: {
        action: 'approve',
        registration: {
          applicantName: '신청자',
          applicantLoginId: 'newuser',
          name: '공원',
          canApprove: false,
          approvalBlockReason: '기존 담당자(owner01)가 이미 승인되어 있어요',
        },
      },
      robots: [],
      busy: false,
      onClose() {},
      onSubmit: async () => true,
    }),
  );
  assert.ok(html.includes('owner01'));
  assert.match(html, /disabled="">가입 승인/);
});

test('공원 충돌이 없는 가입은 로봇을 선택하지 않아도 승인할 수 있다', () => {
  const html = renderToStaticMarkup(
    React.createElement(DecisionDialog, {
      target: {
        action: 'approve',
        registration: { applicantName: '신청자', applicantLoginId: 'newuser', name: '공원', canApprove: true },
      },
      robots: [],
      busy: false,
      onClose() {},
      onSubmit: async () => true,
    }),
  );
  assert.ok(!/disabled="">가입 승인/.test(html));
});
