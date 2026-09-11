// 工作階段狀態轉換與計算協調（與 UI 無關，可單元測試）。

import { compileFormulas } from './compile.js';
import { FormulaError } from './parser.js';
import { solveJoint, solveSingle } from './solver.js';
import { checkFormulaUnits } from './units.js';
import { CALIBRATION, COEFFICIENTS, DEFAULT_EXPR, FACTORS, FORMULA_META, unitOfSymbol } from './model.js';
import { clone, createDefaultSession, numericValues, validateInputs } from './scenario.js';

/** 可以畫出「目前情境」曲線的狀態；其他狀態保留最後有效圖表並標示過期。 */
export const DISPLAYABLE = new Set(['valid', 'out_of_range', 'ill_conditioned']);

export function checkUnits(scenario, model) {
  const out = {};
  for (const f of scenario.formulas) {
    const c = model.formulas.get(f.id);
    if (!c?.ast || !FORMULA_META[f.id]) continue;
    out[f.id] = checkFormulaUnits(c.ast, FORMULA_META[f.id].unit, unitOfSymbol, f.expr);
  }
  return out;
}

export function computeScenario(scenario, solver, { refPrices = CALIBRATION.prices, fixed = null } = {}) {
  const model = compileFormulas(scenario.formulas);
  const units = checkUnits(scenario, model);
  if (!model.ok) return { status: 'formula_error', errors: model.errors, units, model: null };

  const input = validateInputs(scenario);
  if (input.errors.length) return { status: 'input_error', inputErrors: input.errors, warnings: input.warnings, units, model };

  const values = numericValues(scenario);
  // 先在參考價格試算一次：除以零、非有限值等錯誤直接指出位置，不進入求解。
  try {
    model.evaluate(values, fixed ?? refPrices);
  } catch (e) {
    if (e instanceof FormulaError) return { status: 'formula_error', errors: [e], units, warnings: input.warnings, model };
    throw e;
  }

  const opts = { refPrices, tolLinear: solver.tolLinear, tolNonlinear: solver.tolNonlinear, maxIter: solver.maxIter };
  const result = solver.mode === 'single'
    ? solveSingle(model, values, solver.market, fixed, opts)
    : solveJoint(model, values, opts);
  return { ...result, units, warnings: input.warnings, model, values };
}

export function computeSession(session) {
  const s = session.solver;
  const joint = { ...s, mode: 'joint' };
  const baselineJoint = computeScenario(session.baseline, joint, { refPrices: CALIBRATION.prices });
  const refPrices = DISPLAYABLE.has(baselineJoint.status) ? baselineJoint.P : CALIBRATION.prices;

  if (s.mode !== 'single') {
    return { mode: 'joint', baseline: baselineJoint, current: computeScenario(session.current, joint, { refPrices }), baselineJoint };
  }
  const fixed = s.fixedFrom === 'baseline' && DISPLAYABLE.has(baselineJoint.status) ? { ...baselineJoint.P } : { ...s.fixed };
  const single = { ...s, mode: 'single' };
  return {
    mode: 'single',
    fixed,
    baselineJoint,
    baseline: computeScenario(session.baseline, single, { refPrices, fixed }),
    current: computeScenario(session.current, single, { refPrices, fixed }),
  };
}

/** 決定圖表要顯示哪一組結果：目前結果可顯示就用它，否則沿用最後有效結果並標示過期。 */
export function resolveDisplay(lastValid, computed) {
  if (DISPLAYABLE.has(computed.current.status)) {
    return { shown: computed, stale: false, lastValid: computed.current.status === 'valid' ? computed : lastValid };
  }
  return { shown: lastValid, stale: Boolean(lastValid), lastValid };
}

// ---------- 狀態轉換（皆回傳新物件） ----------

export function setValue(session, id, value) {
  const next = clone(session);
  next.current.values[id] = { value, source: 'user' };
  return next;
}

export function setFormula(session, id, expr) {
  const next = clone(session);
  const f = next.current.formulas.find((x) => x.id === id);
  if (f) f.expr = expr;
  return next;
}

export function resetFormula(session, id) {
  return setFormula(session, id, DEFAULT_EXPR[id]);
}

export function resetAllFormulas(session) {
  const next = clone(session);
  for (const f of next.current.formulas) f.expr = DEFAULT_EXPR[f.id];
  return next;
}

export function resetCurrent(session) {
  const next = clone(session);
  const name = next.current.name;
  next.current = clone(session.baseline);
  next.current.name = name.startsWith('基準：') ? name.slice(3) : name;
  return next;
}

function resetGroup(session, ids) {
  const next = clone(session);
  for (const id of ids) next.current.values[id] = clone(session.baseline.values[id]);
  return next;
}

export const resetCoefficients = (session) => resetGroup(session, COEFFICIENTS.map((c) => c.id));
export const resetFactors = (session) => resetGroup(session, FACTORS.map((f) => f.id));

export function saveAsBaseline(session) {
  const next = clone(session);
  next.baseline = clone(session.current);
  next.baseline.name = `基準：${session.current.name.replace(/^基準：/, '')}`;
  return next;
}

export function restoreDefaults(session) {
  const fresh = createDefaultSession();
  fresh.saved = clone(session?.saved ?? []);
  return fresh;
}

export function duplicateScenario(session, name) {
  const next = clone(session);
  next.saved.push({ name, scenario: clone(session.current), savedAt: new Date().toISOString() });
  return next;
}

export function loadSaved(session, index) {
  const next = clone(session);
  const item = session.saved[index];
  if (item) { next.current = clone(item.scenario); next.current.name = item.name; }
  return next;
}

export function deleteSaved(session, index) {
  const next = clone(session);
  next.saved.splice(index, 1);
  return next;
}

export function setSolver(session, patch) {
  const next = clone(session);
  next.solver = { ...next.solver, ...patch };
  return next;
}
