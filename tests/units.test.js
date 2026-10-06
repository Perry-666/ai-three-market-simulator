import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/engine/parser.js';
import { checkFormulaUnits, formatUnit, parseUnit, sameDims } from '../src/engine/units.js';
import { MARKETS, SYMBOLS } from '../src/engine/model.js';

// 單位檢查用於宣告了機器可讀單位的符號；Δ 形式的基準常數會回報「未驗證」（常數視為基準值）。
const UNITS = {
  P_H: 'USD/PFLOPS', P_C: 'USD/(PFLOPS*h)', P_A: 'USD/Mtok',
  Q_H: 'PFLOPS/yr', Q_C: 'PFLOPS*h/yr', Q_A: 'Mtok/yr',
  c: 'USD/set', h: 'PFLOPS/set', e: 'USD/kWh', epsilon: 'kWh/(PFLOPS*h)', u: 'ratio', r: 'pct/yr',
  O_C: 'USD/(PFLOPS*h)', a: 'PFLOPS*h/Mtok', b_H: '(PFLOPS/yr)/(USD/PFLOPS)',
};
const unitOf = (name) => UNITS[name] ?? null;
const check = (expr, declared) => checkFormulaUnits(parse(expr), declared, unitOf, expr);

test('模型宣告的單位皆可解析', () => {
  for (const s of Object.values(SYMBOLS)) {
    if (s.unit) assert.doesNotThrow(() => parseUnit(s.unit), `${s.id}: ${s.unit}`);
  }
  for (const m of Object.values(MARKETS)) {
    assert.doesNotThrow(() => parseUnit(m.priceUnit));
    assert.doesNotThrow(() => parseUnit(m.qtyUnit));
  }
});

test('跨市場換算的單位一致：c/h 與 P_H 同單位、a×P_C 與 P_A 同單位、e×ε×u 與 P_C 同單位', () => {
  assert.equal(check('c/h', 'USD/PFLOPS').status, 'ok');
  assert.equal(check('a*P_C', 'USD/Mtok').status, 'ok');
  assert.equal(check('e*epsilon*u + O_C', 'USD/(PFLOPS*h)').status, 'ok');
  assert.equal(check('b_H*P_H', 'PFLOPS/yr').status, 'ok');
});

test('加減不同單位 → 不一致並指出位置', () => {
  const expr = 'c/h + r';
  const res = check(expr, 'USD/PFLOPS');
  assert.equal(res.status, 'mismatch');
  assert.equal(res.start, expr.indexOf('r', 4));
  assert.equal(check('a*P_C', 'USD/PFLOPS').status, 'mismatch');
});

test('Δ 形式的基準常數明示為未驗證，不冒充已檢查', () => {
  const res = check('c/h - 50000', 'USD/PFLOPS');
  assert.equal(res.status, 'unverified');
  assert.match(res.message, /常數/);
});

test('exp 參數須無單位；PFLOP-hour 顯示', () => {
  assert.equal(check('exp(P_H)', 'ratio').status, 'mismatch');
  assert.equal(formatUnit('PFLOPS*h/yr'), 'PFLOP-hour／年');
  assert.equal(formatUnit('USD/(PFLOPS*h)'), '美元／PFLOP-hour');
  assert.ok(sameDims(parseUnit('(USD/kWh)*(kWh/(PFLOPS*h))*ratio'), parseUnit('USD/(PFLOPS*h)')));
});
