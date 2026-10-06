// 應用程式進入點：狀態管理、重算、狀態列、結果表、工具列、單市場設定、匯出匯入、敏感度。

import {
  compareResults, createDefaultSession, exportSession, importSession, ImportError, pctChange,
} from '../engine/scenario.js';
import {
  computeSession, DISPLAYABLE, resetCurrent, resolveDisplay, saveAsBaseline, setSolver,
} from '../engine/session.js';
import { STATUS_LABELS } from '../engine/solver.js';
import {
  BASELINE_EQUILIBRIUM, DERIVABLE_PARENTS, FACTORS, FORMULA_META, LEVEL2, MARKET_IDS, MARKETS, MODEL_VERSION,
  PRICE_IDS, SEGMENT_FORMULAS, SYMBOLS,
} from '../engine/model.js';
import { renderCharts } from './charts.js';
import { buildCoefficientPanel, buildFactorPanel, buildLevel2Panel, buildScenarioPanel } from './panels.js';
import { buildSensitivityPanel, sensitivityCSV } from './sensitivity-ui.js';
import { buildEditor } from './editor.js';
import { loadStored, saveStored } from './storage.js';
import { esc, fmtDelta, fmtFull, fmtNum, fmtPct, fmtResidual, inputValue, symbolHTML } from './format.js';

const $ = (sel) => document.querySelector(sel);

const state = { session: null, computed: null, display: null, lastValid: null, sensitivity: null, storageAvailable: true };

const stored = loadStored();
state.storageAvailable = stored.available;
state.session = stored.session ?? createDefaultSession();

const ctx = {
  get session() { return state.session; },
  get computed() { return state.computed; },
  get display() { return state.display; },
  get storageAvailable() { return state.storageAvailable; },
  commit(next) { state.session = next; sensPanel?.invalidate(); scheduleSave(); scheduleCompute(); },
  replaceSession(next, message) {
    state.lastValid = null;
    state.session = next;
    sensPanel?.invalidate();
    saveNow();
    recompute();
    if (message) notify(message, 'ok');
  },
  setSensitivity(result) { state.sensitivity = result; },
  notify,
  action: runAction,
};

// ---------- 通知 ----------

function notify(message, kind = 'ok', html = false) {
  const box = $('#notice');
  box.className = `notice ${kind}`;
  box.innerHTML = '<div class="body"></div><button type="button" class="small" aria-label="關閉通知">關閉</button>';
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
  level2Panel.sync();
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

const statusClass = (status) => (status === 'valid' ? 'ok' : status === 'out_of_range' || status === 'ill_conditioned' ? 'warn' : 'err');

function renderStatus() {
  const c = state.computed;
  const cur = c.current;
  const single = c.mode === 'single';
  const mk = MARKETS[state.session.solver.market];
  const modeLabel = single ? `單市場觀察：${mk.label}（其他市場價格固定，條件均衡）` : '三市場聯立均衡';
  const items = [];
  const facts = [`模型版本 ${MODEL_VERSION}`];

  if (cur.P) {
    const methodLabel = { linear: '線性代數直接求解並代回核對', newton: 'Newton 數值求解', bisection: '數值求根（二分法）' }[cur.method] ?? cur.method;
    const worst = Math.max(...Object.values(cur.residuals ?? { x: NaN }));
    facts.push(`方法：${methodLabel}`);
    facts.push(`最大相對殘差 ${fmtResidual(worst)}（容許 ${state.session.solver.relTol}）`);
    if (Number.isFinite(cur.cond)) facts.push(`尺度化條件數 ${fmtNum(cur.cond, 3)}`);
  }

  switch (cur.status) {
    case 'valid': items.push('通過殘差與適用範圍檢查（價格、市場數量、分群需求皆非負）。'); break;
    case 'out_of_range':
      items.push('求得的交點含負值，此情境不在模型適用範圍；數值照實顯示，不截斷為 0：');
      for (const v of cur.violations) items.push(`${esc(v.label)} ＝ <span title="${esc(fmtFull(v.value))}">${fmtNum(v.value)}</span>`);
      break;
    case 'ill_conditioned': items.push('係數矩陣病態，數值精度不足；結果僅供參考，不標為有效均衡。'); break;
    case 'no_solution': items.push('係數矩陣奇異且方程式互相矛盾：無解。常見原因是某市場的價格項係數全為 0。'); break;
    case 'non_unique': items.push('係數矩陣奇異且方程式相依：無唯一解。'); break;
    case 'not_found': items.push('數值求解在最大迭代次數內找不到解；不沿用上一情境的解。'); break;
    case 'residual_fail': items.push('代回核對時殘差超過容許值，不標為有效均衡。'); break;
    case 'formula_error':
      for (const e of cur.errors) {
        const where = e.formulaId ? `<button type="button" class="link" data-goto="${esc(e.formulaId)}" data-start="${e.start ?? ''}" data-end="${e.end ?? ''}">${esc(e.formulaId)}</button>：` : '';
        items.push(`${where}${esc(e.message)}`);
      }
      break;
    case 'input_error': for (const e of cur.inputErrors) items.push(esc(e.message)); break;
    default: break;
  }

  const derivedList = DERIVABLE_PARENTS.filter((id) => state.session.current.modes[id] === 'derived');
  if (derivedList.length) facts.push(`由子項換算：${derivedList.join('、')}`);
  for (const w of cur.warnings ?? []) items.push(`⚠ ${esc(w.message)}`);
  const badUnits = Object.entries(cur.units ?? {}).filter(([, u]) => u.status === 'mismatch');
  for (const [id, u] of badUnits) items.push(`<button type="button" class="link" data-goto="${id}">${id}</button> ${esc(u.message)}`);
  if (state.display.stale) items.push('<strong>圖表與結果表顯示最後有效結果，並非目前情境的新均衡。</strong>');
  if (!DISPLAYABLE.has(c.baseline.status)) items.push(`基準情境：${STATUS_LABELS[c.baseline.status]}，基準曲線不顯示。`);

  $('#status').innerHTML = `
    <div class="status-main">
      <span class="pill ${statusClass(cur.status)}">${STATUS_LABELS[cur.status]}</span>
      <span class="mode-label">${esc(modeLabel)}</span>
      <span class="facts">${facts.map(esc).join('｜')}</span>
    </div>
    ${items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : ''}
    <p class="io-note">2027 單期研究情境；數值為研究假設，係數尚未由資料估計。核心產出為均衡算力 Q<sub>C</sub>＊。</p>`;

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
  // 兩個情境相同時，求解尺度差異會留下 1e-11 等級的浮點雜訊；低於相對 1e-9 視為無變化。
  const snap = (b, c) => (Math.abs(c - b) <= 1e-9 * Math.max(Math.abs(b), Math.abs(c)) ? b : c);
  const row = (label, unit, b, cRaw, na, sub = false) => {
    const c = Number.isFinite(b) && Number.isFinite(cRaw) ? snap(b, cRaw) : cRaw;
    return `
    <tr class="${na ? 'na' : ''}${sub ? ' sub' : ''}">
      <td>${label} <span class="unit">${esc(unit)}</span></td>
      ${cell(b)}${cell(c)}
      <td>${Number.isFinite(b) ? fmtDelta(c - b) : '—'}</td>
      <td>${Number.isFinite(b) ? fmtPct(pctChange(b, c)) : '—'}</td>
    </tr>`;
  };

  let rows = '';
  for (const m of markets) {
    const mk = MARKETS[m];
    rows += row(`${esc(mk.short)}價格 ${symbolHTML(mk.price)}`, mk.priceLabel, base?.P[mk.price], cur.P[mk.price], naIds.has(mk.price));
    rows += row(`${esc(mk.short)}數量 ${symbolHTML(mk.quantity)}${m === 'C' ? '（核心產出）' : ''}`, mk.qtyLabel, base?.Q[m], cur.Q[m], naIds.has(mk.quantity));
    if (m === 'A') {
      for (const seg of SEGMENT_FORMULAS) {
        rows += row(`${esc(FORMULA_META[seg].label)} ${symbolHTML(seg)}`, FORMULA_META[seg].unitLabel, base?.env?.[seg], cur.env?.[seg], naIds.has(seg), true);
      }
    }
    if (m === 'C' && cur.env) {
      const inf = cur.env.a * cur.env.Q_A_D;
      const infBase = base?.env ? base.env.a * base.env.Q_A_D : undefined;
      rows += row('推論算力 a×Q_A', MARKETS.C.qtyLabel, infBase, inf, false, true);
      rows += row('訓練與其他算力', MARKETS.C.qtyLabel, base ? base.Q.C - infBase : undefined, cur.Q.C - inf, false, true);
    }
  }
  const derivedRows = DERIVABLE_PARENTS
    .filter((id) => state.session.current.modes[id] === 'derived' && Number.isFinite(cur.env?.[id]))
    .map((id) => row(`${symbolHTML(id)} ${esc(SYMBOLS[id].label)}（換算）`, SYMBOLS[id].unitLabel, base?.env?.[id], cur.env[id], false, true))
    .join('');

  const title = shown.mode === 'single' ? '條件均衡結果（其他市場價格固定）' : '三市場聯立均衡結果';
  box.innerHTML = `
    <h2>${title}${state.display.stale ? '（最後有效結果）' : ''}</h2>
    <div class="table-wrap"><table class="result-table">
      <thead><tr><th>項目</th><th>基準</th><th>新情境</th><th>絕對變化</th><th>百分比變化</th></tr></thead>
      <tbody>${rows}${derivedRows}</tbody>
    </table></div>
    <p class="foot">新情境狀態：${STATUS_LABELS[cur.status]}。基準值為 0 時百分比顯示「不適用」；滑過數字可看精確值。</p>`;
}

// ---------- 模式與單市場設定 ----------

const fixedBox = $('#fixed-prices');
fixedBox.innerHTML = PRICE_IDS.map((id, i) => {
  const mk = MARKETS[MARKET_IDS[i]];
  return `<label>${symbolHTML(id)}（${esc(mk.priceLabel)}）<input type="number" step="any" id="fixed-${id}" data-price="${id}"></label>`;
}).join('');

document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', () => ctx.commit(setSolver(state.session, { mode: r.value }))));
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

// ---------- 匯出匯入 ----------

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function scenarioCSV() {
  const s = state.session.current;
  const env = state.computed?.current?.env ?? {};
  const head = ['層級', '符號', '名稱', '單位', '數值', '下限', '上限', '來源', '輸入方式', '目前換算值'];
  const line = (x, level) => [
    level, x.id, x.label, x.unitLabel, s.values[x.id]?.value ?? '',
    s.ranges[x.id]?.low ?? '', s.ranges[x.id]?.high ?? '',
    s.values[x.id]?.source ?? '', s.modes[x.id] ?? '—', Number.isFinite(env[x.id]) ? env[x.id] : '',
  ];
  const rows = [...FACTORS.map((x) => line(x, 'Level 1')), ...LEVEL2.map((x) => line(x, 'Level 2'))];
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return ['﻿' + head.map(q).join(','), ...rows.map((r) => r.map(q).join(','))].join('\n');
}

function exportJSON() {
  download(`ai-three-market-scenario-${stamp()}.json`, JSON.stringify(exportSession(state.session, state.computed, state.sensitivity), null, 2));
  notify(`已匯出 JSON${state.sensitivity ? '（含敏感度結果）' : '（尚未計算敏感度）'}。`, 'ok');
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

function runAction(name, payload) {
  switch (name) {
    case 'save-baseline': ctx.commit(saveAsBaseline(state.session)); notify('已把目前情境儲存為比較基準。', 'ok'); break;
    case 'reset': ctx.commit(resetCurrent(state.session)); notify('目前情境已重設為基準。', 'ok'); break;
    case 'export': exportJSON(); break;
    case 'import': fileInput.click(); break;
    case 'export-csv': download(`ai-three-market-factors-${stamp()}.csv`, scenarioCSV(), 'text/csv'); notify('已匯出因素 CSV（含單位與區間）。', 'ok'); break;
    case 'export-sensitivity-csv':
      if (!payload) { notify('尚未計算敏感度。', 'warn'); break; }
      download(`ai-three-market-sensitivity-${stamp()}.csv`, sensitivityCSV(payload), 'text/csv');
      notify('已匯出敏感度 CSV。', 'ok');
      break;
    default: break;
  }
}
document.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => runAction(b.dataset.action)));

// ---------- 分頁 ----------

const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
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
const level2Panel = buildLevel2Panel($('#panel-level2'), ctx);
const coefPanel = buildCoefficientPanel($('#panel-coefs'), ctx);
const scenarioPanel = buildScenarioPanel($('#panel-scenarios'), ctx);
const editor = buildEditor($('#editor'), $('#editor-body'), ctx);
const sensPanel = buildSensitivityPanel($('#sensitivity'), ctx);

recompute();
if (stored.error) notify(`本機儲存的情境無法讀取（${stored.error}），已載入 ${MODEL_VERSION} 版基準情境。`, 'warn');
