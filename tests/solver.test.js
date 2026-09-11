import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileFormulas } from '../src/engine/compile.js';
import { solveJoint, solveLinearSystem, solveSingle } from '../src/engine/solver.js';
import { CALIBRATION } from '../src/engine/model.js';
import { demo, formulasWith, relClose } from './helpers.js';

test('示範情境：獨立求解流程找回校準點（不提供參考價格）', () => {
  const { model, values } = demo();
  const r = solveJoint(model, values, { refPrices: null });
  assert.equal(r.status, 'valid');
  assert.equal(r.method, 'linear');
  for (const [id, p] of Object.entries(CALIBRATION.prices)) assert.ok(relClose(r.P[id], p, 1e-8), `${id}=${r.P[id]}`);
  for (const [m, q] of Object.entries(CALIBRATION.quantities)) assert.ok(relClose(r.Q[m], q, 1e-8), `Q_${m}=${r.Q[m]}`);
  for (const res of Object.values(r.residuals)) assert.ok(res <= 1e-9);
  assert.ok(r.cond < 1e10);
});

test('示範情境：以參考價格尺度化時殘差合格', () => {
  const { model, values } = demo();
  const r = solveJoint(model, values, { refPrices: CALIBRATION.prices });
  assert.equal(r.status, 'valid');
  assert.ok(relClose(r.P.P_C, 0.4, 1e-10));
});

test('線性系統：無解、無唯一解、病態', () => {
  assert.equal(solveLinearSystem([[1, 2, 3], [2, 4, 6], [1, 0, 1]], [1, 3, 1]).status, 'no_solution');
  assert.equal(solveLinearSystem([[1, 2, 3], [2, 4, 6], [1, 0, 1]], [1, 2, 1]).status, 'non_unique');
  assert.equal(solveLinearSystem([[0, 0, 0], [0, 1, 0], [0, 0, 1]], [0, 1, 1]).status, 'non_unique');
  const ill = solveLinearSystem([[1, 1, 0], [1, 1 + 1e-11, 0], [0, 0, 1]], [2, 2, 1]);
  assert.equal(ill.status, 'ill_conditioned');
  const ok = solveLinearSystem([[2, 1, 0], [1, 3, 1], [0, 1, 4]], [3, 5, 5]);
  assert.equal(ok.status, 'ok');
  ok.x.forEach((v) => assert.ok(Math.abs(v - 1) < 1e-12));
});

test('奇異聯立式：硬體價格項全為 0 → 無解', () => {
  const { model, values } = demo();
  const r = solveJoint(model, { ...values, b_H: 0, d_H: 0, k_HC: 0 }, { refPrices: CALIBRATION.prices });
  assert.equal(r.status, 'no_solution');
  assert.equal(r.P, undefined, '不得產生偽造均衡');
});

test('奇異聯立式：供需恆等 → 無唯一解', () => {
  const { values } = demo();
  const model = compileFormulas(formulasWith({ Q_H_D: 'A_H_S + b_H*P_H - k_Hc*c/h + k_Hy*y - k_Hr_S*r + k_HN*N' }));
  const r = solveJoint(model, values, { refPrices: CALIBRATION.prices });
  assert.equal(r.status, 'non_unique');
});

test('負價格 → 不在適用範圍，不截斷', () => {
  const { model, values } = demo();
  const r = solveJoint(model, { ...values, A_H_D: -1e9 }, { refPrices: CALIBRATION.prices });
  assert.equal(r.status, 'out_of_range');
  assert.ok(r.P.P_H < 0, '保留實際負值');
  assert.ok(r.violations.some((v) => v.id === 'P_H'));
});

test('負分群需求 → 不在適用範圍', () => {
  const { model, values } = demo();
  const r = solveJoint(model, { ...values, A_G: values.A_G - 5e10 }, { refPrices: CALIBRATION.prices });
  assert.equal(r.status, 'out_of_range');
  assert.ok(r.violations.some((v) => v.id === 'Q_G_D'));
  assert.ok(r.P.P_A > 0);
});

test('非線性公式使用 Newton 法', () => {
  const { values } = demo();
  const model = compileFormulas(formulasWith({ Q_H_S: 'A_H_S + b_H*P_H^2/9000 - k_Hc*c/h + k_Hy*y - k_Hr_S*r + k_HN*N' }));
  const r = solveJoint(model, values, { refPrices: CALIBRATION.prices });
  assert.equal(r.method, 'newton');
  assert.equal(r.status, 'valid');
  assert.ok(relClose(r.P.P_H, 9000, 1e-6));
});

test('非線性且無解 → 找不到解，不沿用舊解', () => {
  const { values } = demo();
  const model = compileFormulas(formulasWith({ Q_H_S: 'Q_H_D + 1e9 + exp(P_H/9000)' }));
  const r = solveJoint(model, values, { refPrices: CALIBRATION.prices, maxIter: 50 });
  assert.equal(r.status, 'not_found');
  assert.equal(r.P, undefined);
});

test('單市場模式：其他兩價固定', () => {
  const { model, values } = demo();
  const fixed = { ...CALIBRATION.prices };
  const base = solveSingle(model, values, 'H', fixed, { refPrices: fixed });
  assert.equal(base.status, 'valid');
  assert.equal(base.mode, 'single');
  assert.ok(relClose(base.P.P_H, 9000, 1e-9));

  const shifted = solveSingle(model, { ...values, A_H_D: values.A_H_D + 1e8 }, 'H', fixed, { refPrices: fixed });
  assert.equal(shifted.status, 'valid');
  assert.ok(shifted.P.P_H > 9000);
  assert.equal(shifted.P.P_C, fixed.P_C);
  assert.equal(shifted.P.P_A, fixed.P_A);
  assert.deepEqual(Object.keys(shifted.Q), ['H']);

  const flat = solveSingle(model, { ...values, b_H: 0, d_H: 0 }, 'H', fixed, { refPrices: fixed });
  assert.equal(flat.status, 'no_solution');
});

test('單市場模式：非線性公式', () => {
  const { values } = demo();
  const model = compileFormulas(formulasWith({ Q_C_S: 'A_C_S + b_C*P_C^2/0.4 - k_CH*P_H - k_Cr_S*r - k_Ce*c_elec - k_CB*B + k_CM*M + k_CK*K_C' }));
  const r = solveSingle(model, values, 'C', { ...CALIBRATION.prices }, { refPrices: CALIBRATION.prices });
  assert.equal(r.status, 'valid');
  assert.ok(relClose(r.P.P_C, 0.4, 1e-6));
});
