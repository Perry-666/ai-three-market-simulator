import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultSession, exportSession, importSession, ImportError, pctChange, compareResults, validateInputs,
} from '../src/engine/scenario.js';
import { computeSession, setFormula, setValue } from '../src/engine/session.js';

test('JSON 匯出再匯入：公式、輸入、結果、來源標記皆重現', () => {
  let s = createDefaultSession();
  s = setValue(s, 'r', 5.25);
  s = setFormula(s, 'Q_H_D', 'A_H_D - d_H*P_H + k_HC*P_C - k_Hr_D*r - k_He*e - k_HL*L + k_HM*M + 1e6');
  const results = computeSession(s);
  const text = JSON.stringify(exportSession(s, results));

  const { session: back, expected } = importSession(text);
  assert.deepEqual(back.current.formulas, s.current.formulas);
  assert.deepEqual(back.current.values, s.current.values);
  assert.deepEqual(back.baseline.values, s.baseline.values);
  assert.deepEqual(back.solver, s.solver);
  assert.equal(back.current.values.r.source, 'user');
  assert.equal(back.current.values.e.source, 'observed');
  assert.equal(back.current.values.A_H_S.source, 'calibrated');
  assert.equal(back.current.values.b_H.source, 'assumption');

  const again = computeSession(back);
  assert.deepEqual(compareResults(expected, again), []);
  assert.equal(again.current.P.P_H, results.current.P.P_H);
});

test('匯出檔包含單位與求解設定', () => {
  const s = createDefaultSession();
  const out = exportSession(s, computeSession(s));
  assert.equal(out.current.values.r.unit, 'pct/yr');
  assert.equal(out.current.formulas.find((f) => f.id === 'Q_C_S').unit, 'PFLOPS*h/yr');
  assert.equal(out.solver.tolLinear, 1e-9);
  assert.equal(out.results.current.status, 'valid');
});

test('匯入缺值（待填、null）時報錯，不補 0', () => {
  const s = createDefaultSession();
  const obj = exportSession(s);
  obj.current.values.c.value = '待填';
  obj.baseline.values.N.value = null;
  assert.throws(() => importSession(obj), (e) => {
    assert.ok(e instanceof ImportError);
    assert.ok(e.problems.some((p) => p.includes('「c」') && p.includes('不會自動補 0')));
    assert.ok(e.problems.some((p) => p.includes('「N」')));
    return true;
  });
});

test('匯入錯誤 schema、無效來源標記', () => {
  const obj = exportSession(createDefaultSession());
  assert.throws(() => importSession({ ...obj, schema: 'other' }), ImportError);
  obj.current.values.r.source = 'measured';
  assert.throws(() => importSession(obj), /來源標記/);
  assert.throws(() => importSession('{not json'), ImportError);
});

test('基準為 0 時百分比變化不適用', () => {
  assert.equal(pctChange(0, 5), null);
  assert.equal(pctChange(0, 0), null);
  assert.equal(pctChange(2, 3), 50);
  assert.equal(pctChange(-2, -1), 50);
});

test('輸入驗證：h>0、u≥1、成功率 0–100、非負；利率可為負', () => {
  const s = createDefaultSession();
  const bad = setValue(setValue(setValue(setValue(s, 'h', 0), 'u', 0.9), 's_E', 120), 'N', -1).current;
  const ids = validateInputs(bad).errors.map((e) => e.id).sort();
  assert.deepEqual(ids, ['N', 'h', 's_E', 'u']);
  assert.equal(validateInputs(setValue(s, 'r', -1.5).current).errors.length, 0);
  assert.equal(validateInputs(setValue(s, 'epsilon', 0).current).errors.length, 0);
  assert.equal(validateInputs(setValue(s, 'b_H', -1).current).warnings[0].id, 'b_H');
});
