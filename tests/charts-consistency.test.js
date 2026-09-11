import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultSession } from '../src/engine/scenario.js';
import { computeSession, setValue } from '../src/engine/session.js';
import { curveAt, sampleCurve } from '../src/engine/analysis.js';
import { MARKET_IDS, MARKETS } from '../src/engine/model.js';
import { relClose } from './helpers.js';

test('R05：各圖曲線在均衡價交於聯立結果；基準／新曲線各用自己的跨市場價格', () => {
  const s = setValue(setValue(createDefaultSession(), 'r', 6), 'M', 70000);
  const r = computeSession(s);
  assert.equal(r.current.status, 'valid');
  for (const which of ['baseline', 'current']) {
    const res = r[which];
    for (const m of MARKET_IDS) {
      const P = res.P[MARKETS[m].price];
      const pt = curveAt(res.model, res.values, m, res.P, P);
      assert.ok(relClose(pt.S, res.Q[m], 1e-9), `${which} ${m} 供給線過均衡點`);
      assert.ok(relClose(pt.D, res.Q[m], 1e-9), `${which} ${m} 需求線過均衡點`);
    }
  }
  // 若新情境曲線誤用基準的跨市場價格，交點將不等於聯立結果
  const wrong = curveAt(r.current.model, r.current.values, 'H', r.baseline.P, r.current.P.P_H);
  assert.ok(!relClose(wrong.S - wrong.D, 0, 1e-6) || !relClose(wrong.D, r.current.Q.H, 1e-6));
});

test('曲線取樣不裁切負值', () => {
  const r = computeSession(createDefaultSession());
  const pts = sampleCurve(r.current.model, r.current.values, 'H', r.current.P, [0, 40000], 50);
  assert.equal(pts.length, 50);
  assert.ok(pts.some((p) => p.D < 0), '高價區需求為負仍保留原值（圖表只做視覺裁切）');
});
