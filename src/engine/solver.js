// 求解：線性判定 → 尺度化完全樞紐消去（秩、條件數）；非線性 → Newton 法；單市場一維求根。
// 只有通過殘差與適用範圍檢查者才標為 valid。不使用 max(0,x) 改寫結果。

import { FormulaError } from './parser.js';
import { MARKETS, MARKET_IDS, PRICE_IDS, SEGMENT_FORMULAS, FORMULA_META } from './model.js';

export const STATUS_LABELS = {
  valid: '有效均衡',
  out_of_range: '此情境不在模型適用範圍',
  no_solution: '無解',
  non_unique: '無唯一解',
  ill_conditioned: '數值精度不足（病態）',
  not_found: '找不到解',
  residual_fail: '殘差檢查未通過',
  formula_error: '公式錯誤',
  input_error: '輸入錯誤',
};

export const HAS_PRICES = new Set(['valid', 'out_of_range', 'ill_conditioned', 'residual_fail']);

const pricesObj = (P) => ({ P_H: P[0], P_C: P[1], P_A: P[2] });

export function relResidual(S, D) {
  const mag = Math.max(Math.abs(S), Math.abs(D));
  if (mag === 0) return 0;
  return Math.abs(S - D) / mag;
}

// ---------- 線性代數 ----------

function gaussFullPivot(M0, b0) {
  const n = M0.length;
  const a = M0.map((r) => r.slice());
  const b = b0.slice();
  const perm = [...Array(n).keys()];
  const norm = Math.max(...a.map((r) => r.reduce((s, v) => s + Math.abs(v), 0)));
  const tol = 1e-12 * (norm || 1);
  let rank = 0;
  for (let k = 0; k < n; k++) {
    let pi = k; let pj = k; let best = 0;
    for (let i = k; i < n; i++) {
      for (let j = k; j < n; j++) {
        if (Math.abs(a[i][j]) > best) { best = Math.abs(a[i][j]); pi = i; pj = j; }
      }
    }
    if (best <= tol) break;
    [a[k], a[pi]] = [a[pi], a[k]];
    [b[k], b[pi]] = [b[pi], b[k]];
    if (pj !== k) {
      for (const row of a) [row[k], row[pj]] = [row[pj], row[k]];
      [perm[k], perm[pj]] = [perm[pj], perm[k]];
    }
    for (let i = k + 1; i < n; i++) {
      const f = a[i][k] / a[k][k];
      if (f === 0) continue;
      for (let j = k; j < n; j++) a[i][j] -= f * a[k][j];
      b[i] -= f * b[k];
    }
    rank++;
  }
  if (rank < n) {
    const bScale = Math.max(...b0.map(Math.abs));
    const consistent = bScale === 0 || b.slice(rank).every((v) => Math.abs(v) <= 1e-9 * bScale);
    return { rank, consistent };
  }
  const y = Array(n).fill(0);
  for (let k = n - 1; k >= 0; k--) {
    let s = b[k];
    for (let j = k + 1; j < n; j++) s -= a[k][j] * y[j];
    y[k] = s / a[k][k];
  }
  const x = Array(n).fill(0);
  for (let k = 0; k < n; k++) x[perm[k]] = y[k];
  return { rank: n, x };
}

/** 解 A x = b。先做列尺度化；秩不足時區分無解／無唯一解；估計 1-範數條件數。 */
export function solveLinearSystem(A, b, { condLimit = 1e10 } = {}) {
  const n = A.length;
  const M = [];
  const rhs = [];
  for (let i = 0; i < n; i++) {
    const s = Math.max(...A[i].map(Math.abs));
    const f = s > 0 ? 1 / s : 1;
    M.push(A[i].map((v) => v * f));
    rhs.push(b[i] * f);
  }
  const res = gaussFullPivot(M, rhs);
  if (res.rank < n) return { status: res.consistent ? 'non_unique' : 'no_solution', rank: res.rank };

  const invCols = [];
  for (let j = 0; j < n; j++) {
    const e = Array(n).fill(0);
    e[j] = 1;
    invCols.push(gaussFullPivot(M, e).x);
  }
  let normM = 0;
  let normInv = 0;
  for (let j = 0; j < n; j++) {
    let cm = 0;
    let ci = 0;
    for (let i = 0; i < n; i++) { cm += Math.abs(M[i][j]); ci += Math.abs(invCols[j][i]); }
    normM = Math.max(normM, cm);
    normInv = Math.max(normInv, ci);
  }
  const cond = normM * normInv;
  return { status: cond > condLimit ? 'ill_conditioned' : 'ok', x: res.x, cond, rank: n };
}

// ---------- 共同工具 ----------

function balance(env, markets) {
  return markets.map((m) => ({ S: env[MARKETS[m].supply], D: env[MARKETS[m].demand] }));
}

function priceScales(refPrices) {
  return PRICE_IDS.map((id) => {
    const v = refPrices?.[id];
    return Number.isFinite(v) && v !== 0 ? Math.abs(v) : 1;
  });
}

function finalize(model, values, P, { tol, markets, method, extra = {} }) {
  let env;
  try {
    env = model.evaluate(values, pricesObj(P));
  } catch (e) {
    if (e instanceof FormulaError) return { status: 'formula_error', method, errors: [e], ...extra };
    throw e;
  }
  const residuals = {};
  const Q = {};
  const violations = [];
  for (const m of markets) {
    const mk = MARKETS[m];
    const S = env[mk.supply];
    const D = env[mk.demand];
    residuals[m] = relResidual(S, D);
    Q[m] = S;
    const idx = MARKET_IDS.indexOf(m);
    if (P[idx] < 0) violations.push({ id: mk.price, value: P[idx], label: `${mk.short}價格 ${mk.price}` });
    if (S < 0 || D < 0) violations.push({ id: mk.quantity, value: Math.min(S, D), label: `${mk.short}數量 ${mk.quantity}` });
  }
  if (markets.includes('A')) {
    for (const seg of SEGMENT_FORMULAS) {
      if (typeof env[seg] === 'number' && env[seg] < 0) {
        violations.push({ id: seg, value: env[seg], label: `${FORMULA_META[seg].label} ${seg}` });
      }
    }
  }
  const worst = Math.max(...Object.values(residuals));
  let status;
  if (!(worst <= tol)) status = 'residual_fail';
  else status = violations.length ? 'out_of_range' : 'valid';
  return { status, method, P: pricesObj(P), Q, residuals, violations, env: { ...env }, ...extra };
}

// ---------- 聯立模式 ----------

function linearize(Zfn, s) {
  const base = Zfn([0, 0, 0]);
  const J = [[], [], []];
  for (let j = 0; j < 3; j++) {
    const P = [0, 0, 0];
    P[j] = s[j];
    const zj = Zfn(P);
    for (let i = 0; i < 3; i++) J[i][j] = (zj.z[i] - base.z[i]) / s[j];
  }
  for (const t of [[1.7, 0.6, 1.3], [0.4, 2.1, 0.9]]) {
    const P = t.map((v, k) => v * s[k]);
    const zt = Zfn(P);
    for (let i = 0; i < 3; i++) {
      const pred = base.z[i] + J[i][0] * P[0] + J[i][1] * P[1] + J[i][2] * P[2];
      const mag = Math.max(zt.mag[i], base.mag[i], Math.abs(pred), 1e-300);
      if (Math.abs(zt.z[i] - pred) > 1e-8 * mag) return null;
    }
  }
  return { J, z0: base.z };
}

function newton(Zfn, s, starts, tol, maxIter) {
  const scale = (x) => x.map((v, j) => v * s[j]);
  const norm = (g) => Math.sqrt(g.reduce((acc, v) => acc + v * v, 0));
  for (const x0 of starts) {
    let start;
    try { start = Zfn(scale(x0)); } catch (e) { if (e instanceof FormulaError) continue; throw e; }
    const m = start.mag.map((v) => (v > 0 ? v : 1));
    const G = (x) => { const r = Zfn(scale(x)); return { g: r.z.map((z, i) => z / m[i]), r }; };
    let x = x0.slice();
    let cur = { g: start.z.map((z, i) => z / m[i]), r: start };
    for (let it = 0; it <= maxIter; it++) {
      // 同時以目前量級與起點量級檢查，避免價格發散使相對殘差看似很小
      const done = cur.r.z.every((z, i) => (cur.r.mag[i] === 0 ? z === 0 : Math.abs(z) / cur.r.mag[i] <= tol)
        && Math.abs(z) / m[i] <= tol);
      if (done) return { P: scale(x), iterations: it };
      if (it === maxIter) break;
      const J = [[], [], []];
      let jacOk = true;
      for (let j = 0; j < 3; j++) {
        const h = 1e-6 * Math.max(Math.abs(x[j]), 1);
        const xp = x.slice();
        xp[j] += h;
        let gp;
        try { gp = G(xp).g; } catch (e) { if (e instanceof FormulaError) { jacOk = false; break; } throw e; }
        for (let i = 0; i < 3; i++) J[i][j] = (gp[i] - cur.g[i]) / h;
      }
      if (!jacOk) break;
      const step = solveLinearSystem(J, cur.g.map((v) => -v), { condLimit: Infinity });
      if (!step.x) break;
      const n0 = norm(cur.g);
      let t = 1;
      let accepted = false;
      while (t > 1e-10) {
        const xn = x.map((v, j) => v + t * step.x[j]);
        try {
          const cand = G(xn);
          if (norm(cand.g) < (1 - 1e-4 * t) * n0) { x = xn; cur = cand; accepted = true; break; }
        } catch (e) {
          if (!(e instanceof FormulaError)) throw e;
        }
        t /= 2;
      }
      if (!accepted) break;
    }
  }
  return null;
}

/**
 * 三市場聯立求解。
 * @param model compileFormulas 的結果
 * @param values {符號: 數值}
 * @param opts { refPrices（僅作尺度與 Newton 初值）, tolLinear, tolNonlinear, maxIter, condLimit }
 */
export function solveJoint(model, values, opts = {}) {
  const { refPrices = null, tolLinear = 1e-9, tolNonlinear = 1e-8, maxIter = 100, condLimit = 1e10 } = opts;
  const s = priceScales(refPrices);
  const Zfn = (P) => {
    const env = model.evaluate(values, pricesObj(P));
    const bal = balance(env, MARKET_IDS);
    return { z: bal.map((x) => x.S - x.D), mag: bal.map((x) => Math.max(Math.abs(x.S), Math.abs(x.D))) };
  };

  let lin = null;
  try {
    lin = linearize(Zfn, s);
  } catch (e) {
    if (!(e instanceof FormulaError)) throw e;
    lin = null;
  }

  if (lin) {
    const A = lin.J.map((row) => row.map((v, j) => v * s[j]));
    const sol = solveLinearSystem(A, lin.z0.map((v) => -v), { condLimit });
    if (sol.status === 'no_solution' || sol.status === 'non_unique') {
      return { status: sol.status, method: 'linear', rank: sol.rank };
    }
    const P = sol.x.map((v, j) => v * s[j]);
    const out = finalize(model, values, P, { tol: tolLinear, markets: MARKET_IDS, method: 'linear', extra: { cond: sol.cond } });
    if (sol.status === 'ill_conditioned' && HAS_PRICES.has(out.status)) out.status = 'ill_conditioned';
    // 非線性項在測試點量級太小而被判為線性時，代回核對會失敗：改用數值求解確認。
    if (out.status !== 'residual_fail') return out;
  }

  const found = newton(Zfn, s, [[1, 1, 1], [0.5, 0.5, 0.5], [2, 2, 2], [0.1, 0.1, 0.1], [5, 5, 5]], tolNonlinear, maxIter);
  if (!found) return { status: 'not_found', method: 'newton' };
  return finalize(model, values, found.P, { tol: tolNonlinear, markets: MARKET_IDS, method: 'newton', extra: { iterations: found.iterations } });
}

// ---------- 單市場模式 ----------

/** 其他兩個價格固定，只求 market 的交點。回傳結果標記 mode:'single'。 */
export function solveSingle(model, values, market, fixed, opts = {}) {
  const { refPrices = null, tolLinear = 1e-9, tolNonlinear = 1e-8, maxIter = 100 } = opts;
  const idx = MARKET_IDS.indexOf(market);
  const base = PRICE_IDS.map((id) => fixed[id]);
  const s = priceScales(refPrices)[idx];
  const mk = MARKETS[market];
  const zf = (p) => {
    const P = base.slice();
    P[idx] = p;
    const env = model.evaluate(values, pricesObj(P));
    const S = env[mk.supply];
    const D = env[mk.demand];
    return { z: S - D, mag: Math.max(Math.abs(S), Math.abs(D)) };
  };
  const extra = { mode: 'single', market, fixed: { ...fixed } };
  const withP = (p) => { const P = base.slice(); P[idx] = p; return P; };

  let linear = null;
  try {
    const z0 = zf(0);
    const z1 = zf(s);
    const slope = (z1.z - z0.z) / s;
    linear = { z0, z1, slope };
    for (const t of [1.7, 0.4]) {
      const zt = zf(t * s);
      const pred = z0.z + slope * t * s;
      if (Math.abs(zt.z - pred) > 1e-8 * Math.max(zt.mag, z0.mag, Math.abs(pred), 1e-300)) { linear = null; break; }
    }
  } catch (e) {
    if (!(e instanceof FormulaError)) throw e;
    linear = null;
  }

  if (linear) {
    const { z0, z1, slope } = linear;
    const mag = Math.max(z0.mag, z1.mag);
    if (Math.abs(slope * s) <= 1e-12 * Math.max(mag, 1e-300)) {
      const zeroNow = mag === 0 || Math.abs(z0.z) <= tolLinear * mag;
      return { status: zeroNow ? 'non_unique' : 'no_solution', method: 'linear', ...extra };
    }
    return finalize(model, values, withP(-z0.z / slope), { tol: tolLinear, markets: [market], method: 'linear', extra });
  }

  // 非線性：Newton（含回溯），失敗時掃描變號區間後二分
  const tryNewton = (p0) => {
    let p = p0;
    let cur;
    try { cur = zf(p); } catch (e) { if (e instanceof FormulaError) return null; throw e; }
    for (let it = 0; it <= maxIter; it++) {
      if (cur.mag === 0 ? cur.z === 0 : Math.abs(cur.z) / cur.mag <= tolNonlinear) return p;
      const h = 1e-6 * Math.max(Math.abs(p), s);
      let d;
      try { d = (zf(p + h).z - cur.z) / h; } catch (e) { if (e instanceof FormulaError) return null; throw e; }
      if (d === 0 || !Number.isFinite(d)) return null;
      const step = -cur.z / d;
      let t = 1;
      let ok = false;
      while (t > 1e-10) {
        try {
          const cand = zf(p + t * step);
          if (Math.abs(cand.z) < Math.abs(cur.z)) { p += t * step; cur = cand; ok = true; break; }
        } catch (e) { if (!(e instanceof FormulaError)) throw e; }
        t /= 2;
      }
      if (!ok) return null;
    }
    return null;
  };
  for (const p0 of [s, 0.5 * s, 2 * s, 0.1 * s]) {
    const p = tryNewton(p0);
    if (p !== null) return finalize(model, values, withP(p), { tol: tolNonlinear, markets: [market], method: 'newton', extra });
  }
  let prev = null;
  for (let i = 0; i <= 400; i++) {
    const p = -10 * s + (20 * s * i) / 400;
    let cur;
    try { cur = { p, z: zf(p).z }; } catch (e) { if (e instanceof FormulaError) { prev = null; continue; } throw e; }
    if (prev && Math.sign(prev.z) !== Math.sign(cur.z)) {
      let lo = prev.p; let hi = cur.p; let zlo = prev.z;
      for (let k = 0; k < 200; k++) {
        const mid = (lo + hi) / 2;
        const zm = zf(mid).z;
        if (Math.sign(zm) === Math.sign(zlo)) { lo = mid; zlo = zm; } else { hi = mid; }
      }
      const out = finalize(model, values, withP((lo + hi) / 2), { tol: tolNonlinear, markets: [market], method: 'bisection', extra });
      if (out.status !== 'residual_fail') return out;
    }
    prev = cur;
  }
  return { status: 'not_found', method: 'newton', ...extra };
}
