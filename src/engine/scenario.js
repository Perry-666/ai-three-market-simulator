// 情境：示範情境建立、輸入驗證、JSON 匯出匯入、變化百分比。

import {
  FACTORS, COEFFICIENTS, SYMBOLS, VALUE_IDS, DEFAULT_FORMULAS, FORMULA_META, REQUIRED_FORMULAS,
  CALIBRATION, MARKET_IDS, PRICE_IDS, SEGMENT_FORMULAS,
} from './model.js';
import { compileFormulas } from './compile.js';
import { calibrateIntercepts } from './calibrate.js';

export const SCHEMA = 'ai-three-market-simulator/session';
export const SCHEMA_VERSION = 1;
export const VALID_SOURCES = ['observed', 'assumption', 'calibrated', 'user'];

export const clone = (x) => structuredClone(x);

export function numericValues(scenario) {
  const out = {};
  for (const [id, v] of Object.entries(scenario.values)) out[id] = v.value;
  return out;
}

export function createDemoScenario() {
  const values = {};
  for (const f of FACTORS) values[f.id] = { value: f.demo, source: f.source };
  for (const c of COEFFICIENTS) if (c.coefKind !== 'intercept') values[c.id] = { value: c.demo, source: 'assumption' };
  const formulas = DEFAULT_FORMULAS.map(({ id, expr }) => ({ id, expr }));
  const model = compileFormulas(formulas);
  const intercepts = calibrateIntercepts(model, numericValues({ values }));
  for (const [id, v] of Object.entries(intercepts)) values[id] = { value: v, source: 'calibrated' };
  const ordered = Object.fromEntries(VALUE_IDS.map((id) => [id, values[id]]));
  return { name: '示範情境（假設值）', formulas, values: ordered };
}

export function defaultSolverSettings() {
  return {
    mode: 'joint', market: 'H', fixedFrom: 'baseline', fixed: { ...CALIBRATION.prices },
    tolLinear: 1e-9, tolNonlinear: 1e-8, maxIter: 100,
  };
}

export function defaultView() {
  return Object.fromEntries(MARKET_IDS.map((m) => [m, { pMax: null, qMax: null, nonNegative: true }]));
}

export function createDefaultSession() {
  const current = createDemoScenario();
  const baseline = clone(current);
  baseline.name = '基準：示範情境';
  return { current, baseline, solver: defaultSolverSettings(), saved: [], view: defaultView() };
}

export function validateInputs(scenario) {
  const errors = [];
  const warnings = [];
  for (const f of FACTORS) {
    const v = scenario.values[f.id]?.value;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push({ id: f.id, message: `${f.label} ${f.id} 需要有限數值` });
      continue;
    }
    const d = f.domain;
    if (d.min !== undefined && (d.exclusiveMin ? v <= d.min : v < d.min)) {
      errors.push({ id: f.id, message: `${f.label} ${f.id} 必須${d.exclusiveMin ? '大於' : '大於或等於'} ${d.min}` });
    }
    if (d.max !== undefined && v > d.max) {
      errors.push({ id: f.id, message: `${f.label} ${f.id} 必須小於或等於 ${d.max}` });
    }
  }
  for (const c of COEFFICIENTS) {
    const v = scenario.values[c.id]?.value;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push({ id: c.id, message: `係數 ${c.id} 需要有限數值` });
      continue;
    }
    if (c.coefKind === 'slope' && v <= 0) warnings.push({ id: c.id, message: `${c.id} 應為正數（第 04 頁：b、d 為正數）` });
    if (c.coefKind === 'k' && v < 0) warnings.push({ id: c.id, message: `${c.id} 應為非負數（第 04 頁：k 為非負數）` });
  }
  return { errors, warnings };
}

/** 百分比變化；基準為 0 或非有限時回傳 null（顯示「不適用」）。 */
export function pctChange(base, next) {
  if (!Number.isFinite(base) || !Number.isFinite(next) || base === 0) return null;
  return ((next - base) / Math.abs(base)) * 100;
}

// ---------- JSON ----------

export function importScenario(raw, label = '情境') {
  const problems = [];
  const scenario = readScenario(raw, label, problems, []);
  if (problems.length) throw new ImportError(problems);
  return scenario;
}

export function exportScenario(s) {
  return {
    name: s.name,
    formulas: s.formulas.map((f) => ({
      id: f.id, expr: f.expr, unit: FORMULA_META[f.id]?.unit ?? null, label: FORMULA_META[f.id]?.label ?? null,
    })),
    values: Object.fromEntries(Object.entries(s.values).map(([id, v]) => [id, {
      value: v.value,
      source: v.source,
      unit: SYMBOLS[id]?.unit ?? null,
      label: SYMBOLS[id]?.label ?? null,
      pending: SYMBOLS[id]?.pending ?? false,
    }])),
  };
}

export function summarizeResult(r) {
  if (!r) return null;
  const out = { status: r.status, method: r.method ?? null };
  if (r.P) out.P = { ...r.P };
  if (r.Q) out.Q = { ...r.Q };
  if (r.residuals) out.residuals = { ...r.residuals };
  if (r.env) out.segments = Object.fromEntries(SEGMENT_FORMULAS.filter((k) => typeof r.env[k] === 'number').map((k) => [k, r.env[k]]));
  if (r.mode === 'single') { out.mode = 'single'; out.market = r.market; }
  return out;
}

export function exportSession(session, results = null) {
  return {
    schema: SCHEMA,
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    notice: '示範數值為假設，非市場估計；係數尚未實證估計；投入產出數量一致性尚未施加。source：observed＝來源觀測值、assumption＝示範假設、calibrated＝示範校準反推、user＝使用者輸入。',
    solver: clone(session.solver),
    current: exportScenario(session.current),
    baseline: exportScenario(session.baseline),
    results: results ? { current: summarizeResult(results.current), baseline: summarizeResult(results.baseline) } : null,
  };
}

export class ImportError extends Error {
  constructor(problems) {
    super(problems.join('\n'));
    this.name = 'ImportError';
    this.problems = problems;
  }
}

function describeValue(v) {
  if (v === undefined) return '未提供';
  if (v === null) return 'null';
  if (typeof v === 'string') return `「${v}」`;
  return String(v);
}

function readScenario(raw, label, problems, warnings) {
  if (!raw || typeof raw !== 'object') {
    problems.push(`${label}：缺少情境內容`);
    return null;
  }
  const formulas = [];
  if (!Array.isArray(raw.formulas)) {
    problems.push(`${label}：formulas 必須是陣列`);
  } else {
    for (const f of raw.formulas) {
      if (!f || typeof f.id !== 'string' || typeof f.expr !== 'string') {
        problems.push(`${label}：公式項目需要 id 與 expr 字串`);
        continue;
      }
      if (!FORMULA_META[f.id]) { problems.push(`${label}：未知公式「${f.id}」`); continue; }
      if (f.unit && f.unit !== FORMULA_META[f.id].unit) warnings.push(`${label}：公式 ${f.id} 的單位「${f.unit}」與模型宣告「${FORMULA_META[f.id].unit}」不同，採用模型宣告`);
      formulas.push({ id: f.id, expr: f.expr });
    }
    for (const id of [...REQUIRED_FORMULAS, 'c_elec', ...SEGMENT_FORMULAS]) {
      if (!formulas.some((f) => f.id === id)) problems.push(`${label}：缺少公式「${id}」`);
    }
  }
  const values = {};
  const rawValues = raw.values && typeof raw.values === 'object' ? raw.values : {};
  for (const id of VALUE_IDS) {
    const v = rawValues[id];
    if (!v || typeof v.value !== 'number' || !Number.isFinite(v.value)) {
      problems.push(`${label}：「${id}」缺少有效數值（目前 ${describeValue(v?.value)}）；不會自動補 0`);
      continue;
    }
    if (!VALID_SOURCES.includes(v.source)) {
      problems.push(`${label}：「${id}」的來源標記「${v.source}」無效（允許 ${VALID_SOURCES.join('、')}）`);
      continue;
    }
    if (v.unit && v.unit !== SYMBOLS[id].unit) warnings.push(`${label}：「${id}」的單位「${v.unit}」與模型宣告「${SYMBOLS[id].unit}」不同，採用模型宣告`);
    values[id] = { value: v.value, source: v.source };
  }
  for (const id of Object.keys(rawValues)) if (!SYMBOLS[id]) warnings.push(`${label}：忽略未知符號「${id}」`);
  return { name: typeof raw.name === 'string' ? raw.name : label, formulas, values };
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
  for (const key of ['tolLinear', 'tolNonlinear']) {
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
  if (obj?.version !== SCHEMA_VERSION) problems.push(`version 必須為 ${SCHEMA_VERSION}`);
  const current = readScenario(obj?.current, 'current（新情境）', problems, warnings);
  const baseline = readScenario(obj?.baseline, 'baseline（基準）', problems, warnings);
  const solver = readSolver(obj?.solver, problems);
  if (problems.length) throw new ImportError(problems);
  return { session: { current, baseline, solver, saved: [], view: defaultView() }, expected: obj.results ?? null, warnings };
}

/** 比對匯入檔的結果摘要與重新求解的結果；回傳差異說明陣列。 */
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
