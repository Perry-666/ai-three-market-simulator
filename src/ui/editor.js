// 方程式編輯器：供需式與父層換算式；預覽與引擎共用同一解析器與語法樹。

import { DEFAULT_EXPR, DERIVATIONS, FORMULA_META, MARKET_FORMULAS, SYMBOLS } from '../engine/model.js';
import { FUNCTIONS, parse, renderHTML } from '../engine/parser.js';
import { resetAllFormulas, resetFormula, setFormula } from '../engine/session.js';
import { el, esc, symbolHTML } from './format.js';

const UNIT_LABEL = { ok: '單位一致', unverified: '單位未驗證', mismatch: '單位不一致' };

export function buildEditor(details, root, ctx) {
  root.innerHTML = `
    <p class="hint">可修改六條供需式的非價格項、價格項，以及 Level 2 → Level 1 的父層換算式。受限數學解析器只允許數字、已宣告符號、<code>+ - * / ^</code>、括號與函數 ${Object.keys(FUNCTIONS).map((f) => `<code>${f}</code>`).join(' ')}；不以 JavaScript eval 執行。錯誤會指出位置並保留最後有效圖表。</p>
    <div class="editor-actions"><button type="button" data-reset-all>全部還原預設式</button></div>
    <h3 class="fx-group">市場供需式</h3><div class="formulas" data-market></div>
    <h3 class="fx-group">父層換算式（Level 2 → Level 1）</h3>
    <p class="hint">只有在對應父層切換為「由子項換算」時才會使用；中間量（C_F、G_F、J_F…）一律計算，供台積電傳導鏈顯示。</p>
    <div class="formulas" data-deriv></div>`;
  root.querySelector('[data-reset-all]').addEventListener('click', () => ctx.commit(resetAllFormulas(ctx.session)));

  const items = new Map();
  const add = (container, id, label, unitLabel, note) => {
    const node = el('div', { class: 'formula', 'data-id': id });
    node.innerHTML = `
      <div class="formula-head">
        <label for="fx-${id}"><span class="sym">${symbolHTML(id)}</span> ${esc(label)}</label>
        ${unitLabel ? `<span class="unit">${esc(unitLabel)}</span>` : ''}
        <span class="unit-status" data-unit></span>
        <span class="modified" data-modified hidden>已修改</span>
        <span class="spacer"></span>
        <button type="button" class="small" data-reset>還原預設式</button>
      </div>
      <textarea id="fx-${id}" rows="2" spellcheck="false" autocomplete="off" autocapitalize="off" aria-describedby="fx-err-${id}"></textarea>
      <div class="preview" aria-label="公式預覽" data-preview></div>
      ${note ? `<p class="note">${esc(note)}</p>` : ''}
      <p class="unit-msg" data-unit-msg></p>
      <div class="fx-error" id="fx-err-${id}" data-error hidden></div>`;
    const ta = node.querySelector('textarea');
    let timer = 0;
    ta.addEventListener('input', () => {
      preview(id, ta.value);
      clearTimeout(timer);
      timer = setTimeout(() => ctx.commit(setFormula(ctx.session, id, ta.value)), 300);
    });
    ta.addEventListener('blur', () => {
      clearTimeout(timer);
      if (currentExpr(id) !== ta.value) ctx.commit(setFormula(ctx.session, id, ta.value));
    });
    node.querySelector('[data-reset]').addEventListener('click', () => ctx.commit(resetFormula(ctx.session, id)));
    items.set(id, { node, ta, lastPreview: '' });
    container.append(node);
  };

  const marketBox = root.querySelector('[data-market]');
  for (const f of MARKET_FORMULAS) {
    const meta = FORMULA_META[f.id] ?? {};
    add(marketBox, f.id, meta.label ?? f.id, meta.unitLabel, null);
  }
  const derivBox = root.querySelector('[data-deriv]');
  for (const d of DERIVATIONS) {
    const label = d.target ? `→ ${SYMBOLS[d.target]?.label ?? d.target}（${d.target}）` : '中間量';
    add(derivBox, d.id, label, d.target ? SYMBOLS[d.target]?.unitLabel : null, d.note);
  }

  function currentExpr(id) {
    return ctx.session.current.formulas.find((x) => x.id === id)?.expr
      ?? ctx.session.current.derivations.find((x) => x.id === id)?.expr;
  }

  function preview(id, expr) {
    const item = items.get(id);
    const box = item.node.querySelector('[data-preview]');
    try {
      const html = `${symbolHTML(id)} = ${renderHTML(parse(expr))}`;
      item.lastPreview = html;
      box.innerHTML = html;
      box.classList.remove('dim');
      box.title = '';
    } catch {
      box.innerHTML = item.lastPreview;
      box.classList.add('dim');
      box.title = '目前文字無法解析，預覽顯示最後可解析的式子';
    }
  }

  function sync() {
    const comp = ctx.computed?.current;
    for (const [id, item] of items) {
      const expr = currentExpr(id);
      if (expr === undefined) continue;
      if (document.activeElement !== item.ta && item.ta.value !== expr) item.ta.value = expr;
      if (document.activeElement !== item.ta) preview(id, expr);
      item.node.querySelector('[data-modified]').hidden = expr === DEFAULT_EXPR[id];

      const unit = comp?.units?.[id];
      const unitEl = item.node.querySelector('[data-unit]');
      const unitMsg = item.node.querySelector('[data-unit-msg]');
      unitEl.className = `unit-status ${unit?.status ?? ''}`;
      unitEl.textContent = unit ? UNIT_LABEL[unit.status] : '';
      unitMsg.textContent = unit && unit.status !== 'ok' ? unit.message : '';

      const errs = (comp?.errors ?? []).filter((e) => e.formulaId === id);
      const errEl = item.node.querySelector('[data-error]');
      errEl.hidden = errs.length === 0;
      item.ta.setAttribute('aria-invalid', errs.length ? 'true' : 'false');
      errEl.innerHTML = errs.map((e) => {
        const hasPos = Number.isInteger(e.start);
        const s = hasPos ? e.start : 0;
        const t = hasPos ? Math.max(e.end ?? s + 1, s + 1) : 0;
        const snippet = hasPos
          ? `<code>${esc(expr.slice(0, s))}<mark>${esc(expr.slice(s, t) || ' ')}</mark>${esc(expr.slice(t))}</code>`
          : '';
        return `<div>✖ ${esc(e.message)}${snippet}</div>`;
      }).join('');
    }
  }

  function focus(id, start, end) {
    const item = items.get(id);
    if (!item) return;
    details.open = true;
    item.node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    item.ta.focus({ preventScroll: true });
    if (Number.isInteger(start)) item.ta.setSelectionRange(start, Math.max(end ?? start + 1, start + 1));
  }

  return { sync, focus };
}
