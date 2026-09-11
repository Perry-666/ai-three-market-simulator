import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, containsCall } from '../src/engine/parser.js';
import { solveJoint } from '../src/engine/solver.js';
import { localShift, ownPriceSlopes } from '../src/engine/analysis.js';
import { CALIBRATION, DEFAULT_FORMULAS, EQUATIONS, FACTORS, MARKET_IDS, MARKETS, SYMBOLS } from '../src/engine/model.js';
import { demo } from './helpers.js';

test('R07：預設式不含 min／max，也沒有 T、kappa_H、Q_C_max', () => {
  for (const f of DEFAULT_FORMULAS) assert.equal(containsCall(parse(f.expr), ['min', 'max']), false, f.id);
  for (const id of ['T', 'kappa_H', 'Q_C_max']) assert.equal(SYMBOLS[id], undefined);
  for (const id of ['k_HN', 'k_HM', 'k_CM', 'k_CK', 'k_EW', 'k_GW']) assert.ok(SYMBOLS[id], id);
});

test('固定跨市場價格時：供給對自身價格非遞減、需求非遞增', () => {
  const { model, values } = demo();
  for (const factor of [0.1, 0.5, 1, 2, 5]) {
    const prices = Object.fromEntries(Object.entries(CALIBRATION.prices).map(([k, v]) => [k, v * factor]));
    for (const m of MARKET_IDS) {
      const s = ownPriceSlopes(model, values, prices, m);
      assert.ok(s.supply >= 0, `${m} 供給斜率 ${s.supply}`);
      assert.ok(s.demand <= 0, `${m} 需求斜率 ${s.demand}`);
    }
  }
});

test('各因素局部移線方向符合第 03 頁；已吸收效果顯示為無直接位移', () => {
  const { model, values } = demo();
  for (const f of FACTORS) {
    const dirs = localShift(model, values, CALIBRATION.prices, f.id);
    for (const key of Object.keys(EQUATIONS)) {
      const expected = f.expect[key]?.[0] ?? 'none';
      if (f.absorbedBy && values[f.absorbedBy.coef] === 0 && expected !== 'none') {
        assert.equal(dirs[key], 'none', `${f.id} 在 ${key} 應由 ${f.absorbedBy.coef}=0 吸收`);
      } else {
        assert.equal(dirs[key], expected, `${f.id} 在 ${key}：預期 ${expected}，引擎 ${dirs[key]}`);
      }
    }
  }
});

test('產能、容量、存量、預算增加 → 對應曲線右移', () => {
  const { model, values } = demo();
  const cases = { N: ['H_S'], M: ['H_D', 'C_S'], K_C: ['C_S'], W_E: ['A_D'], W_G: ['A_D'] };
  for (const [id, keys] of Object.entries(cases)) {
    const dirs = localShift(model, values, CALIBRATION.prices, id);
    for (const k of keys) assert.equal(dirs[k], 'right', `${id} → ${k}`);
  }
});

test('跨市場價格傳導方向（第 04 頁 §2）', () => {
  const { model, values } = demo();
  const shiftPrice = (id) => {
    const p0 = CALIBRATION.prices;
    const p1 = { ...p0, [id]: p0[id] * 1.01 };
    const e0 = model.evaluate(values, p0);
    const e1 = model.evaluate(values, p1);
    return (eq) => Math.sign(e1[eq] - e0[eq]);
  };
  assert.equal(shiftPrice('P_C')('Q_H_D'), 1);
  assert.equal(shiftPrice('P_H')('Q_C_S'), -1);
  assert.equal(shiftPrice('P_A')('Q_C_D'), 1);
  assert.equal(shiftPrice('P_C')('Q_A_S'), -1);
});

test('R02：調利率時三個市場共用同一 r 並重新聯立求解', () => {
  const { model, values } = demo();
  const base = solveJoint(model, values, { refPrices: CALIBRATION.prices });
  const up = solveJoint(model, { ...values, r: values.r + 2 }, { refPrices: CALIBRATION.prices });
  assert.equal(up.status, 'valid');
  for (const m of MARKET_IDS) {
    const id = MARKETS[m].price;
    assert.notEqual(up.P[id], base.P[id], `${id} 應重新求解`);
    assert.ok(DEFAULT_FORMULAS.some((f) => f.id.startsWith(`Q_${m}`) && /\br\b/.test(f.expr)), `${m} 市場公式含 r`);
  }
  assert.equal(up.env.r, values.r + 2);
});

test('百分數以百分數值運算：r=3.64 直接代入', () => {
  const { model, values } = demo();
  const e1 = model.evaluate(values, CALIBRATION.prices);
  const e2 = model.evaluate({ ...values, r: values.r + 1 }, CALIBRATION.prices);
  const diff = e1.Q_H_S - e2.Q_H_S;
  assert.ok(Math.abs(diff - values.k_Hr_S) <= 1e-6 * values.k_Hr_S, '利率 +1 個百分點 → Q_H_S 減少 k_Hr_S');
});

test('R08：示範值具來源標記；觀測值只有 r、e', () => {
  const { scenario } = demo();
  const observed = Object.entries(scenario.values).filter(([, v]) => v.source === 'observed').map(([k]) => k).sort();
  assert.deepEqual(observed, ['e', 'r']);
  assert.equal(scenario.values.A_H_S.source, 'calibrated');
  assert.equal(scenario.values.b_H.source, 'assumption');
  for (const f of FACTORS) if (f.source !== 'observed') assert.equal(f.pending, true, `${f.id} 在第 03 頁為待填`);
});
