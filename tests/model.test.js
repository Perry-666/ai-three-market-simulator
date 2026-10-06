import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASELINE_EQUILIBRIUM, COEFFICIENT_BY_ID, DERIVATIONS, FACTORS, LEVEL2, MARKET_FORMULAS, MARKET_IDS, MARKETS,
  PENDING_FACTORS, REFERENCE_ROWS,
} from '../src/engine/model.js';
import { containsCall, parse } from '../src/engine/parser.js';
import { baseline, relClose, solveBaseline, solveWithValues } from './helpers.js';

test('R11：第 03 頁基準代入後重現 2027 基準均衡', () => {
  const r = solveBaseline();
  assert.equal(r.status, 'valid');
  assert.equal(r.method, 'linear');
  for (const [id, want] of Object.entries(BASELINE_EQUILIBRIUM.P)) assert.ok(relClose(r.P[id], want, 1e-9), `${id}=${r.P[id]}`);
  for (const [m, want] of Object.entries(BASELINE_EQUILIBRIUM.Q)) assert.ok(relClose(r.Q[m], want, 1e-9), `Q_${m}=${r.Q[m]}`);
  for (const [seg, want] of Object.entries(BASELINE_EQUILIBRIUM.segments)) assert.ok(relClose(r.env[seg], want, 1e-9), `${seg}=${r.env[seg]}`);
  // 推論 aQ_A 與其他算力各 40 億
  assert.ok(relClose(r.env.a * r.env.Q_A_D, BASELINE_EQUILIBRIUM.split.inference, 1e-9));
  assert.ok(relClose(r.env.C_d - COEFFICIENT_BY_ID.d_C.value * r.P.P_C, BASELINE_EQUILIBRIUM.split.other, 1e-9));
  for (const res of Object.values(r.residuals)) assert.ok(res <= 1e-8);
});

test('R12：41 個 Level 1、61 個 Level 2、4 筆不排名參照', () => {
  assert.equal(FACTORS.length, 41);
  assert.equal(LEVEL2.length, 61);
  assert.equal(REFERENCE_ROWS.length, 4);
  assert.equal(PENDING_FACTORS.length, 6);
  // 每個 Level 2 的父層都存在且有換算式（或父層本身是 Level 1）
  const l1 = new Set(FACTORS.map((x) => x.id));
  const derivTargets = new Set(DERIVATIONS.filter((d) => d.target).map((d) => d.target));
  for (const s of LEVEL2) {
    for (const p of s.parents) {
      assert.ok(l1.has(p), `${s.id} 的父層 ${p} 不是 Level 1`);
      assert.ok(derivTargets.has(p), `${s.id} 的父層 ${p} 缺換算式`);
    }
  }
  // 每個因素都接到至少一條供需式
  const allExpr = MARKET_FORMULAS.map((f) => f.expr).join(' ');
  for (const x of FACTORS) assert.ok(new RegExp(`\\b${x.id}\\b`).test(allExpr), `${x.id} 未接入供需式`);
});

test('R12：跨市場係數符合第 04 頁 4.1 的推導式', () => {
  const C = (id) => COEFFICIENT_BY_ID[id].value;
  const m = BASELINE_EQUILIBRIUM.P.P_H / BASELINE_EQUILIBRIUM.P.P_C; // 20,000
  const hNew = (8000 / 2) * (2 / 3); // A_C/2 × 2/3 ≈ 2,667
  assert.equal(C('k_AC'), C('b_A'));
  assert.equal(C('k_HC'), C('d_H') * m);
  assert.ok(relClose(C('k_CH'), C('d_H') * hNew, 1e-12));
  assert.equal(C('k_Hc'), C('b_H'));
  assert.equal(C('k_Ce'), C('b_C'));
  assert.equal(C('k_AE'), C('b_A'));
  assert.equal(C('k_Ht'), (C('d_H') * BASELINE_EQUILIBRIUM.P.P_H) / 100);
  assert.ok(relClose(C('k_Ct'), (C('k_CH') * BASELINE_EQUILIBRIUM.P.P_H) / 100, 1e-12));
  assert.equal(C('k_ACM'), C('b_A') / BASELINE_EQUILIBRIUM.Q.A);
  assert.equal(C('k_HN'), 4);
  // D(a) 需為正
  const D = C('b_C') + C('d_C') - (C('k_CH') * C('k_HC')) / (C('b_H') + C('d_H'))
    + (C('k_AC') * (C('d_E') + C('d_U') + C('d_G')) * 0.1 ** 2) / (C('b_A') + C('d_E') + C('d_U') + C('d_G'));
  assert.ok(relClose(D, 1.4e9 / 3 + 1e10 * 0.01, 1e-12), `D=${D}`);
});

test('R07：預設式不含 min／max 截斷，也沒有容量或預算上限', () => {
  for (const f of [...MARKET_FORMULAS, ...DERIVATIONS]) {
    assert.equal(containsCall(parse(f.expr), ['min', 'max']), false, f.id);
  }
});

test('R02：利率跨三市場同步，改 r 會重新求解三個價格', () => {
  const base = solveBaseline();
  const up = solveWithValues({ r: 6 });
  assert.equal(up.status, 'valid');
  for (const m of MARKET_IDS) assert.notEqual(up.P[MARKETS[m].price], base.P[MARKETS[m].price]);
  for (const id of ['H_s', 'H_d', 'C_s', 'C_d', 'A_s', 'E_d', 'G_d']) {
    assert.ok(/\br\b/.test(MARKET_FORMULAS.find((f) => f.id === id).expr), `${id} 應含 r`);
  }
});

test('R12：K_C 增加同時使硬體需求減少 0.2ΔK_C、算力供給增加 0.25×A_C×ΔK_C', () => {
  const { model, values } = baseline();
  const P = BASELINE_EQUILIBRIUM.P;
  const e0 = model.evaluate(values, P);
  const dK = 100000;
  const e1 = model.evaluate({ ...values, K_C: values.K_C + dK }, P);
  assert.ok(relClose(e1.H_d - e0.H_d, -0.2 * dK, 1e-9));
  assert.ok(relClose(e1.C_s - e0.C_s, 0.25 * values.A_C * dK, 1e-9));
});

test('固定跨市場價格時：供給對自身價格非遞減、需求非遞增', () => {
  const { model, values } = baseline();
  for (const factor of [0.5, 1, 2]) {
    const prices = Object.fromEntries(Object.entries(BASELINE_EQUILIBRIUM.P).map(([k, v]) => [k, v * factor]));
    for (const m of MARKET_IDS) {
      const mk = MARKETS[m];
      const h = Math.abs(prices[mk.price]) * 1e-4;
      const lo = model.evaluate(values, { ...prices, [mk.price]: prices[mk.price] - h });
      const hi = model.evaluate(values, { ...prices, [mk.price]: prices[mk.price] + h });
      assert.ok(hi[mk.supply] >= lo[mk.supply], `${m} 供給`);
      assert.ok(hi[mk.demand] <= lo[mk.demand], `${m} 需求`);
    }
  }
});

test('跨市場傳導方向（第 04 頁 §5）', () => {
  const { model, values } = baseline();
  const P = BASELINE_EQUILIBRIUM.P;
  const bump = (id) => {
    const e0 = model.evaluate(values, P);
    const e1 = model.evaluate(values, { ...P, [id]: P[id] * 1.01 });
    return (eq) => Math.sign(e1[eq] - e0[eq]);
  };
  assert.equal(bump('P_C')('Q_H_D'), 1, 'P_C↑ → 硬體需求右移');
  assert.equal(bump('P_H')('Q_C_S'), -1, 'P_H↑ → 算力供給左移');
  assert.equal(bump('P_C')('Q_A_S'), -1, 'P_C↑ → AI 供給左移');
  // 推論算力需求＝a×Q_A：P_A 上升使 Q_A 減少，因此算力需求量下降
  assert.equal(bump('P_A')('Q_C_D'), -1, 'P_A↑ → Q_A 減少 → 推論算力需求下降');
});

test('Q_A 上升（非價格因素推動）→ 算力需求增加 a×ΔQ_A', () => {
  const { model, values } = baseline();
  const P = BASELINE_EQUILIBRIUM.P;
  const e0 = model.evaluate(values, P);
  const e1 = model.evaluate({ ...values, v_E: values.v_E + 1 }, P);
  const dQA = e1.Q_A_D - e0.Q_A_D;
  assert.ok(dQA > 0);
  assert.ok(relClose(e1.Q_C_D - e0.Q_C_D, values.a * dQA, 1e-9));
});

test('百分數以百分數值運算：r 增 1 個百分點等於 k_Hr_S', () => {
  const { model, values } = baseline();
  const P = BASELINE_EQUILIBRIUM.P;
  const d = model.evaluate(values, P).H_s - model.evaluate({ ...values, r: values.r + 1 }, P).H_s;
  assert.ok(relClose(d, COEFFICIENT_BY_ID.k_Hr_S.value, 1e-9));
});

test('待估因素不得被填入數值', () => {
  const { scenario } = baseline();
  for (const p of PENDING_FACTORS) assert.equal(scenario.values[p.id], undefined, `${p.id} 不應有數值`);
});
