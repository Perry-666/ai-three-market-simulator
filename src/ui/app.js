// 應用程式進入點：狀態管理、重算、狀態列、結果表、工具列、單市場設定、匯出匯入。

import {
  compareResults, createDefaultSession, exportSession, importSession, ImportError, pctChange,
} from '../engine/scenario.js';
import {
  computeSession, DISPLAYABLE, resetCurrent, resolveDisplay, saveAsBaseline, setSolver,
} from '../engine/session.js';
import { STATUS_LABELS } from '../engine/solver.js';
import { FORMULA_META, MARKET_IDS, MARKETS, PRICE_IDS, SEGMENT_FORMULAS } from '../engine/model.js';
import { renderCharts } from './charts.js';
import { buildCoefficientPanel, buildFactorPanel, buildScenarioPanel } from './panels.js';
import { buildEditor } from './editor.js';
import { loadStored, saveStored } from './storage.js';
import { esc, fmtDelta, fmtFull, fmtNum, fmtPct, fmtResidual, inputValue, symbolHTML } from './format.js';

const $ = (sel) => document.querySelector(sel);

const state = { session: null, computed: null, display: null, lastValid: null, storageAvailable: true };

const stored = loadStored();
state.storageAvailable = stored.available;
state.session = stored.session ?? createDefaultSession();

const ctx = {
  get session() { return state.session; },
  get computed() { return state.computed; },
  get display() { return state.display; },
  get storageAvailable() { return state.storageAvailable; },
  commit(next) { state.session = next; scheduleSave(); scheduleCompute(); },
  replaceSession(next, message) { state.lastValid = null; state.session = next; saveNow(); recompute(); if (message) notify(message, 'ok'); },
  notify,
  action: runAction,
};

// ---------- 通知 ----------

function notify(message, kind = 'ok', html = false) {
  const box = $('#notice');
  box.className = `notice ${kind}`;
  box.innerHTML = `<div class="body"></div><button type="button" class="small" aria-label="關閉通知">關閉</button>`;
  const body = box.querySelector('.body');
  if (html) body.innerHTML = message; else body.textContent = message;
  box.querySelector('button').addEventListener('click', () => { box.hidden = true; });
  box.hidden = false;
}

// ---------- 儲存與重算排程 ----------

let saveTimer = 0;
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 300); }
function saveNow() { clearTimeout(saveTimer); if (state.storageAvailable) saveStored(state.session); }
window.addEventListener('pagehide', saveNow);

// 以計時器合併連續輸入；不用 requestAnimationFrame，因為背景分頁會暫停它而延遲重算。
let computeTimer = 0;
function scheduleCompute() {
  if (computeTimer) return;
  computeTimer = setTimeout(() => { computeTimer = 0; recompute(); }, 16);
}

function recompute() {
  state.computed = computeSession(state.session);
  const d = resolveDisplay(state.lastValid, state.computed);
  state.display = d;
  state.lastValid = d.lastValid;
  renderModeControls();
  renderStatus();
  renderCharts($('#charts'), { display: d, session: state.session, onView: setView });
  renderSummary();
  factorPanel.sync();
  coefPanel.sync();
  scenarioPanel.sync();
  editor.sync();
}

function setView(market, patch) {
  const next = structuredClone(state.session);
  next.view[market] = { ...next.view[market], ...patch };
  state.session = next;
  scheduleSave();
  renderCharts($('#charts'), { display: state.display, session: state.session, onView: setView });
}

// ---------- 狀態列 ----------

function statusClass(status) {
  if (status === 'valid') return 'ok';
  if (status === 'out_of_range' || status === 'ill_conditioned') return 'warn';
  return 'err';
}

function renderStatus() {
  const c = state.computed;
  const cur = c.current;
  const single = c.mode === 'single';
  const mk = MARKETS[state.session.solver.market];
  const modeLabel = single ? `單市場觀察：${mk.label}（其他市場價格固定，條件均衡）` : '三市場聯立均衡';
  const items = [];
  const facts = [];

  if (cur.P) {
    const methodLabel = { linear: '線性代數直接求解並代回核對', newton: 'Newton 數值求解', bisection: '數值求根（二分法）' }[cur.method] ?? cur.method;
    const worst = Math.max(...Object.values(cur.residuals ?? { x: NaN }));
    const tol = cur.method === 'linear' ? state.session.solver.tolLinear : state.session.solver.tolNonlinear;
    facts.push(`方法：${methodLabel}`);
    facts.push(`最大相對殘差 ${fmtResidual(worst)}（容許 ${tol}）`);
    if (Number.isFinite(cur.cond)) facts.push(`尺度化條件數 ${fmtNum(cur.cond, 3)}`);
  }

  switch (cur.status) {
    case 'valid':
      items.push('通過殘差與適用範圍檢查（價格、市場數量、分群需求皆非負）。');
      break;
    case 'out_of_range':
      items.push('求得的交點含負值，此情境不在模型適用範圍；數值照實顯示，不截斷為 0：');
      for (const v of cur.violations) items.push(`${esc(v.label)} ＝ <span title="${esc(fmtFull(v.value))}">${fmtNum(v.value)}</span>`);
      break;
    case 'ill_conditioned':
      items.push('係數矩陣病態，數值精度不足；結果僅供參考，不標為有效均衡。');
      break;
    case 'no_solution':
      items.push('係數矩陣奇異且方程式互相矛盾：無解。常見原因是某市場的價格項係數全為 0。');
      break;
    case 'non_unique':
      items.push('係數矩陣奇異且方程式相依：無唯一解（有無限多組價格滿足）。');
      break;
    case 'not_found':
      items.push('數值求解在最大迭代次數內找不到解；不沿用上一情境的解。可調整公式、初值相關參數或容許值。');
      break;
    case 'residual_fail':
      items.push('代回核對時殘差超過容許值，不標為有效均衡。');
      break;
    case 'formula_error':
      for (const e of cur.errors) {
        const where = e.formulaId ? `<button type="button" class="link" data-goto="${esc(e.formulaId)}" data-start="${e.start ?? ''}" data-end="${e.end ?? ''}">${esc(e.formulaId)}</button>：` : '';
        items.push(`${where}${esc(e.message)}`);
      }
      break;
    case 'input_error':
      for (const e of cur.inputErrors) items.push(esc(e.message));
      break;
    default:
      break;
  }

  const unitList = Object.entries(cur.units ?? {});
  const bad = unitList.filter(([, u]) => u.status === 'mismatch');
  const unver = unitList.filter(([, u]) => u.status === 'unverified');
  if (unitList.length) {
    if (!bad.length && !unver.length) facts.push(`單位檢查：${unitList.length} 條公式一致`);
    for (const [id, u] of bad) items.push(`<button type="button" class="link" data-goto="${id}">${id}</button> ${esc(u.message)}`);
    for (const [id, u] of unver) items.push(`<button type="button" class="link" data-goto="${id}">${id}</button> ${esc(u.message)}`);
  }
  for (const w of cur.warnings ?? []) items.push(`⚠ ${esc(w.message)}`);

  if (state.display.stale) items.push('<strong>圖表與結果表顯示最後有效結果，並非目前情境的新均衡。</strong>');
  if (!DISPLAYABLE.has(c.baseline.status)) items.push(`基準情境：${STATUS_LABELS[c.baseline.status]}，基準曲線不顯示。`);

  $('#status').innerHTML = `
    <div class="status-main">
      <span class="pill ${statusClass(cur.status)}">${STATUS_LABELS[cur.status]}</span>
      <span class="mode-label">${esc(modeLabel)}</span>
      <span class="facts">${facts.map(esc).join('｜')}</span>
    </div>
    ${items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : ''}
    <p class="io-note">註：投入產出數量一致性尚未施加（Q<sub>C</sub> 未強制等於 a×Q<sub>A</sub>＋訓練耗用）；示範數值為假設，詳見下方解讀範圍。</p>`;

  $('#status').querySelectorAll('[data-goto]').forEach((btn) => btn.addEventListener('click', () => {
    const start = btn.dataset.start === '' ? undefined : Number(btn.dataset.start);
    const end = btn.dataset.end === '' ? undefined : Number(btn.dataset.end);
    editor.focus(btn.dataset.goto, start, end);
  }));
}

// ---------- 結果表 ----------

function renderSummary() {
  const box = $('#summary');
  const shown = state.display.shown;
  if (!shown) { box.innerHTML = '<h2>均衡結果</h2><p class="foot">目前沒有可顯示的結果。</p>'; return; }
  const cur = shown.current;
  const base = DISPLAYABLE.has(shown.baseline.status) ? shown.baseline : null;
  const markets = shown.mode === 'single' ? [cur.market] : MARKET_IDS;
  const naIds = new Set((cur.violations ?? []).map((v) => v.id));

  const cell = (v) => `<td title="${esc(fmtFull(v))}">${fmtNum(v)}</td>`;
  const row = (label, unit, b, c, na, sub = false) => `
    <tr class="${na ? 'na' : ''}${sub ? ' sub' : ''}">
      <td>${label} <span class="unit">${esc(unit)}</span></td>
      ${cell(b)}${cell(c)}
      <td>${Number.isFinite(b) ? fmtDelta(c - b) : '—'}</td>
      <td>${Number.isFinite(b) ? fmtPct(pctChange(b, c)) : '—'}</td>
    </tr>`;

  let rows = '';
  for (const m of markets) {
    const mk = MARKETS[m];
    rows += row(`${esc(mk.short)}價格 ${symbolHTML(mk.price)}`, mk.priceLabel, base?.P[mk.price], cur.P[mk.price], naIds.has(mk.price));
    rows += row(`${esc(mk.short)}數量 ${symbolHTML(mk.quantity)}`, mk.qtyLabel, base?.Q[m], cur.Q[m], naIds.has(mk.quantity));
    if (m === 'A') {
      for (const seg of SEGMENT_FORMULAS) {
        rows += row(`${esc(FORMULA_META[seg].label)} ${symbolHTML(seg)}`, FORMULA_META[seg].unitLabel, base?.env?.[seg], cur.env?.[seg], naIds.has(seg), true);
      }
    }
  }
  const title = shown.mode === 'single' ? '條件均衡結果（其他市場價格固定）' : '三市場聯立均衡結果';
  box.innerHTML = `
    <h2>${title}${state.display.stale ? '（最後有效結果）' : ''}</h2>
    <div class="table-wrap"><table class="result-table">
      <thead><tr><th>項目</th><th>基準</th><th>新情境</th><th>絕對變化</th><th>百分比變化</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="foot">新情境狀態：${STATUS_LABELS[cur.status]}${cur.status === 'out_of_range' ? '（紅底為違反適用範圍的項目）' : ''}。基準值為 0 時百分比顯示「不適用」。滑過數字可看精確值。</p>`;
}

// ---------- 模式與單市場設定 ----------

const fixedBox = $('#fixed-prices');
fixedBox.innerHTML = PRICE_IDS.map((id, i) => {
  const mk = MARKETS[MARKET_IDS[i]];
  return `<label>${symbolHTML(id)}（${esc(mk.priceLabel)}）<input type="number" step="any" id="fixed-${id}" data-price="${id}"></label>`;
}).join('');

document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', () => {
  ctx.commit(setSolver(state.session, { mode: r.value }));
}));
$('#single-market').addEventListener('change', (e) => ctx.commit(setSolver(state.session, { market: e.target.value })));
document.querySelectorAll('input[name="fixedFrom"]').forEach((r) => r.addEventListener('change', () => {
  const patch = { fixedFrom: r.value };
  if (r.value === 'user' && state.computed?.fixed) patch.fixed = { ...state.computed.fixed };
  ctx.commit(setSolver(state.session, patch));
}));
fixedBox.querySelectorAll('input').forEach((input) => input.addEventListener('input', () => {
  const v = Number(input.value);
  if (input.value.trim() === '' || !Number.isFinite(v)) { input.setAttribute('aria-invalid', 'true'); return; }
  input.setAttribute('aria-invalid', 'false');
  ctx.commit(setSolver(state.session, { fixed: { ...state.session.solver.fixed, [input.dataset.price]: v } }));
}));

function renderModeControls() {
  const s = state.session.solver;
  document.querySelectorAll('input[name="mode"]').forEach((r) => { r.checked = r.value === s.mode; });
  $('#single-controls').hidden = s.mode !== 'single';
  $('#single-market').value = s.market;
  document.querySelectorAll('input[name="fixedFrom"]').forEach((r) => { r.checked = r.value === s.fixedFrom; });
  const fixed = state.computed?.fixed ?? s.fixed;
  fixedBox.querySelectorAll('input').forEach((input) => {
    const id = input.dataset.price;
    const own = MARKETS[s.market].price === id;
    input.disabled = own || s.fixedFrom === 'baseline';
    input.closest('label').hidden = own;
    if (document.activeElement !== input) input.value = inputValue(fixed[id]);
  });
}

// ---------- 工具列、匯出匯入 ----------

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function exportJSON() {
  const data = exportSession(state.session, state.computed);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-three-market-scenario-${stamp()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  notify('已匯出 JSON：包含公式、因素、係數、單位、數值、來源標記、求解設定與結果摘要。', 'ok');
}

function importJSON(text) {
  try {
    const { session, expected, warnings } = importSession(text);
    session.saved = state.session.saved;
    session.view = state.session.view;
    ctx.replaceSession(session);
    const diffs = compareResults(expected, state.computed);
    const parts = ['已匯入情境。'];
    if (expected) parts.push(diffs.length ? `重新求解後與檔案內結果不一致：${diffs.join('；')}` : '重新求解的結果與檔案內結果一致。');
    if (warnings.length) parts.push(`注意：${warnings.join('；')}`);
    notify(parts.join(' '), diffs.length || warnings.length ? 'warn' : 'ok');
  } catch (e) {
    if (!(e instanceof ImportError)) throw e;
    notify(`匯入失敗，目前情境未變更：<ul>${e.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`, 'err', true);
  }
}

const fileInput = $('#import-file');
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  importJSON(await file.text());
  fileInput.value = '';
});

function runAction(name) {
  switch (name) {
    case 'save-baseline':
      ctx.commit(saveAsBaseline(state.session));
      notify('已把目前情境儲存為比較基準。', 'ok');
      break;
    case 'reset':
      ctx.commit(resetCurrent(state.session));
      notify('目前情境已重設為基準。', 'ok');
      break;
    case 'export': exportJSON(); break;
    case 'import': fileInput.click(); break;
    default: break;
  }
}
document.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => runAction(b.dataset.action)));

// ---------- 分頁 ----------

const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  }
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t));
  t.addEventListener('keydown', (e) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    selectTab(next);
    next.focus();
  });
});

// ---------- 啟動 ----------

const factorPanel = buildFactorPanel($('#panel-factors'), ctx);
const coefPanel = buildCoefficientPanel($('#panel-coefs'), ctx);
const scenarioPanel = buildScenarioPanel($('#panel-scenarios'), ctx);
const editor = buildEditor($('#editor'), $('#editor-body'), ctx);

recompute();
if (stored.error) notify(`本機儲存的情境無法讀取（${stored.error}），已載入網站預設的示範情境。`, 'warn');
