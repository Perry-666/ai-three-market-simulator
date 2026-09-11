// 三市場供需圖（自製 SVG）。縱軸價格、橫軸數量；基準虛線、新情境實線。
// 曲線由取樣價格 P 計算 Q(P) 繪製；非負區域只做視覺裁切，不改寫公式或結果。

import { sampleCurve, curveAt } from '../engine/analysis.js';
import { MARKETS, MARKET_IDS, PRICE_IDS } from '../engine/model.js';
import { DISPLAYABLE } from '../engine/session.js';
import { pctChange } from '../engine/scenario.js';
import { esc, fmtDelta, fmtFull, fmtNum, fmtPct, niceTicks, symbolHTML, el } from './format.js';

const W = 420;
const H = 310;
const PAD = { l: 58, r: 14, t: 16, b: 46 };
let uid = 0;

export function renderCharts(container, { display, session, onView }) {
  container.innerHTML = '';
  const shown = display?.shown;
  container.classList.toggle('single', shown?.mode === 'single');
  if (!shown) {
    container.append(el('p', { class: 'empty' }, '尚無有效結果可繪圖。請依狀態列的訊息修正輸入或公式。'));
    return;
  }
  const markets = shown.mode === 'single' ? [shown.current.market] : MARKET_IDS;
  for (const m of markets) container.append(buildChart(m, shown, session.view[m], display.stale, onView));
  if (shown.mode === 'single') container.append(singleInfo(shown));
}

function singleInfo(shown) {
  const card = el('figure', { class: 'chart-card' });
  const m = shown.current.market;
  const rows = PRICE_IDS.map((id) => {
    const own = id === MARKETS[m].price;
    return `<tr><td>${symbolHTML(id)}</td><td>${own ? '<strong>求解</strong>' : '固定'}</td><td title="${esc(fmtFull(shown.current.P[id]))}">${fmtNum(shown.current.P[id])}</td><td class="unit">${esc(MARKETS[MARKET_IDS[PRICE_IDS.indexOf(id)]].priceLabel)}</td></tr>`;
  }).join('');
  card.innerHTML = `
    <header><h3>單市場觀察說明</h3><span class="tag warn">其他市場價格固定</span></header>
    <p class="others">此模式只畫固定其他兩價的<strong>條件曲線</strong>，交點是條件均衡，<strong>不是三市場整體均衡</strong>。基準與新情境都代入相同的固定價格。</p>
    <table class="mini-table"><thead><tr><th>價格</th><th>角色</th><th>新情境代入</th><th>單位</th></tr></thead><tbody>${rows}</tbody></table>`;
  return card;
}

function buildChart(m, shown, view, stale, onView) {
  const mk = MARKETS[m];
  const cur = shown.current;
  const base = DISPLAYABLE.has(shown.baseline?.status) ? shown.baseline : null;
  const single = shown.mode === 'single';

  const pStars = [base?.P[mk.price], cur.P[mk.price]].filter(Number.isFinite);
  const qStars = [base?.Q[m], cur.Q[m]].filter(Number.isFinite);
  const pRef = Math.max(0, ...pStars.map(Math.abs)) || 1;
  const pMax = view.pMax > 0 ? view.pMax : 2 * pRef;
  const pMin = view.nonNegative ? 0 : -pMax;

  const curves = { cur: sampleCurve(cur.model, cur.values, m, cur.P, [pMin, pMax]) };
  if (base) curves.base = sampleCurve(base.model, base.values, m, base.P, [pMin, pMax]);

  const qRef = Math.max(0, ...qStars.map(Math.abs));
  let qMax = view.qMax > 0 ? view.qMax : 2.2 * qRef;
  if (!(qMax > 0)) {
    const all = Object.values(curves).flat().flatMap((p) => [p.S, p.D]).filter(Number.isFinite).map(Math.abs);
    qMax = Math.max(1, ...all);
  }
  const qMin = view.nonNegative ? 0 : -qMax;

  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const X = (q) => PAD.l + ((q - qMin) / (qMax - qMin)) * iw;
  const Y = (p) => PAD.t + (1 - (p - pMin) / (pMax - pMin)) * ih;
  const clipId = `clip-${++uid}`;

  const path = (pts, key) => {
    let d = '';
    let pen = false;
    for (const pt of pts) {
      const v = pt[key];
      if (!Number.isFinite(v)) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${X(v).toFixed(2)},${Y(pt.P).toFixed(2)}`;
      pen = true;
    }
    return d;
  };

  const xt = niceTicks(qMin, qMax, 4);
  const yt = niceTicks(pMin, pMax, 5);
  const grid = [
    ...xt.map((q) => `<line x1="${X(q)}" x2="${X(q)}" y1="${PAD.t}" y2="${PAD.t + ih}"/>`),
    ...yt.map((p) => `<line x1="${PAD.l}" x2="${PAD.l + iw}" y1="${Y(p)}" y2="${Y(p)}"/>`),
  ].join('');
  const xLabels = xt.map((q) => `<text x="${X(q)}" y="${PAD.t + ih + 15}" text-anchor="middle">${esc(fmtNum(q, 3))}</text>`).join('');
  const yLabels = yt.map((p) => `<text x="${PAD.l - 6}" y="${Y(p) + 4}" text-anchor="end">${esc(fmtNum(p, 3))}</text>`).join('');

  const inView = (P, Q) => P >= pMin && P <= pMax && Q >= qMin && Q <= qMax;
  const offview = [];
  const marker = (res, kind) => {
    const P = res.P[mk.price];
    const Q = res.Q[m];
    if (!Number.isFinite(P) || !Number.isFinite(Q)) return '';
    const label = kind === 'base' ? '基準' : '新';
    if (!inView(P, Q)) { offview.push(`${label}交點不在顯示範圍內（P=${fmtNum(P)}，Q=${fmtNum(Q)}）`); return ''; }
    const na = res.status === 'out_of_range';
    const cls = kind === 'base' ? 'eq base' : na ? 'eq na' : 'eq';
    const text = kind === 'base' ? '基準' : na ? '交點（不適用）' : single ? '條件均衡' : '新均衡';
    return `<g>
      <line class="guide" x1="${PAD.l}" x2="${X(Q)}" y1="${Y(P)}" y2="${Y(P)}"/>
      <line class="guide" x1="${X(Q)}" x2="${X(Q)}" y1="${Y(P)}" y2="${PAD.t + ih}"/>
      <circle class="${cls}" cx="${X(Q)}" cy="${Y(P)}" r="${kind === 'base' ? 4.5 : 5.5}"/>
      <text class="eq-label${na && kind !== 'base' ? ' na' : ''}" x="${X(Q) + 8}" y="${Y(P) + (kind === 'base' ? 14 : -8)}">${text}</text>
    </g>`;
  };

  const axisX = `數量 ${mk.quantity}（${mk.qtyLabel}）`;
  const axisY = `價格 ${mk.price}（${mk.priceLabel}）`;
  const svg = `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs><clipPath id="${clipId}"><rect x="${PAD.l}" y="${PAD.t}" width="${iw}" height="${ih}"/></clipPath></defs>
      <g class="grid">${grid}</g>
      <g class="axis"><line x1="${PAD.l}" x2="${PAD.l}" y1="${PAD.t}" y2="${PAD.t + ih}"/><line x1="${PAD.l}" x2="${PAD.l + iw}" y1="${PAD.t + ih}" y2="${PAD.t + ih}"/></g>
      ${xLabels}${yLabels}
      <text class="axis-title" x="${PAD.l + iw / 2}" y="${H - 8}" text-anchor="middle">${esc(axisX)}</text>
      <text class="axis-title" transform="translate(13 ${PAD.t + ih / 2}) rotate(-90)" text-anchor="middle">${esc(axisY)}</text>
      <g clip-path="url(#${clipId})">
        ${curves.base ? `<path class="curve supply base" d="${path(curves.base, 'S')}"/><path class="curve demand base" d="${path(curves.base, 'D')}"/>` : ''}
        <path class="curve supply" d="${path(curves.cur, 'S')}"/>
        <path class="curve demand" d="${path(curves.cur, 'D')}"/>
        ${base ? marker(base, 'base') : ''}
        ${marker(cur, 'cur')}
        <line class="hover-line" x1="${PAD.l}" x2="${PAD.l + iw}" y1="0" y2="0" visibility="hidden"/>
        <circle class="hover-dot supply" r="3.5" visibility="hidden"/>
        <circle class="hover-dot demand" r="3.5" visibility="hidden"/>
      </g>
      <rect class="hit" x="${PAD.l}" y="${PAD.t}" width="${iw}" height="${ih}" fill="transparent"/>
    </svg>`;

  const card = el('figure', { class: `chart-card${stale ? ' stale' : ''}` });
  const tagText = cur.status === 'out_of_range' ? '不在模型適用範圍' : single ? '條件均衡（其他價格固定）' : '三市場聯立均衡';
  const pBase = base?.P[mk.price];
  const pCur = cur.P[mk.price];
  const qBase = base?.Q[m];
  const qCur = cur.Q[m];
  const changeLine = (label, b, c) => {
    if (!Number.isFinite(c)) return '';
    if (!Number.isFinite(b)) return `<div><dt>${label}</dt><dd>${fmtNum(c)} <span class="delta">（基準不可用）</span></dd></div>`;
    return `<div><dt>${label}</dt><dd><span title="${esc(fmtFull(b))}">${fmtNum(b)}</span> → <span title="${esc(fmtFull(c))}">${fmtNum(c)}</span> <span class="delta">（${fmtDelta(c - b)}，${fmtPct(pctChange(b, c))}）</span></dd></div>`;
  };
  const otherIds = PRICE_IDS.filter((id) => id !== mk.price);
  const others = (res) => otherIds.map((id) => `${id}＝${fmtNum(res.P[id])}`).join('、');

  const summaryText = `${mk.label}供需圖。新情境價格 ${fmtNum(pCur)} ${mk.priceLabel}，數量 ${fmtNum(qCur)} ${mk.qtyLabel}`
    + (Number.isFinite(pBase) ? `；基準價格 ${fmtNum(pBase)}，數量 ${fmtNum(qBase)}` : '')
    + '。使用上下方向鍵檢視各價格的供給量與需求量。';

  card.innerHTML = `
    <header>
      <h3>${esc(mk.label)}</h3>
      <span class="tag${cur.status === 'out_of_range' || single ? ' warn' : ''}">${tagText}</span>
    </header>
    ${stale ? '<p class="stale-banner">目前情境無法求得可顯示的結果：此圖為最後有效結果，不是新均衡。</p>' : ''}
    <div class="plot" tabindex="0" role="img" aria-label="${esc(summaryText)}">${svg}<div class="tooltip" hidden></div></div>
    <ul class="legend">
      <li><i class="sw sup"></i>供給（新）</li>
      <li><i class="sw dem"></i>需求（新）</li>
      <li><i class="sw sup base"></i><i class="sw dem base"></i>基準（虛線）</li>
    </ul>
    <dl class="changes">
      ${changeLine(`價格 ${mk.price}`, pBase, pCur)}
      ${changeLine(`數量 ${mk.quantity}`, qBase, qCur)}
    </dl>
    <p class="others">代入的其他市場價格 — 新情境：${others(cur)}${base ? `；基準：${others(base)}` : ''}</p>
    ${offview.map((t) => `<p class="offview">${esc(t)}</p>`).join('')}
    <details class="range">
      <summary>顯示範圍</summary>
      <div class="kv">
        <label for="pmax-${m}">價格上限</label><input type="number" id="pmax-${m}" step="any" min="0" placeholder="自動 ${esc(fmtNum(2 * pRef))}" value="${view.pMax ?? ''}">
        <label for="qmax-${m}">數量上限</label><input type="number" id="qmax-${m}" step="any" min="0" placeholder="自動" value="${view.qMax ?? ''}">
        <label class="check"><input type="checkbox" data-nonneg ${view.nonNegative ? 'checked' : ''}> 只顯示非負區域（僅視覺裁切）</label>
      </div>
      <button type="button" class="small" data-auto>自動範圍</button>
    </details>`;

  // 範圍調整
  const pInput = card.querySelector(`#pmax-${m}`);
  const qInput = card.querySelector(`#qmax-${m}`);
  const readPos = (input) => { const v = input.valueAsNumber; return Number.isFinite(v) && v > 0 ? v : null; };
  pInput.addEventListener('change', () => onView(m, { pMax: readPos(pInput) }));
  qInput.addEventListener('change', () => onView(m, { qMax: readPos(qInput) }));
  card.querySelector('[data-nonneg]').addEventListener('change', (e) => onView(m, { nonNegative: e.target.checked }));
  card.querySelector('[data-auto]').addEventListener('click', () => onView(m, { pMax: null, qMax: null, nonNegative: true }));

  // 提示框（滑鼠、觸控、鍵盤）
  const plot = card.querySelector('.plot');
  const svgEl = plot.querySelector('svg');
  const tip = plot.querySelector('.tooltip');
  const hLine = svgEl.querySelector('.hover-line');
  const dotS = svgEl.querySelector('.hover-dot.supply');
  const dotD = svgEl.querySelector('.hover-dot.demand');
  let hoverP = null;

  const show = (P) => {
    hoverP = Math.min(pMax, Math.max(pMin, P));
    const c = curveAt(cur.model, cur.values, m, cur.P, hoverP);
    const b = base ? curveAt(base.model, base.values, m, base.P, hoverP) : null;
    if (!c) return hide();
    const y = Y(hoverP);
    hLine.setAttribute('y1', y); hLine.setAttribute('y2', y); hLine.setAttribute('visibility', 'visible');
    dotS.setAttribute('cx', X(c.S)); dotS.setAttribute('cy', y); dotS.setAttribute('visibility', 'visible');
    dotD.setAttribute('cx', X(c.D)); dotD.setAttribute('cy', y); dotD.setAttribute('visibility', 'visible');
    tip.innerHTML = `
      <div><strong>${mk.price} ＝ ${esc(fmtNum(hoverP))}</strong> <span class="t-muted">${esc(mk.priceLabel)}</span></div>
      <div>新情境：<span class="t-sup">供給 ${esc(fmtNum(c.S))}</span>｜<span class="t-dem">需求 ${esc(fmtNum(c.D))}</span></div>
      ${b ? `<div class="t-muted">基準：供給 ${esc(fmtNum(b.S))}｜需求 ${esc(fmtNum(b.D))}</div>` : ''}
      <div class="t-muted">數量單位：${esc(mk.qtyLabel)}</div>`;
    const rect = svgEl.getBoundingClientRect();
    const k = rect.width / W;
    tip.style.left = `${Math.min(Math.max((PAD.l + iw / 2) * k, 110), rect.width - 110)}px`;
    tip.style.top = `${y * k}px`;
    tip.hidden = false;
  };
  const hide = () => {
    hoverP = null;
    tip.hidden = true;
    for (const node of [hLine, dotS, dotD]) node.setAttribute('visibility', 'hidden');
  };
  const pFromEvent = (e) => {
    const rect = svgEl.getBoundingClientRect();
    const sy = ((e.clientY - rect.top) / rect.height) * H;
    if (sy < PAD.t || sy > PAD.t + ih) return null;
    return pMin + (1 - (sy - PAD.t) / ih) * (pMax - pMin);
  };
  svgEl.addEventListener('pointermove', (e) => { const P = pFromEvent(e); if (P === null) hide(); else show(P); });
  svgEl.addEventListener('pointerleave', hide);
  plot.addEventListener('focus', () => show(Number.isFinite(pCur) ? pCur : (pMin + pMax) / 2));
  plot.addEventListener('blur', hide);
  plot.addEventListener('keydown', (e) => {
    const step = (pMax - pMin) / 50;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); show((hoverP ?? pCur) + step); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); show((hoverP ?? pCur) - step); }
    else if (e.key === 'Escape') hide();
  });

  return card;
}
