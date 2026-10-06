import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DERIVABLE_PARENTS, FACTOR_BY_ID, LEVEL2 } from '../src/engine/model.js';
import { createBaselineScenario } from '../src/engine/scenario.js';
import { relClose, solveWithValues } from './helpers.js';

const allDerived = Object.fromEntries(DERIVABLE_PARENTS.map((id) => [id, 'derived']));

test('全部父層改用換算式時，基準子項仍重現 Level 1 基準值與同一均衡', () => {
  const r = solveWithValues({}, { modes: allDerived });
  assert.equal(r.status, 'valid');
  for (const id of DERIVABLE_PARENTS) {
    assert.ok(relClose(r.env[id], FACTOR_BY_ID[id].base, 1e-9), `${id}: 換算 ${r.env[id]} ≠ 基準 ${FACTOR_BY_ID[id].base}`);
  }
  assert.ok(relClose(r.Q.C, 8000000000, 1e-9));
  assert.ok(relClose(r.P.P_C, 5, 1e-9));
});

test('R14：τ_E＝1 時 v_E＝9.75，不截回父層區間上限 5', () => {
  const r = solveWithValues({ tau_E: 1 }, { modes: { v_E: 'derived' } });
  assert.equal(r.status, 'valid');
  assert.ok(relClose(r.env.v_E, 9.75, 1e-12), `v_E=${r.env.v_E}`);
  assert.ok(r.Q.C > 8000000000);
});

test('R14：ℓ_grid＝36 時 L＝33，硬體需求與算力供給同時更新', () => {
  const base = solveWithValues({}, { modes: { L: 'derived' } });
  const r = solveWithValues({ l_grid: 36 }, { modes: { L: 'derived' } });
  assert.ok(relClose(r.env.L, 33, 1e-12), `L=${r.env.L}`);
  assert.ok(r.env.H_d < base.env.H_d, '硬體需求左移');
  assert.ok(r.env.C_s < base.env.C_s, '算力供給左移');
});

test('R14：下一項測試重置基準，前一次變動不累積', () => {
  solveWithValues({ tau_E: 1 }, { modes: { v_E: 'derived' } });
  const r = solveWithValues({}, { modes: { v_E: 'derived' } });
  assert.ok(relClose(r.env.v_E, 3, 1e-12));
  assert.ok(relClose(r.Q.C, 8000000000, 1e-9));
});

test('R19：台積電投資未量產時不計入當年，已形成能力仍保留', () => {
  const modes = { N: 'derived' };
  const base = solveWithValues({}, { modes });
  assert.ok(relClose(base.env.N, 250000, 1e-9));
  assert.ok(relClose(base.env.G_F, 6912000, 1e-9), `G_F=${base.env.G_F}`);
  assert.ok(relClose(base.env.G_P, 4104000, 1e-9), `G_P=${base.env.G_P}`);

  const late = solveWithValues({ lag_F: 4 }, { modes });
  assert.equal(late.env.J_F, 0);
  assert.ok(late.env.N < base.env.N, '未量產 → 交付能力下降');
  // 與直接把 C_Fm 降到 8,000（移除同一批投資形成的 2,000 片）結果相同
  const removed = solveWithValues({ C_Fm: 8000 }, { modes });
  assert.ok(relClose(late.env.N, removed.env.N, 1e-9));

  const early = solveWithValues({ lag_F: 2 }, { modes });
  assert.ok(relClose(early.env.N, base.env.N, 1e-12), 'ℓ≤3 都已量產，結果與基準相同');

  const moreCapex = solveWithValues({ I_F: 130 }, { modes });
  assert.ok(moreCapex.env.N > base.env.N, 'CapEx 增加且已量產 → N 上升');
});

test('同一子項更新全部父層：m_hbm 同時改 c、h、epsilon', () => {
  const modes = { c: 'derived', h: 'derived', epsilon: 'derived' };
  const base = solveWithValues({}, { modes });
  const r = solveWithValues({ m_hbm: 120 }, { modes });
  assert.ok(r.env.c > base.env.c, 'HBM 容量增加提高採購成本');
  assert.ok(r.env.h > base.env.h, '同時提高有效效能');
  assert.ok(r.env.epsilon < base.env.epsilon, 'epsilon＝power/h 隨 h 下降');
});

test('父層換算式與 Level 1 直接輸入互斥：derived 模式鎖定直接輸入', () => {
  const r = solveWithValues({ K_C: 1 }, { modes: { K_C: 'derived' } });
  assert.ok(relClose(r.env.K_C, 1000000, 1e-9), '換算模式忽略直接輸入值');
});

test('每個 Level 2 都能獨立改變均衡（換算式確實接上）', () => {
  const base = solveWithValues({});
  for (const s of LEVEL2) {
    const scenario = createBaselineScenario();
    const r = solveWithValues({ [s.id]: s.high }, { modes: Object.fromEntries(s.parents.map((p) => [p, 'derived'])), scenario });
    assert.equal(r.status, 'valid', `${s.id}: ${r.status}`);
    if (s.id === 'lag_F' || s.id === 'lag_P') continue; // 上限代表尚未量產，另見專屬測試
    assert.notEqual(r.Q.C, base.Q.C, `${s.id} 取上限後均衡未改變`);
  }
});
