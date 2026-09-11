import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileFormulas } from '../src/engine/compile.js';
import { DEFAULT_FORMULAS } from '../src/engine/model.js';

const withExpr = (id, expr) => DEFAULT_FORMULAS.map((f) => (f.id === id ? { id, expr } : { ...f }));

test('預設公式可編譯並正確排序衍生式', () => {
  const m = compileFormulas(DEFAULT_FORMULAS);
  assert.equal(m.ok, true);
  assert.ok(m.order.indexOf('c_elec') < m.order.indexOf('Q_C_S'));
  for (const seg of ['Q_E_D', 'Q_U_D', 'Q_G_D']) assert.ok(m.order.indexOf(seg) < m.order.indexOf('Q_A_D'));
});

test('未知符號指出公式與位置', () => {
  const expr = 'A_H_D - d_H*P_H + foo';
  const m = compileFormulas(withExpr('Q_H_D', expr));
  assert.equal(m.ok, false);
  const e = m.errors.find((x) => x.code === 'unknown_symbol');
  assert.equal(e.formulaId, 'Q_H_D');
  assert.equal(e.start, expr.indexOf('foo'));
});

test('循環衍生式', () => {
  const m = compileFormulas(withExpr('Q_E_D', 'Q_A_D - Q_U_D - Q_G_D'));
  assert.equal(m.ok, false);
  const e = m.errors.find((x) => x.code === 'cycle');
  assert.ok(e, '應偵測循環');
  assert.match(e.message, /Q_A_D/);
  assert.match(e.message, /Q_E_D/);
});

test('缺少必要公式、重新定義因素', () => {
  const missing = compileFormulas(DEFAULT_FORMULAS.filter((f) => f.id !== 'Q_A_S'));
  assert.ok(missing.errors.some((e) => e.code === 'missing' && e.formulaId === 'Q_A_S'));
  const redefine = compileFormulas([...DEFAULT_FORMULAS, { id: 'r', expr: '5' }]);
  assert.ok(redefine.errors.some((e) => e.code === 'redefine'));
});

test('語法錯誤帶公式 id', () => {
  const m = compileFormulas(withExpr('Q_C_D', 'A_C_D - * d_C'));
  assert.equal(m.errors[0].code, 'syntax');
  assert.equal(m.errors[0].formulaId, 'Q_C_D');
});
