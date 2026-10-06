import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultSession } from '../src/engine/scenario.js';
import {
  computeSession, duplicateScenario, loadSaved, resetCoefficients, resetCurrent, resetFormula, resolveDisplay,
  saveAsBaseline, setFormula, setMode, setSolver, setValue,
} from '../src/engine/session.js';
import { DEFAULT_EXPR } from '../src/engine/model.js';

test('R03：修改一條有效公式 → 重新解析、求解', () => {
  const s0 = createDefaultSession();
  const r0 = computeSession(s0);
  const s1 = setFormula(s0, 'C_d', `${DEFAULT_EXPR.C_d} + 200000000`);
  const r1 = computeSession(s1);
  assert.equal(r1.current.status, 'valid');
  assert.ok(r1.current.Q.C > r0.current.Q.C, '其他算力需求增加 → 均衡算力上升');
  assert.equal(r1.baseline.Q.C, r0.baseline.Q.C, '基準不受影響');
});

test('R03：修改父層換算式也會重算', () => {
  const s0 = setMode(createDefaultSession(), 'L', 'derived');
  const r0 = computeSession(s0);
  const s1 = setFormula(s0, 'L', '24 + 1.0*(l_grid - 18) + 0.5*(l_build - 12)');
  const r1 = computeSession(setValue(s1, 'l_grid', 36));
  assert.equal(r1.current.status, 'valid');
  assert.ok(Math.abs(r1.current.env.L - 42) < 1e-9, `L=${r1.current.env.L}`);
  assert.ok(r1.current.Q.C < r0.current.Q.C);
  assert.equal(resetFormula(s1, 'L').current.derivations.find((d) => d.id === 'L').expr, DEFAULT_EXPR.L);
});

test('R03：錯誤公式顯示位置，保留最後有效圖表並標示未更新', () => {
  const s0 = createDefaultSession();
  const r0 = computeSession(s0);
  let display = resolveDisplay(null, r0);
  assert.equal(display.stale, false);

  const expr = `${DEFAULT_EXPR.C_d} + zzz`;
  const r1 = computeSession(setFormula(s0, 'C_d', expr));
  assert.equal(r1.current.status, 'formula_error');
  assert.equal(r1.current.errors[0].start, expr.indexOf('zzz'));
  assert.equal(r1.current.P, undefined);
  display = resolveDisplay(display.lastValid, r1);
  assert.equal(display.stale, true);
  assert.equal(display.shown, r0);
});

test('除以零與輸入錯誤各自回報', () => {
  const s0 = createDefaultSession();
  const expr = `${DEFAULT_EXPR.C_s} + k_CM*(M - 20000)/(r - r)`;
  const divZero = computeSession(setFormula(s0, 'C_s', expr));
  assert.equal(divZero.current.status, 'formula_error');
  assert.equal(divZero.current.errors[0].code, 'div_zero');
  const badInput = computeSession(setValue(s0, 'h', 0));
  assert.equal(badInput.current.status, 'input_error');
  assert.equal(badInput.current.inputErrors[0].id, 'h');
});

test('R02：重設回復基準；儲存為基準；係數重設', () => {
  let s = createDefaultSession();
  s = setValue(s, 'r', 6);
  s = setValue(s, 'k_HN', 9);
  assert.equal(resetCoefficients(s).current.values.k_HN.value, 4);
  assert.equal(resetCoefficients(s).current.values.r.value, 6);
  assert.equal(resetCurrent(s).current.values.r.value, 4);

  const saved = saveAsBaseline(s);
  assert.equal(saved.baseline.values.r.value, 6);
  assert.equal(resetCurrent(setValue(saved, 'r', 2)).current.values.r.value, 6);
});

test('輸入模式切換：derived 時由子項決定父層', () => {
  let s = createDefaultSession();
  s = setValue(s, 'K_C', 1200000);
  const direct = computeSession(s);
  assert.equal(direct.current.env.K_C, 1200000);
  s = setMode(s, 'K_C', 'derived');
  const derived = computeSession(s);
  assert.ok(Math.abs(derived.current.env.K_C - 1000000) < 1e-6, '換算模式忽略直接輸入');
  assert.equal(computeSession(setValue(s, 'compat', 95)).current.env.K_C > 1000000, true);
});

test('複製與載入情境', () => {
  let s = setValue(createDefaultSession(), 'e', 0.12);
  s = duplicateScenario(s, '高電價');
  s = setValue(s, 'e', 0.06);
  s = loadSaved(s, 0);
  assert.equal(s.current.values.e.value, 0.12);
  assert.equal(s.current.name, '高電價');
});

test('單市場模式：固定價來自基準均衡並標示條件均衡', () => {
  let s = setSolver(createDefaultSession(), { mode: 'single', market: 'C' });
  s = setValue(s, 'epsilon', 2.5);
  const r = computeSession(s);
  assert.equal(r.mode, 'single');
  assert.equal(r.current.mode, 'single');
  assert.equal(r.current.status, 'valid');
  assert.equal(r.current.P.P_H, r.baselineJoint.P.P_H);
  assert.ok(r.current.P.P_C > r.baselineJoint.P.P_C);
});
