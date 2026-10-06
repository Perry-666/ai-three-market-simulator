// 情境：基準情境建立、輸入模式（直接／換算）、區間驗證、JSON 匯出匯入。

import {
  BASELINE_EQUILIBRIUM, COEFFICIENTS, DERIVATIONS, DERIVABLE_PARENTS, FACTORS, FORMULA_META, LEVEL2,
  MARKET_FORMULAS, MARKET_IDS, MODEL_VERSION, PRICE_IDS, REQUIRED_FORMULAS, SEGMENT_FORMULAS, SYMBOLS, VALUE_IDS,
} from './model.js';

export const SCHEMA = 'ai-three-market-simulator/session';
export const SCHEMA_VERSION = 2;
export const VALID_SOURCES = ['observed', 'assumption', 'derived', 'user'];
export const OAT_METHOD = 'oat_baseline_pct_max_abs';

export const clone = (x) => structuredClone(x);

/** 情境內所有符號的數值（不含內生價格）。 */
export function numericValues(scenario) {
  const out = {};
  for (const [id, v] of Object.entries(scenario.values)) out[id] = v.value;
  return out;
}

/** 目前有效的公式集合：換算模式的父層決定式＋中間量＋六條市場式。 */
export function activeFormulas(scenario) {
  const derived = new Set(Object.entries(scenario.modes).filter(([, m]) => m === 'derived').map(([id]) => id));
  const list = [];
  for (const d of scenario.derivations) {
    if (!d.target || derived.has(d.target)) list.push({ id: d.id, expr: d.expr });
  }
  return [...list, ...scenario.formulas.map((f) => ({ id: f.id, expr: f.expr }))];
}

/** 以換算模式輸入的父層，其直接輸入值被鎖定。 */
export function derivedParents(scenario) {
  return Object.entries(scenario.modes).filter(([, m]) => m === 'derived').map(([id]) => id);
}

export function createBaselineScenario() {
  const values = {};
  const ranges = {};
  for (const x of FACTORS) {
    values[x.id] = { value: x.base, source: x.source ?? 'assumption' };
    ranges[x.id] = { low: x.low, high: x.high };
  }
  for (const x of LEVEL2) {
    values[x.id] = { value: x.base, source: 'assumption' };
    ranges[x.id] = { low: x.low, high: x.high };
  }
  for (const c of COEFFICIENTS) values[c.id] = { value: c.value, source: 'assumption' };
  return {
    name: `2027 基準情境（${MODEL_VERSION} 修訂）`,
    formulas: MARKET_FORMULAS.map(({ id, expr }) => ({ id, expr })),
    derivations: DERIVATIONS.map(({ id, target, expr }) => ({ id, target, expr })),
    values: Object.fromEntries(VALUE_IDS.map((id) => [id, values[id]])),
    ranges,
    // 預設「直接設定 Level 1」；切換為 derived 時改由子項換算並鎖定直接輸入。
    modes: Object.fromEntries(DERIVABLE_PARENTS.map((id) => [id, 'direct'])),
  };
}

export function defaultSolverSettings() {
  return {
    mode: 'joint', market: 'H', fixedFrom: 'baseline', fixed: { ...BASELINE_EQUILIBRIUM.P },
    relTol: 1e-8, absTol: 1e-6, maxIter: 100,
  };
}

export function defaultView() {
  return Object.fromEntries(MARKET_IDS.map((m) => [m, { pMax: null, qMax: null, nonNegative: true }]));
}

export function createDefaultSession() {
  const current = createBaselineScenario();
  const baseline = clone(current);
  baseline.name = `基準：${current.name}`;
  return { current, baseline, solver: defaultSolverSettings(), saved: [], view: defaultView() };
}

export function validateInputs(scenario) {
  const errors = [];
  const warnings = [];
  const derived = new Set(derivedParents(scenario));
  for (const x of [...FACTORS, ...LEVEL2]) {
    const v = scenario.values[x.id]?.value;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push({ id: x.id, message: `${x.label} ${x.id} 需要有限數值` });
      continue;
    }
    if (derived.has(x.id)) continue; // 換算模式下由子項決定，不檢查父層區間
    const d = x.domain ?? {};
    if (d.min !== undefined && (d.exclusiveMin ? v <= d.min : v < d.min)) {
      errors.push({ id: x.id, message: `${x.label} ${x.id} 必須${d.exclusiveMin ? '大於' : '大於或等於'} ${d.min}` });
    }
    if (d.max !== undefined && v > d.max) errors.push({ id: x.id, message: `${x.label} ${x.id} 必須小於或等於 ${d.max}` });
    const r = scenario.ranges[x.id];
    if (r && Number.isFinite(r.low) && Number.isFinite(r.high) && !(r.low <= v && v <= r.high)) {
      warnings.push({ id: x.id, message: `${x.id} 的基準 ${v} 不在下限 ${r.low}–上限 ${r.high} 之間，敏感度結果需重新檢視` });
    }
  }
  for (const c of COEFFICIENTS) {
    const v = scenario.values[c.id]?.value;
    if (typeof v !== 'number' || !Number.isFinite(v)) errors.push({ id: c.id, message: `係數 ${c.id} 需要有限數值` });
  }
  return { errors, warnings };
}

/** 百分比變化；基準為 0 或非有限時回傳 null（顯示「不適用」）。 */
export function pctChange(base, next) {
  if (!Number.isFinite(base) || !Number.isFinite(next) || base === 0) return null;
  return ((next - base) / Math.abs(base)) * 100;
}

// ---------- JSON ----------

function exportScenario(s) {
  return {
    name: s.name,
    modelVersion: MODEL_VERSION,
    formulas: s.formulas.map((f) => ({ id: f.id, expr: f.expr, unit: FORMULA_META[f.id]?.unitLabel ?? null })),
    derivations: s.derivations.map((d) => ({ id: d.id, target: d.target, expr: d.expr })),
    modes: { ...s.modes },
    values: Object.fromEntries(Object.entries(s.values).map(([id, v]) => [id, {
      value: v.value,
      source: v.source,
      unit: SYMBOLS[id]?.unitLabel ?? null,
      label: SYMBOLS[id]?.label ?? null,
      level: SYMBOLS[id]?.kind ?? null,
    }])),
    ranges: clone(s.ranges),
  };
}

export { exportScenario };

export function summarizeResult(r) {
  if (!r) return null;
  const out = { status: r.status, method: r.method ?? null };
  if (r.P) out.P = { ...r.P };
  if (r.Q) out.Q = { ...r.Q };
  if (r.residuals) out.residuals = { ...r.residuals };
  if (r.env) {
    out.segments = Object.fromEntries(SEGMENT_FORMULAS.filter((k) => typeof r.env[k] === 'number').map((k) => [k, r.env[k]]));
    out.derivedLevel1 = Object.fromEntries(
      DERIVABLE_PARENTS.filter((k) => typeof r.env[k] === 'number').map((k) => [k, r.env[k]]),
    );
  }
  if (r.mode === 'single') { out.mode = 'single'; out.market = r.market; }
  return out;
}

export function exportSession(session, results = null, sensitivity = null) {
  return {
    schema: SCHEMA,
    version: SCHEMA_VERSION,
    modelVersion: MODEL_VERSION,
    exportedAt: new Date().toISOString(),
    method: OAT_METHOD,
    notice: '2027 單期研究情境；數值為研究假設，非公司或市場觀測資料。敏感度分數＝上下限相對基準變動百分比的最大絕對值，不是機率或變異數占比。',
    solver: clone(session.solver),
    current: exportScenario(session.current),
    baseline: exportScenario(session.baseline),
    results: results ? { current: summarizeResult(results.current), baseline: summarizeResult(results.baseline) } : null,
    sensitivity: sensitivity ? {
      method: OAT_METHOD,
      Q0: sensitivity.Q0,
      level1: sensitivity.level1.map(trimRow),
      level2: sensitivity.level2.map(trimRow),
    } : null,
  };
}

const trimRow = (r) => ({
  id: r.id, label: r.label, unit: r.unitLabel, low: r.low, base: r.base, high: r.high,
  qLow: r.qLow, qHigh: r.qHigh, dLow: r.dLow, dHigh: r.dHigh, score: r.score, rank: r.rank,
  valid: r.valid, parents: r.parents ?? null, condition: r.condition,
});

export class ImportError extends Error {
  constructor(problems) {
    super(problems.join('\n'));
    this.name = 'ImportError';
    this.problems = problems;
  }
}

const describeValue = (v) => (v === undefined ? '未提供' : v === null ? 'null' : typeof v === 'string' ? `「${v}」` : String(v));

function readScenario(raw, label, problems, warnings) {
  if (!raw || typeof raw !== 'object') {
    problems.push(`${label}：缺少情境內容`);
    return null;
  }
  const formulas = [];
  if (!Array.isArray(raw.formulas)) problems.push(`${label}：formulas 必須是陣列`);
  else {
    for (const f of raw.formulas) {
      if (!f || typeof f.id !== 'string' || typeof f.expr !== 'string') { problems.push(`${label}：公式項目需要 id 與 expr`); continue; }
      if (!FORMULA_META[f.id]) { problems.push(`${label}：未知公式「${f.id}」`); continue; }
      formulas.push({ id: f.id, expr: f.expr });
    }
    for (const id of MARKET_FORMULAS.map((x) => x.id)) {
      if (!formulas.some((f) => f.id === id)) problems.push(`${label}：缺少公式「${id}」`);
    }
  }
  const derivations = [];
  const rawDeriv = Array.isArray(raw.derivations) ? raw.derivations : [];
  const byId = new Map(DERIVATIONS.map((d) => [d.id, d]));
  for (const d of rawDeriv) {
    if (!d || !byId.has(d.id) || typeof d.expr !== 'string') { problems.push(`${label}：未知或無效的父層換算「${d?.id}」`); continue; }
    derivations.push({ id: d.id, target: byId.get(d.id).target, expr: d.expr });
  }
  for (const d of DERIVATIONS) if (!derivations.some((x) => x.id === d.id)) derivations.push({ ...d });

  const values = {};
  const rawValues = raw.values && typeof raw.values === 'object' ? raw.values : {};
  for (const id of VALUE_IDS) {
    const v = rawValues[id];
    if (!v || typeof v.value !== 'number' || !Number.isFinite(v.value)) {
      problems.push(`${label}：「${id}」缺少有效數值（目前 ${describeValue(v?.value)}）；不會自動補 0`);
      continue;
    }
    if (!VALID_SOURCES.includes(v.source)) { problems.push(`${label}：「${id}」的來源標記「${v.source}」無效`); continue; }
    values[id] = { value: v.value, source: v.source };
  }
  for (const id of Object.keys(rawValues)) if (!SYMBOLS[id]) warnings.push(`${label}：忽略未知符號「${id}」`);

  const ranges = {};
  for (const x of [...FACTORS, ...LEVEL2]) {
    const r = raw.ranges?.[x.id];
    if (r && Number.isFinite(r.low) && Number.isFinite(r.high)) {
      if (r.low > r.high) problems.push(`${label}：「${x.id}」下限大於上限`);
      ranges[x.id] = { low: r.low, high: r.high };
    } else {
      ranges[x.id] = { low: x.low, high: x.high };
      if (r) warnings.push(`${label}：「${x.id}」的區間無效，改用模型預設`);
    }
  }
  const modes = {};
  for (const id of DERIVABLE_PARENTS) {
    const m = raw.modes?.[id];
    modes[id] = m === 'derived' ? 'derived' : 'direct';
    if (m && m !== 'direct' && m !== 'derived') problems.push(`${label}：「${id}」的輸入模式「${m}」無效`);
  }
  return { name: typeof raw.name === 'string' ? raw.name : label, formulas, derivations, values, ranges, modes };
}

function readSolver(raw, problems) {
  const s = defaultSolverSettings();
  if (!raw || typeof raw !== 'object') return s;
  if (raw.mode !== undefined) { if (['joint', 'single'].includes(raw.mode)) s.mode = raw.mode; else problems.push(`solver.mode 無效：${raw.mode}`); }
  if (raw.market !== undefined) { if (MARKET_IDS.includes(raw.market)) s.market = raw.market; else problems.push(`solver.market 無效：${raw.market}`); }
  if (raw.fixedFrom !== undefined) { if (['baseline', 'user'].includes(raw.fixedFrom)) s.fixedFrom = raw.fixedFrom; else problems.push(`solver.fixedFrom 無效：${raw.fixedFrom}`); }
  if (raw.fixed !== undefined) {
    for (const id of PRICE_IDS) {
      if (typeof raw.fixed?.[id] === 'number' && Number.isFinite(raw.fixed[id])) s.fixed[id] = raw.fixed[id];
      else problems.push(`solver.fixed.${id} 需要有限數值`);
    }
  }
  for (const key of ['relTol', 'absTol']) {
    if (raw[key] !== undefined) { if (typeof raw[key] === 'number' && raw[key] > 0 && raw[key] < 1) s[key] = raw[key]; else problems.push(`solver.${key} 需介於 0 與 1`); }
  }
  if (raw.maxIter !== undefined) { if (Number.isInteger(raw.maxIter) && raw.maxIter >= 1 && raw.maxIter <= 1000) s.maxIter = raw.maxIter; else problems.push('solver.maxIter 需為 1–1000 的整數'); }
  return s;
}

export function importSession(input) {
  let obj = input;
  if (typeof input === 'string') {
    try { obj = JSON.parse(input); } catch { throw new ImportError(['檔案不是有效的 JSON']); }
  }
  const problems = [];
  const warnings = [];
  if (!obj || obj.schema !== SCHEMA) problems.push(`schema 必須為「${SCHEMA}」`);
  if (obj?.version !== SCHEMA_VERSION) problems.push(`version 必須為 ${SCHEMA_VERSION}（本版模型 ${MODEL_VERSION}）；舊版檔案的模型不相容，需重新建立情境`);
  const current = readScenario(obj?.current, 'current（新情境）', problems, warnings);
  const baseline = readScenario(obj?.baseline, 'baseline（基準）', problems, warnings);
  const solver = readSolver(obj?.solver, problems);
  if (problems.length) throw new ImportError(problems);
  return { session: { current, baseline, solver, saved: [], view: defaultView() }, expected: obj.results ?? null, warnings };
}

export function importScenario(raw, label = '情境') {
  const problems = [];
  const scenario = readScenario(raw, label, problems, []);
  if (problems.length) throw new ImportError(problems);
  return scenario;
}

export function compareResults(expected, actual, relTol = 1e-6) {
  const diffs = [];
  if (!expected) return diffs;
  for (const which of ['current', 'baseline']) {
    const e = expected[which];
    const a = summarizeResult(actual[which]);
    if (!e || !a) continue;
    if (e.status !== a.status) diffs.push(`${which} 狀態：檔案 ${e.status}，重算 ${a.status}`);
    for (const group of ['P', 'Q']) {
      for (const [k, ev] of Object.entries(e[group] ?? {})) {
        const av = a[group]?.[k];
        if (typeof ev !== 'number' || typeof av !== 'number') continue;
        const rel = Math.abs(ev - av) / Math.max(Math.abs(ev), Math.abs(av), 1e-300);
        if (rel > relTol) diffs.push(`${which} ${group}.${k}：檔案 ${ev}，重算 ${av}`);
      }
    }
  }
  return diffs;
}

export { REQUIRED_FORMULAS };
