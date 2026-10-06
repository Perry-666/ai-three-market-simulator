// 單因素端點敏感度（Notion 05 §2、06 §5）：
// 1. 同一基準快照求 Q₀；2. 每次只改一個因素到下限或上限（Level 2 先更新父層）；
// 3. δ＝100×(Q−Q₀)/Q₀；4. 分數 S＝max(|δ下|,|δ上|)，未四捨五入值降序，容差內並列；
// 5. Level 1 與 Level 2 分開排名。分數不是機率或變異數占比，不加總。

import { BASELINE_EQUILIBRIUM, FACTORS, LEVEL2, MARKETS } from './model.js';
import { clone } from './scenario.js';
import { computeScenario, DISPLAYABLE } from './session.js';

export const METHOD = 'oat_baseline_pct_max_abs';
const TIE_TOLERANCE = 1e-12;

/** 端點分數：S＝max(|δ下|,|δ上|)，δ＝100×(Q−Q₀)/Q₀。Q₀＝0 時回傳 null。 */
export function endpointScore(Q0, qLow, qHigh) {
  if (!Number.isFinite(Q0) || Q0 === 0 || !Number.isFinite(qLow) || !Number.isFinite(qHigh)) return null;
  const dLow = ((qLow - Q0) / Q0) * 100;
  const dHigh = ((qHigh - Q0) / Q0) * 100;
  return { dLow, dHigh, score: Math.max(Math.abs(dLow), Math.abs(dHigh)) };
}

const quantityOf = (result) => (result && DISPLAYABLE.has(result.status) ? result.Q?.C : null);

function solveWith(scenario, solver, refPrices) {
  const r = computeScenario(scenario, { ...solver, mode: 'joint' }, { refPrices });
  return { q: quantityOf(r), status: r.status, result: r };
}

/** 一次端點試算：改一個因素（Level 2 時強制其父層改用換算式）。 */
function endpointScenario(base, factor, value) {
  const next = clone(base);
  next.values[factor.id] = { value, source: 'user' };
  if (factor.kind === 'level2') {
    for (const p of factor.parents) next.modes[p] = 'derived';
  } else if (next.modes[factor.id] !== undefined) {
    next.modes[factor.id] = 'direct'; // Level 1 直接改父層
  }
  return next;
}

function rankRows(rows) {
  const valid = rows.filter((r) => r.valid).sort((a, b) => b.score - a.score);
  let rank = 0;
  let prev = null;
  valid.forEach((row, i) => {
    if (prev === null || Math.abs(row.score - prev) > TIE_TOLERANCE) rank = i + 1;
    row.rank = rank;
    prev = row.score;
  });
  return rows.sort((a, b) => {
    if (a.valid !== b.valid) return a.valid ? -1 : 1;
    return b.score - a.score;
  });
}

function buildRow(factor, scenario, solver, refPrices, Q0) {
  const range = scenario.ranges[factor.id] ?? {};
  const base = scenario.values[factor.id]?.value;
  const row = {
    id: factor.id,
    label: factor.label,
    level: factor.kind === 'level2' ? 'Level 2' : 'Level 1',
    unitLabel: factor.unitLabel,
    parents: factor.parents ?? null,
    condition: factor.condition ?? null,
    player: factor.player ?? null,
    low: range.low, base, high: range.high,
    qLow: null, qHigh: null, dLow: null, dHigh: null,
    score: -1, rank: null, valid: false, note: null,
  };
  if (!Number.isFinite(range.low) || !Number.isFinite(range.high)) {
    row.note = '缺區間，不排名';
    return row;
  }
  const lo = solveWith(endpointScenario(scenario, factor, range.low), solver, refPrices);
  const hi = solveWith(endpointScenario(scenario, factor, range.high), solver, refPrices);
  row.qLow = lo.q;
  row.qHigh = hi.q;
  row.statusLow = lo.status;
  row.statusHigh = hi.status;
  if (lo.q === null || hi.q === null) {
    row.note = `端點求解不適用（下限 ${lo.status}／上限 ${hi.status}）；不補零、不排名`;
    return row;
  }
  if (!Number.isFinite(Q0) || Q0 === 0) {
    row.note = 'Q₀＝0 或無效，百分比不適用';
    return row;
  }
  Object.assign(row, endpointScore(Q0, lo.q, hi.q));
  row.valid = true;
  return row;
}

/**
 * 跑完整的單因素敏感度（41 個 Level 1＋61 個 Level 2，共 1＋2×102 次求解）。
 * @param scenario 基準快照（係數、截距與父層換算式在同一輪固定）
 */
export function runSensitivity(scenario, solver, { refPrices = null, onProgress = null } = {}) {
  const ref0 = refPrices ?? BASELINE_EQUILIBRIUM.P;
  const baseRun = solveWith(scenario, solver, ref0);
  const Q0 = baseRun.q;
  if (Q0 === null) {
    return { ok: false, Q0: null, status: baseRun.status, method: METHOD, level1: [], level2: [], solves: 1,
      message: `基準求解未通過（${baseRun.status}），不進行排名` };
  }
  const ref = baseRun.result.P ?? ref0;
  const all = [...FACTORS, ...LEVEL2];
  const rows = [];
  all.forEach((factor, i) => {
    rows.push(buildRow(factor, scenario, solver, ref, Q0));
    if (onProgress) onProgress((i + 1) / all.length);
  });
  const level1 = rankRows(rows.filter((r) => r.level === 'Level 1'));
  const level2 = rankRows(rows.filter((r) => r.level === 'Level 2'));
  return {
    ok: true,
    method: METHOD,
    Q0,
    unitLabel: MARKETS.C.qtyLabel,
    level1,
    level2,
    solves: 1 + 2 * all.length,
    computedAt: new Date().toISOString(),
  };
}

/** 區間內 21 等距點掃描：檢查有效性與非單調性（06 §5）。 */
export function scanRange(scenario, solver, factorId, { points = 21, refPrices = null } = {}) {
  const factor = [...FACTORS, ...LEVEL2].find((x) => x.id === factorId);
  if (!factor) return null;
  const range = scenario.ranges[factorId];
  if (!range || !Number.isFinite(range.low) || !Number.isFinite(range.high)) return null;
  const ref0 = refPrices ?? BASELINE_EQUILIBRIUM.P;
  const baseRun = solveWith(scenario, solver, ref0);
  const Q0 = baseRun.q;
  const ref = baseRun.result.P ?? ref0;
  const out = [];
  for (let i = 0; i < points; i++) {
    const x = range.low + ((range.high - range.low) * i) / (points - 1);
    const r = solveWith(endpointScenario(scenario, factor, x), solver, ref);
    out.push({ x, q: r.q, status: r.status, pct: r.q !== null && Q0 ? ((r.q - Q0) / Q0) * 100 : null });
  }
  const valid = out.filter((p) => p.pct !== null);
  const endpoints = [valid[0]?.pct ?? 0, valid[valid.length - 1]?.pct ?? 0];
  const maxInside = Math.max(...valid.map((p) => Math.abs(p.pct)), 0);
  const endpointMax = Math.max(...endpoints.map(Math.abs));
  return {
    factorId, points: out, Q0,
    nonMonotonic: maxInside > endpointMax + 1e-9,
    maxInside, endpointMax,
    note: maxInside > endpointMax + 1e-9 ? '上下限結果不代表整段區間最大偏離' : null,
  };
}
