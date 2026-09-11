import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/engine/parser.js';
import { checkFormulaUnits, formatUnit, parseUnit, sameDims } from '../src/engine/units.js';
import { DEFAULT_FORMULAS, FORMULA_META, SYMBOLS, unitOfSymbol } from '../src/engine/model.js';

const check = (id, expr) => checkFormulaUnits(parse(expr), FORMULA_META[id].unit, unitOfSymbol, expr);

test('所有符號與係數單位可解析', () => {
  for (const s of Object.values(SYMBOLS)) assert.doesNotThrow(() => parseUnit(s.unit), s.id);
});

test('預設公式全部單位一致', () => {
  for (const f of DEFAULT_FORMULAS) {
    const r = check(f.id, f.expr);
    assert.equal(r.status, 'ok', `${f.id}: ${r.message}`);
  }
});

test('加減不同單位 → 不一致並指出位置', () => {
  const expr = 'A_H_S + b_H*P_H + r';
  const r = check('Q_H_S', expr);
  assert.equal(r.status, 'mismatch');
  assert.equal(r.start, expr.indexOf('r', 10));
});

test('結果單位與宣告不同 → 不一致', () => {
  assert.equal(check('Q_H_S', 'b_H').status, 'mismatch');
});

test('常數項或非常數指數 → 明示未驗證', () => {
  assert.equal(check('Q_H_S', 'A_H_S + 5').status, 'unverified');
  assert.equal(check('Q_H_S', 'A_H_S * (P_H/P_H)^r').status, 'mismatch'); // 指數有單位
  assert.equal(check('Q_H_S', 'A_H_S * (y/y)^(h/h)').status, 'ok');
});

test('exp 參數須無單位', () => {
  assert.equal(check('Q_H_S', 'A_H_S * exp(P_H)').status, 'mismatch');
});

test('PFLOP-hour 顯示', () => {
  assert.equal(formatUnit('PFLOPS*h/yr'), 'PFLOP-hour／年');
  assert.equal(formatUnit('USD/(PFLOPS*h)'), '美元／PFLOP-hour');
  assert.ok(sameDims(parseUnit('(USD/kWh)*(kWh/(PFLOPS*h))*ratio'), parseUnit('USD/(PFLOPS*h)')));
});
