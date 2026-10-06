import { createBaselineScenario, defaultSolverSettings, numericValues } from '../src/engine/scenario.js';
import { compileScenario, computeScenario } from '../src/engine/session.js';

export function baseline() {
  const scenario = createBaselineScenario();
  return { scenario, solver: defaultSolverSettings(), model: compileScenario(scenario), values: numericValues(scenario) };
}

export function solveBaseline() {
  const { scenario, solver } = baseline();
  return computeScenario(scenario, solver);
}

/** 以指定因素值求解（Level 2 需自行切換父層模式）。 */
export function solveWithValues(patch = {}, { modes = {}, scenario: input = null } = {}) {
  const scenario = input ?? createBaselineScenario();
  for (const [id, value] of Object.entries(patch)) scenario.values[id] = { value, source: 'user' };
  for (const [id, mode] of Object.entries(modes)) scenario.modes[id] = mode;
  return computeScenario(scenario, defaultSolverSettings());
}

export function relClose(a, b, tol = 1e-9) {
  return Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1e-300);
}

export const pct = (q, q0) => ((q - q0) / q0) * 100;
