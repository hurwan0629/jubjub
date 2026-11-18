const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => {
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } })
      .outputText,
    filename,
  );
};
test('페이지 이동은 마지막 항목을 포함하고 데이터 감소 및 빈 목록을 보정한다', () => {
  const { paginate } = require('../src/components/pageData.ts');
  const rows = Array.from({ length: 21 }, (_, i) => i);
  assert.deepEqual(paginate(rows, 3).items, [20]);
  assert.equal(paginate(rows.slice(0, 10), 3).page, 1);
  assert.deepEqual(paginate([], 8), { items: [], page: 1, pages: 1, total: 0 });
  assert.deepEqual(paginate(rows, 0).items, rows.slice(0, 10));
});
