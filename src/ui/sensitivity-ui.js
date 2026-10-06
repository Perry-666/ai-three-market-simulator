// 單因素敏感度：龍捲風圖、排名表與區間掃描。

import { runSensitivity, scanRange } from '../engine/sensitivity.js';
import { MARKETS } from '../engine/model.js';
import { el, esc, fmtFull, fmtNum, symbolHTML } from './format.js';

const PCT = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(4)}%`);
const SCORE = (v) => (Number.isFinite(v) && v >= 0 ? `${v.toFixed(4)}%` : '—');

export function buildSensitivityPanel(root, ctx) {
  root.innerHTML = `
    <header class="sens-head">
      <div>
        <h2>單因素敏感度</h2>
        <p class="hint">每個因素各自從同一基準出發，只改成下限或上限，重新求三市場均衡；分數＝max(|δ下|,|δ上|)。不是機率或變異數占比，不加總為 100%。</p>
      </div>
      <div class="sens-actions">
        <button type="button" class="primary" data-run>計算敏感度（205 次求解）</button>
        <button type="button" data-csv hidden>匯出 CSV</button>
      </div>
    </header>
    <p class="sens-status" data-status role="status">尚未計算。目前的因素值、區間、係數與公式會一起用於這一輪。</p>
    <div data-result hidden>
      <div class="level-tabs" role="tablist">
        <button type="button" role="tab" data-level="level1" aria-selected="true">Level 1（41）</button>
        <button type="button" role="tab" data-level="level2" aria-selected="false" tabindex="-1">Level 2（61）</button>
        <label class="show-all"><input type="checkbox" data-all> 顯示全部</label>
      </div>
      <div class="tornado" data-tornado></div>
      <div class="table-wrap"><table class="result-table sens-table"><thead><tr>
        <th>名次</th><th>因素</th><th>單位</th><th>下限</th><th>基準</th><th>上限</th>
        <th>Q 下限</th><th>Q 上限</th><th>δ 下限</th><th>δ 上限</th><th>分數</th><th>狀態</th>
      </tr></thead><tbody data-rows></tbody></table></div>
      <div data-scan class="scan-box" hidden></div>
      <p class="foot" data-foot></p>
    </div>`;

  const statusEl = root.querySelector('[data-status]');
  const resultEl = root.querySelector('[data-result]');
  const tornadoEl = root.querySelector('[data-tornado]');
  const rowsEl = root.querySelector('[data-rows]');
  const scanEl = root.querySelector('[data-scan]');
  const footEl = root.querySelector('[data-foot]');
  const csvBtn = root.querySelector('[data-csv]');
  let result = null;
  let level = 'level1';
  let showAll = false;

  root.querySelector('[data-run]').addEventListener('click', run);
  csvBtn.addEventListener('click', () => ctx.action('export-sensitivity-csv', result));
  root.querySelectorAll('[data-level]').forEach((btn) => btn.addEventListener('click', () => {
    level = btn.dataset.level;
    root.querySelectorAll('[data-level]').forEach((b) => {
      b.setAttribute('aria-selected', String(b === btn));
      b.tabIndex = b === btn ? 0 : -1;
    });
    render();
  }));
  root.querySelector('[data-all]').addEventListener('change', (e) => { showAll = e.target.checked; render(); });

  function run() {
    statusEl.textContent = '計算中…（205 次聯立求解）';
    resultEl.hidden = true;
    setTimeout(() => {
      const t0 = performance.now();
      result = runSensitivity(ctx.session.current, ctx.session.solver);
      const ms = Math.round(performance.now() - t0);
      if (!result.ok) {
        statusEl.textContent = `${result.message}。請先讓基準情境求得有效均衡。`;
        ctx.setSensitivity(null);
        return;
      }
      statusEl.innerHTML = `基準 Q₀ ＝ <strong>${fmtNum(result.Q0)}</strong> ${esc(MARKETS.C.qtyLabel)}（${esc(fmtFull(result.Q0))}）｜${result.solves} 次求解｜${ms} ms｜方法 <code>${result.method}</code>`;
      resultEl.hidden = false;
      ctx.setSensitivity(result);
      render();
    }, 20);
  }

  function rows() {
    const list = result?.[level] ?? [];
    return showAll ? list : list.slice(0, 15);
  }

  function renderTornado(list) {
    const scale = Math.max(...list.map((r) => Math.max(Math.abs(r.dLow ?? 0), Math.abs(r.dHigh ?? 0))), 1e-9);
    const half = 46; // 單側百分比寬度
    tornadoEl.innerHTML = `
      <div class="tornado-head"><span>輸入取下限</span><span>0%</span><span>輸入取上限</span></div>
      ${list.map((r) => {
    const lo = ((r.dLow ?? 0) / scale) * half;
    const hi = ((r.dHigh ?? 0) / scale) * half;
    const bar = (v, cls) => (v === 0 ? '' : `<span class="tbar ${cls}" style="left:${(50 + Math.min(v, 0)).toFixed(2)}%;width:${Math.abs(v).toFixed(2)}%"></span>`);
    return `<div class="tornado-row${r.valid ? '' : ' invalid'}" data-id="${esc(r.id)}" title="${esc(r.label)}">
          <span class="t-name">${symbolHTML(r.id)} ${esc(r.label)}</span>
          <span class="t-track">${bar(lo, 'low')}${bar(hi, 'high')}<span class="t-zero"></span></span>
          <span class="t-score">${SCORE(r.score)}</span>
        </div>`;
  }).join('')}
      <p class="t-muted">以 0% 為基準，分別顯示輸入取下限（淺色）與上限（深色）時的均衡算力變動；不假定下限必為負向。點一列檢視區間內曲線。</p>`;
    tornadoEl.querySelectorAll('.tornado-row').forEach((rowEl) => rowEl.addEventListener('click', () => showScan(rowEl.dataset.id)));
  }

  function render() {
    if (!result?.ok) return;
    const list = rows();
    renderTornado(list);
    rowsEl.innerHTML = list.map((r) => `
      <tr class="${r.valid ? '' : 'na'}" data-id="${esc(r.id)}">
        <td>${r.rank ?? '—'}</td>
        <td><span class="sym">${symbolHTML(r.id)}</span> ${esc(r.label)}${r.parents ? `<br><span class="t-muted">→ ${esc(r.parents.join('、'))}</span>` : ''}</td>
        <td class="unit">${esc(r.unitLabel ?? '')}</td>
        <td>${fmtNum(r.low)}</td><td>${fmtNum(r.base)}</td><td>${fmtNum(r.high)}</td>
        <td title="${esc(fmtFull(r.qLow))}">${fmtNum(r.qLow)}</td>
        <td title="${esc(fmtFull(r.qHigh))}">${fmtNum(r.qHigh)}</td>
        <td>${PCT(r.dLow)}</td><td>${PCT(r.dHigh)}</td>
        <td><strong>${SCORE(r.score)}</strong></td>
        <td>${r.valid ? '有效' : esc(r.note ?? '不適用')}</td>
      </tr>
      <tr class="cond"><td></td><td colspan="11">${esc(r.condition ?? '')}</td></tr>`).join('');
    rowsEl.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => showScan(tr.dataset.id)));
    const total = result[level].length;
    footEl.textContent = `${level === 'level1' ? 'Level 1' : 'Level 2'} 共 ${total} 項，${showAll ? '全部顯示' : '顯示前 15 名'}。`
      + '分數同時取決於研究區間寬度與模型反應係數，不是因果效果；改係數或公式後需重算。';
    csvBtn.hidden = false;
  }

  function showScan(id) {
    scanEl.hidden = false;
    scanEl.innerHTML = '<p class="hint">掃描中…（21 個等距點）</p>';
    setTimeout(() => {
      const scan = scanRange(ctx.session.current, ctx.session.solver, id);
      if (!scan) { scanEl.innerHTML = '<p class="hint">此因素沒有可掃描的區間。</p>'; return; }
      const row = result[level].find((r) => r.id === id) ?? {};
      const pts = scan.points.filter((p) => p.pct !== null);
      const W = 520; const H = 150; const PAD = { l: 52, r: 12, t: 12, b: 28 };
      const xs = scan.points.map((p) => p.x);
      const xMin = Math.min(...xs); const xMax = Math.max(...xs);
      const yMax = Math.max(...pts.map((p) => Math.abs(p.pct)), 1e-9) * 1.15;
      const X = (x) => PAD.l + ((x - xMin) / (xMax - xMin || 1)) * (W - PAD.l - PAD.r);
      const Y = (v) => PAD.t + (1 - (v + yMax) / (2 * yMax)) * (H - PAD.t - PAD.b);
      const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.pct).toFixed(1)}`).join('');
      scanEl.innerHTML = `
        <h3>${symbolHTML(id)} ${esc(row.label ?? id)}：區間內均衡算力變動</h3>
        <svg viewBox="0 0 ${W} ${H}" class="scan-svg" role="img" aria-label="區間內均衡算力變動曲線">
          <line class="axis" x1="${PAD.l}" x2="${W - PAD.r}" y1="${Y(0)}" y2="${Y(0)}"/>
          <line class="axis" x1="${PAD.l}" x2="${PAD.l}" y1="${PAD.t}" y2="${H - PAD.b}"/>
          <path class="curve supply" d="${path}"/>
          ${pts.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.pct).toFixed(1)}" r="2.5" class="eq"/>`).join('')}
          <text x="${PAD.l}" y="${H - 8}" text-anchor="start">${esc(fmtNum(xMin))}</text>
          <text x="${W - PAD.r}" y="${H - 8}" text-anchor="end">${esc(fmtNum(xMax))}</text>
          <text x="${PAD.l - 6}" y="${Y(yMax) + 4}" text-anchor="end">+${yMax.toFixed(2)}%</text>
          <text x="${PAD.l - 6}" y="${Y(-yMax) + 4}" text-anchor="end">−${yMax.toFixed(2)}%</text>
          <text x="${PAD.l - 6}" y="${Y(0) + 4}" text-anchor="end">0%</text>
        </svg>
        <p class="hint">${scan.points.length} 點中有 ${pts.length} 點求得有效均衡；區間內最大偏離 ${scan.maxInside.toFixed(4)}%，端點最大 ${scan.endpointMax.toFixed(4)}%。
        ${scan.note ? `<strong class="warn-text">${esc(scan.note)}</strong>` : '上下限即為區間內最大偏離。'}</p>
        <button type="button" class="small" data-close>關閉</button>`;
      scanEl.querySelector('[data-close]').addEventListener('click', () => { scanEl.hidden = true; });
    }, 10);
  }

  function invalidate() {
    if (!result) return;
    result = null;
    ctx.setSensitivity(null);
    resultEl.hidden = true;
    csvBtn.hidden = true;
    statusEl.textContent = '輸入或模型已變更，先前的敏感度結果已失效，請重新計算。';
  }

  return { invalidate, get result() { return result; } };
}

/** 敏感度結果轉 CSV（含單位與百分比）。 */
export function sensitivityCSV(result) {
  const head = ['層級', '符號', '因素', '單位', '下限', '基準', '上限', 'Q下限(PFLOP-hour/年)', 'Q上限(PFLOP-hour/年)', 'δ下限(%)', 'δ上限(%)', '分數(%)', '名次', '有效性', '父層', '影響條件'];
  const rows = [...result.level1, ...result.level2].map((r) => [
    r.level, r.id, r.label, r.unitLabel ?? '', r.low, r.base, r.high,
    r.qLow ?? '', r.qHigh ?? '',
    r.dLow === null || r.dLow === undefined ? '' : r.dLow.toFixed(7),
    r.dHigh === null || r.dHigh === undefined ? '' : r.dHigh.toFixed(7),
    r.valid ? r.score.toFixed(7) : '', r.rank ?? '', r.valid ? '有效' : (r.note ?? '不適用'),
    (r.parents ?? []).join('|'), r.condition ?? '',
  ]);
  const esc2 = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return ['﻿' + head.map(esc2).join(','), ...rows.map((r) => r.map(esc2).join(','))].join('\n');
}
