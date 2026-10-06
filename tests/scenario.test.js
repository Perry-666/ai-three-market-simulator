import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareResults, createDefaultSession, exportSession, importSession, ImportError, pctChange, SCHEMA_VERSION,
  validateInputs,
} from '../src/engine/scenario.js';
import { computeSession, setFormula, setMode, setValue } from '../src/engine/session.js';
import { runSensitivity } from '../src/engine/sensitivity.js';
import { DEFAULT_EXPR } from '../src/engine/model.js';

test('R16：JSON 匯出再匯入，公式、父層關係、區間、模式與結果皆重現', () => {
  let s = createDefaultSession();
  s = setValue(s, 'r', 5.25);
  s = setMode(s, 'a', 'derived');
  s = setValue(s, 'reasoning', 3);
  s = setFormula(s, 'C_d', `${DEFAULT_EXPR.C_d} + 1000000`);
  const results = computeSession(s);
  const text = JSON.stringify(exportSession(s, results));

  const { session: back, expected } = importSession(text);
  assert.deepEqual(back.current.formulas, s.current.formulas);
  assert.deepEqual(back.current.derivations, s.current.derivations);
  assert.deepEqual(back.current.values, s.current.values);
  assert.deepEqual(back.current.ranges, s.current.ranges);
  assert.deepEqual(back.current.modes, s.current.modes);
  assert.equal(back.current.modes.a, 'derived');
  assert.equal(back.current.values.r.source, 'user');
  assert.equal(back.current.values.e.source, 'observed');

  const again = computeSession(back);
  assert.deepEqual(compareResults(expected, again), []);
  assert.equal(again.current.P.P_C, results.current.P.P_C);
});

test('匯出檔包含方法識別、單位、敏感度結果與父層換算', () => {
  const s = createDefaultSession();
  const results = computeSession(s);
  const sens = runSensitivity(s.current, s.solver);
  const out = exportSession(s, results, sens);
  assert.equal(out.version, SCHEMA_VERSION);
  assert.equal(out.method, 'oat_baseline_pct_max_abs');
  assert.equal(out.sensitivity.Q0, 8000000000);
  assert.equal(out.sensitivity.level1.length, 41);
  assert.equal(out.sensitivity.level2.length, 61);
  assert.equal(out.sensitivity.level1[0].id, 'a');
  assert.equal(out.current.values.r.unit, '%／年');
  assert.equal(out.current.ranges.K_C.high, 1200000);
  assert.ok(out.current.derivations.some((d) => d.id === 'N' && d.expr.includes('G_F')));
  assert.equal(out.results.current.derivedLevel1.c, 200000);
});

test('匯入缺值、無效來源、舊版本時報錯，不補 0', () => {
  const s = createDefaultSession();
  const obj = exportSession(s);
  obj.current.values.c.value = '待填';
  assert.throws(() => importSession(obj), (e) => {
    assert.ok(e instanceof ImportError);
    assert.ok(e.problems.some((p) => p.includes('「c」') && p.includes('不會自動補 0')));
    return true;
  });
  const old = exportSession(createDefaultSession());
  old.version = 1;
  assert.throws(() => importSession(old), /模型不相容/);
  const badSource = exportSession(createDefaultSession());
  badSource.current.values.r.source = 'measured';
  assert.throws(() => importSession(badSource), /來源標記/);
  assert.throws(() => importSession('{not json'), ImportError);
});

test('匯入檢查區間：下限不得大於上限', () => {
  const obj = exportSession(createDefaultSession());
  obj.current.ranges.N = { low: 400000, high: 100000 };
  assert.throws(() => importSession(obj), /下限大於上限/);
});

test('基準為 0 時百分比變化不適用', () => {
  assert.equal(pctChange(0, 5), null);
  assert.equal(pctChange(2, 3), 50);
  assert.equal(pctChange(-2, -1), 50);
});

test('輸入驗證：h>0、u≥1、比例 0–100；利率與預期可為負', () => {
  const s = createDefaultSession();
  const bad = setValue(setValue(setValue(setValue(s, 'h', 0), 'u', 0.9), 's_E', 120), 'eta_train', 0).current;
  const ids = validateInputs(bad).errors.map((e) => e.id).sort();
  assert.deepEqual(ids, ['eta_train', 'h', 's_E', 'u']);
  assert.equal(validateInputs(setValue(s, 'r', -1.5).current).errors.length, 0);
  assert.equal(validateInputs(setValue(s, 'g_Y', -2).current).errors.length, 0);
  assert.equal(validateInputs(setValue(s, 'R_E', -100000).current).errors.length, 0);
  // 換算模式下不檢查父層區間（子項可推出區間外的父層值）
  const derived = setValue(setMode(s, 'v_E', 'derived'), 'tau_E', 1).current;
  assert.equal(validateInputs(derived).errors.length, 0);
  // 基準落在區間外 → 警告
  const warn = validateInputs(setValue(s, 'N', 900000).current).warnings.map((w) => w.id);
  assert.ok(warn.includes('N'));
});
