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
const { RobotTokenButton } = require('../src/components/RobotTokenButton.tsx');

test('토큰이 발급된 로봇에는 발급 버튼을 표시하지 않는다', () => {
  const html = renderToStaticMarkup(
    React.createElement(RobotTokenButton, {
      tokenIssuedAt: '2026-11-23T06:00:00Z',
      disabled: false,
      onIssue() {},
    }),
  );
  assert.equal(html, '');
});

test('토큰이 없는 로봇에는 첫 발급 버튼을 표시한다', () => {
  const html = renderToStaticMarkup(
    React.createElement(RobotTokenButton, {
      tokenIssuedAt: null,
      disabled: false,
      onIssue() {},
    }),
  );
  assert.match(html, />토큰 발급<\/button>/);
  assert.ok(!html.includes('disabled'));
});

test('처리 중에는 토큰 발급 버튼을 비활성화한다', () => {
  const html = renderToStaticMarkup(
    React.createElement(RobotTokenButton, {
      tokenIssuedAt: null,
      disabled: true,
      onIssue() {},
    }),
  );
  assert.match(html, /disabled=""/);
});

test('발급 여부를 모르는 이전 API 응답에는 버튼을 표시하지 않는다', () => {
  const html = renderToStaticMarkup(
    React.createElement(RobotTokenButton, {
      disabled: false,
      onIssue() {},
    }),
  );
  assert.equal(html, '');
});
