import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endpointScore, runSensitivity, scanRange } from '../src/engine/sensitivity.js';
import { createBaselineScenario, defaultSolverSettings } from '../src/engine/scenario.js';
import { FACTORS, LEVEL2 } from '../src/engine/model.js';

const scenario = createBaselineScenario();
const solver = defaultSolverSettings();
const run = runSensitivity(scenario, solver);
const byId = (rows, id) => rows.find((r) => r.id === id);

test('R13：Level 1 分數與 Notion 05 §4 一致', () => {
  assert.equal(run.ok, true);
  assert.equal(run.Q0, 8000000000);
  assert.equal(run.solves, 205);
  const want = {
    a: 12.7118644, K_C: 3.0, L: 2.6470588, N: 1.7647059, A_C: 1.6544118,
    R_E: 1.4117647, g_Y: 1.4117647, D_R: 1.2941176, g_H: 1.1029412, L_D: 0.9882353,
    r: 0.8470588, h: 0.7352941, O_C: 0.6617647, c: 0.4411765, e: 0.0882353, C_M: 0.0044118,
  };
  for (const [id, exp] of Object.entries(want)) {
    const row = byId(run.level1, id);
    assert.ok(Math.abs(row.score - exp) < 1e-6, `${id}: ${row.score} ≠ ${exp}`);
  }
});

test('R13：Level 2 分數與 Notion 05 §5 一致', () => {
  const want = {
    reasoning: 12.7118644, context: 10.1078167, saving: 9.1143151, compat: 5.0, export_cov: 3.3088235,
    n_stock: 3.225, l_grid: 1.9852941, ready: 1.6666667, tau_E: 1.5882353, eta_work: 1.4338235,
    l_build: 1.3235294, eta_net: 1.0427807, share_AI: 0.9411765, C_Pm: 0.8451666, w: 0.0044118,
  };
  for (const [id, exp] of Object.entries(want)) {
    const row = byId(run.level2, id);
    assert.ok(Math.abs(row.score - exp) < 1e-6, `${id}: ${row.score} ≠ ${exp}`);
  }
});

test('名次由數值決定、容差內並列，Level 1 與 Level 2 分開排名', () => {
  assert.deepEqual(run.level1.slice(0, 5).map((r) => r.id), ['a', 'K_C', 'L', 'N', 'A_C']);
  assert.deepEqual(run.level1.slice(0, 5).map((r) => r.rank), [1, 2, 3, 4, 5]);
  assert.deepEqual(run.level2.slice(0, 3).map((r) => r.id), ['reasoning', 'context', 'saving']);
  // R_E 與 g_Y 同分並列第 6，下一名為第 8
  assert.equal(byId(run.level1, 'R_E').rank, 6);
  assert.equal(byId(run.level1, 'g_Y').rank, 6);
  assert.equal(byId(run.level1, 'D_R').rank, 8);
  assert.equal(run.level1.length, FACTORS.length);
  assert.equal(run.level2.length, LEVEL2.length);
});

test('方向保留正負號；下限不必然為負向', () => {
  const a = byId(run.level1, 'a');
  assert.ok(a.dLow < 0 && a.dHigh > 0);
  const L = byId(run.level1, 'L');
  assert.ok(L.dLow > 0 && L.dHigh < 0, '建置時間縮短使算力增加');
  const saving = byId(run.level2, 'saving');
  assert.ok(saving.dLow > 0 && saving.dHigh < 0);
});

test('R15：分數為兩端點變動的最大絕對值，不是相減', () => {
  const s = endpointScore(40, 38, 41);
  assert.equal(s.dLow, -5);
  assert.equal(s.dHigh, 2.5);
  assert.equal(s.score, 5);
  assert.equal(endpointScore(0, 1, 2), null, 'Q₀＝0 時百分比不適用');
  assert.equal(endpointScore(40, NaN, 41), null);
});

test('R15：缺區間不排名，不補零', () => {
  const broken = createBaselineScenario();
  delete broken.ranges.N;
  const r = runSensitivity(broken, solver);
  const row = byId(r.level1, 'N');
  assert.equal(row.valid, false);
  assert.equal(row.rank, null);
  assert.match(row.note, /缺區間/);
  assert.equal(row.score, -1);
  assert.ok(byId(r.level1, 'a').valid, '其他因素仍可排名');
});

test('基準求解失敗時不排名', () => {
  const broken = createBaselineScenario();
  broken.values.b_H = { value: 0, source: 'user' };
  broken.values.d_H = { value: 0, source: 'user' };
  broken.values.k_HC = { value: 0, source: 'user' };
  const r = runSensitivity(broken, solver);
  assert.equal(r.ok, false);
  assert.equal(r.Q0, null);
  assert.match(r.message, /不進行排名/);
});

test('區間掃描：21 點、偵測非單調', () => {
  const scan = scanRange(scenario, solver, 'a');
  assert.equal(scan.points.length, 21);
  assert.ok(scan.points.every((p) => p.status === 'valid'));
  assert.equal(scan.nonMonotonic, false);
  assert.ok(Math.abs(scan.points[0].pct + 12.7118644) < 1e-6);
});

test('每個因素都從同一基準出發，不累積前一次變動', () => {
  const again = runSensitivity(scenario, solver);
  assert.equal(again.Q0, run.Q0);
  for (const r of again.level1) assert.equal(r.score, byId(run.level1, r.id).score);
});
