// 曲線取樣與局部移線分析（固定跨市場價格，數值差分）。

import { FormulaError } from './parser.js';
import { EQUATIONS, MARKETS } from './model.js';

/**
 * 取樣本市場價格 P，計算 Q_S(P)、Q_D(P)。其他市場價格由 prices 提供。
 * 只做取樣；不裁切、不改寫公式值。
 */
export function sampleCurve(model, values, market, prices, [pMin, pMax], n = 160) {
  const mk = MARKETS[market];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const P = pMin + ((pMax - pMin) * i) / (n - 1);
    try {
      const env = model.evaluate(values, { ...prices, [mk.price]: P });
      pts.push({ P, S: env[mk.supply], D: env[mk.demand] });
    } catch (e) {
      if (!(e instanceof FormulaError)) throw e;
    }
  }
  return pts;
}

/** 單一價格點的供需量（提示框用）。 */
export function curveAt(model, values, market, prices, P) {
  const mk = MARKETS[market];
  try {
    const env = model.evaluate(values, { ...prices, [mk.price]: P });
    return { P, S: env[mk.supply], D: env[mk.demand] };
  } catch (e) {
    if (e instanceof FormulaError) return null;
    throw e;
  }
}

/** 因素 id 微幅上升時，六條式子在固定價格下的數量變化方向：right／left／none。 */
export function localShift(model, values, prices, id, rel = 1e-3) {
  const x = values[id];
  const h = x !== 0 ? rel * Math.abs(x) : rel;
  const e0 = model.evaluate(values, prices);
  const e1 = model.evaluate({ ...values, [id]: x + h }, prices);
  const out = {};
  for (const [key, eq] of Object.entries(EQUATIONS)) {
    const d = e1[eq] - e0[eq];
    const mag = Math.max(Math.abs(e0[eq]), Math.abs(e1[eq]), 1e-300);
    out[key] = Math.abs(d) <= 1e-12 * mag ? 'none' : d > 0 ? 'right' : 'left';
  }
  return out;
}

/** 本市場價格的數值斜率 dQ_S/dP、dQ_D/dP（其他價格固定）。 */
export function ownPriceSlopes(model, values, prices, market) {
  const mk = MARKETS[market];
  const P = prices[mk.price];
  const h = 1e-4 * Math.max(Math.abs(P), 1e-9);
  const a = model.evaluate(values, { ...prices, [mk.price]: P - h });
  const b = model.evaluate(values, { ...prices, [mk.price]: P + h });
  return { supply: (b[mk.supply] - a[mk.supply]) / (2 * h), demand: (b[mk.demand] - a[mk.demand]) / (2 * h) };
}
