import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveJoint, solveLinearSystem, solveSingle } from '../src/engine/solver.js';
import { compileFormulas } from '../src/engine/compile.js';
import { BASELINE_EQUILIBRIUM, MARKET_FORMULAS, DERIVATIONS } from '../src/engine/model.js';
import { baseline, relClose } from './helpers.js';

const REF = BASELINE_EQUILIBRIUM.P;

/** 以替換後的市場式建立模型（父層維持直接輸入）。 */
function modelWith(patch) {
  const formulas = [
    ...DERIVATIONS.filter((d) => !d.target).map(({ id, expr }) => ({ id, expr })),
    ...MARKET_FORMULAS.map((f) => ({ id: f.id, expr: patch[f.id] ?? f.expr })),
  ];
  return compileFormulas(formulas);
}

test('獨立求解流程找回 2027 基準均衡（不提供參考價格）', () => {
  const { model, values } = baseline();
  const r = solveJoint(model, values, { refPrices: null });
  assert.equal(r.status, 'valid');
  assert.equal(r.method, 'linear');
  for (const [id, want] of Object.entries(REF)) assert.ok(relClose(r.P[id], want, 1e-8), `${id}=${r.P[id]}`);
  assert.ok(relClose(r.Q.C, 8000000000, 1e-8));
  assert.ok(r.cond < 1e10);
});

test('閉式解與三元聯立解交叉驗證（Appendix §2）', () => {
  const { model, values } = baseline();
  const env = model.evaluate(values, REF);
  const a = values.a;
  const H = env.H_d - env.H_s;
  const D = 1.4e9 / 3 + 1e10 * a * a;
  const pC = (env.C_d - env.C_s + (4000 / 3) * H + (a / 2) * (env.A_d + env.A_s)) / D;
  const pH = (H + 100000 * pC) / 10;
  const pA = (env.A_d - env.A_s + 2e10 * a * pC) / 4e10;
  const r = solveJoint(model, values, { refPrices: REF });
  assert.ok(relClose(r.P.P_C, pC, 1e-9));
  assert.ok(relClose(r.P.P_H, pH, 1e-9));
  assert.ok(relClose(r.P.P_A, pA, 1e-9));
});

test('線性系統：無解、無唯一解、病態', () => {
  assert.equal(solveLinearSystem([[1, 2, 3], [2, 4, 6], [1, 0, 1]], [1, 3, 1]).status, 'no_solution');
  assert.equal(solveLinearSystem([[1, 2, 3], [2, 4, 6], [1, 0, 1]], [1, 2, 1]).status, 'non_unique');
  assert.equal(solveLinearSystem([[1, 1, 0], [1, 1 + 1e-11, 0], [0, 0, 1]], [2, 2, 1]).status, 'ill_conditioned');
  const ok = solveLinearSystem([[2, 1, 0], [1, 3, 1], [0, 1, 4]], [3, 5, 5]);
  assert.equal(ok.status, 'ok');
  ok.x.forEach((v) => assert.ok(Math.abs(v - 1) < 1e-12));
});

test('奇異聯立式：硬體價格項全為 0 → 無解，不產生偽造均衡', () => {
  const { model, values } = baseline();
  const r = solveJoint(model, { ...values, b_H: 0, d_H: 0, k_HC: 0 }, { refPrices: REF });
  assert.equal(r.status, 'no_solution');
  assert.equal(r.P, undefined);
});

test('奇異聯立式：供需恆等 → 無唯一解', () => {
  const { values } = baseline();
  const r = solveJoint(modelWith({ Q_H_D: 'H_s + b_H*P_H' }), values, { refPrices: REF });
  assert.equal(r.status, 'non_unique');
});

test('負價格 → 不在適用範圍，不截斷為 0', () => {
  const { model, values } = baseline();
  const r = solveJoint(model, { ...values, H_d0: -20000000 }, { refPrices: REF });
  assert.equal(r.status, 'out_of_range');
  assert.ok(r.P.P_H < 0);
  assert.ok(r.violations.some((v) => v.id === 'P_H'));
});

test('負分群需求 → 不在適用範圍', () => {
  const { model, values } = baseline();
  const r = solveJoint(model, { ...values, G_d0: -30000000000 }, { refPrices: REF });
  assert.equal(r.status, 'out_of_range');
  assert.ok(r.violations.some((v) => v.id === 'Q_G_D'));
});

test('非線性公式使用 Newton 法；無解時回報找不到解', () => {
  const { values } = baseline();
  const nl = solveJoint(modelWith({ Q_H_S: 'H_s + b_H*P_H^2/100000' }), values, { refPrices: REF });
  assert.equal(nl.method, 'newton');
  assert.equal(nl.status, 'valid');
  assert.ok(relClose(nl.P.P_H, 100000, 1e-6));

  const none = solveJoint(modelWith({ Q_H_S: 'Q_H_D + 1000000 + exp(P_H/100000)' }), values, { refPrices: REF, maxIter: 50 });
  assert.equal(none.status, 'not_found');
  assert.equal(none.P, undefined);
});

test('單市場模式：固定其他兩價，只求該市場交點', () => {
  const { model, values } = baseline();
  const base = solveSingle(model, values, 'C', { ...REF }, { refPrices: REF });
  assert.equal(base.status, 'valid');
  assert.equal(base.mode, 'single');
  assert.ok(relClose(base.P.P_C, 5, 1e-9));
  assert.deepEqual(Object.keys(base.Q), ['C']);

  const shifted = solveSingle(model, { ...values, epsilon: 2.5 }, 'C', { ...REF }, { refPrices: REF });
  assert.ok(shifted.P.P_C > 5, '耗電增加使算力供給左移、條件價格上升');
  assert.equal(shifted.P.P_H, REF.P_H, '其他價格維持固定');
  assert.equal(shifted.P.P_A, REF.P_A);
});
