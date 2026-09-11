import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultSession } from '../src/engine/scenario.js';
import {
  computeSession, resolveDisplay, resetCurrent, resetCoefficients, resetFormula, saveAsBaseline, setFormula, setSolver, setValue,
  duplicateScenario, loadSaved,
} from '../src/engine/session.js';
import { DEFAULT_EXPR } from '../src/engine/model.js';

test('修改一條有效公式 → 重新解析、求解', () => {
  const s0 = createDefaultSession();
  const r0 = computeSession(s0);
  const s1 = setFormula(s0, 'Q_H_D', `${DEFAULT_EXPR.Q_H_D} + 2e7`);
  const r1 = computeSession(s1);
  assert.equal(r1.current.status, 'valid');
  assert.ok(r1.current.P.P_H > r0.current.P.P_H, '需求增加使硬體價格上升');
  assert.equal(r1.current.units.Q_H_D.status, 'unverified', '常數項要明示未驗證');
  assert.equal(r1.baseline.P.P_H, r0.baseline.P.P_H, '基準不受影響');
});

test('錯誤公式 → 具體訊息，保留最後有效圖表並標示過期', () => {
  const s0 = createDefaultSession();
  const r0 = computeSession(s0);
  let display = resolveDisplay(null, r0);
  assert.equal(display.stale, false);

  const expr = `${DEFAULT_EXPR.Q_H_D} + zzz`;
  const r1 = computeSession(setFormula(s0, 'Q_H_D', expr));
  assert.equal(r1.current.status, 'formula_error');
  assert.equal(r1.current.errors[0].start, expr.indexOf('zzz'));
  assert.equal(r1.current.P, undefined, '不冒充新均衡');
  display = resolveDisplay(display.lastValid, r1);
  assert.equal(display.stale, true);
  assert.equal(display.shown, r0);
});

test('除以零 → 公式錯誤並指出位置', () => {
  const s0 = createDefaultSession();
  const expr = `${DEFAULT_EXPR.Q_H_S} + k_HN*N/(r-r)`;
  const r = computeSession(setFormula(s0, 'Q_H_S', expr));
  assert.equal(r.current.status, 'formula_error');
  assert.equal(r.current.errors[0].code, 'div_zero');
  assert.equal(r.current.errors[0].start, expr.lastIndexOf('(r-r)'));
});

test('輸入錯誤（h=0）→ 暫停求解', () => {
  const r = computeSession(setValue(createDefaultSession(), 'h', 0));
  assert.equal(r.current.status, 'input_error');
  assert.equal(r.current.inputErrors[0].id, 'h');
});

test('重設回復基準；儲存為基準；係數重設', () => {
  let s = createDefaultSession();
  s = setValue(s, 'r', 7);
  s = setValue(s, 'k_HN', 99);
  assert.equal(resetCoefficients(s).current.values.k_HN.value, 20);
  assert.equal(resetCoefficients(s).current.values.r.value, 7);
  assert.equal(resetCurrent(s).current.values.r.value, 3.64);
  assert.equal(resetCurrent(s).current.values.r.source, 'observed');

  const saved = saveAsBaseline(s);
  assert.equal(saved.baseline.values.r.value, 7);
  const after = resetCurrent(setValue(saved, 'r', 1));
  assert.equal(after.current.values.r.value, 7, '重設回到選定的基準');
  assert.equal(resetFormula(setFormula(s, 'Q_U_D', 'A_U'), 'Q_U_D').current.formulas.find((f) => f.id === 'Q_U_D').expr, DEFAULT_EXPR.Q_U_D);
});

test('複製與載入情境', () => {
  let s = setValue(createDefaultSession(), 'e', 0.12);
  s = duplicateScenario(s, '高電價');
  s = setValue(s, 'e', 0.05);
  s = loadSaved(s, 0);
  assert.equal(s.current.values.e.value, 0.12);
  assert.equal(s.current.name, '高電價');
});

test('單市場模式：固定價來自基準均衡，結果標示 single', () => {
  let s = setSolver(createDefaultSession(), { mode: 'single', market: 'C' });
  s = setValue(s, 'epsilon', 0.4);
  const r = computeSession(s);
  assert.equal(r.mode, 'single');
  assert.equal(r.current.mode, 'single');
  assert.equal(r.current.status, 'valid');
  assert.equal(r.current.P.P_H, r.baselineJoint.P.P_H);
  assert.ok(r.current.P.P_C > r.baselineJoint.P.P_C, '耗電增加使算力供給左移、價格上升');
});
