import { compileFormulas } from '../src/engine/compile.js';
import { DEFAULT_FORMULAS } from '../src/engine/model.js';
import { createDemoScenario, numericValues } from '../src/engine/scenario.js';

export function demo() {
  const scenario = createDemoScenario();
  return { scenario, model: compileFormulas(scenario.formulas), values: numericValues(scenario) };
}

export function formulasWith(patch) {
  return DEFAULT_FORMULAS.map((f) => ({ id: f.id, expr: patch[f.id] ?? f.expr }));
}

export function relClose(a, b, tol = 1e-9) {
  return Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1e-300);
}
