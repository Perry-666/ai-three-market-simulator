// 方程式編輯器：直接修改表達式；預覽與引擎共用同一解析器與語法樹。

import { DEFAULT_EXPR, DEFAULT_FORMULAS, FORMULA_META } from '../engine/model.js';
import { FUNCTIONS, parse, renderHTML } from '../engine/parser.js';
import { resetAllFormulas, resetFormula, setFormula } from '../engine/session.js';
import { el, esc, symbolHTML } from './format.js';

const UNIT_LABEL = { ok: '單位一致', unverified: '單位未驗證', mismatch: '單位不一致' };

export function buildEditor(details, root, ctx) {
  root.innerHTML = `
    <p class="hint">可直接修改供給／需求與衍生式。受限數學運算解析器只允許：數字、已宣告的因素／係數／價格／衍生式、<code>+ - * / ^</code>、括號與函數 ${Object.keys(FUNCTIONS).map((f) => `<code>${f}</code>`).join(' ')}；不使用 JavaScript eval。錯誤會指出位置，並保留最後有效圖表。修改只影響你的瀏覽器工作階段。</p>
    <div class="editor-actions"><button type="button" data-reset-all>全部還原預設式</button></div>
    <div class="formulas"></div>`;
  root.querySelector('[data-reset-all]').addEventListener('click', () => ctx.commit(resetAllFormulas(ctx.session)));
  const list = root.querySelector('.formulas');
  const items = new Map();

  for (const f of DEFAULT_FORMULAS) {
    const meta = FORMULA_META[f.id];
    const node = el('div', { class: 'formula', 'data-id': f.id });
    node.innerHTML = `
      <div class="formula-head">
        <label for="fx-${f.id}"><span class="sym">${symbolHTML(f.id)}</span> ${esc(meta.label)}</label>
        <span class="unit">${esc(meta.unitLabel)}</span>
        <span class="unit-status" data-unit></span>
        <span class="modified" data-modified hidden>已修改</span>
        <span class="spacer"></span>
        <button type="button" class="small" data-reset>還原預設式</button>
      </div>
      <textarea id="fx-${f.id}" rows="2" spellcheck="false" autocomplete="off" autocapitalize="off" aria-describedby="fx-err-${f.id} fx-unit-${f.id}"></textarea>
      <div class="preview" aria-label="公式預覽" data-preview></div>
      <p class="unit-msg" id="fx-unit-${f.id}" data-unit-msg></p>
      <div class="fx-error" id="fx-err-${f.id}" data-error hidden></div>`;
    const ta = node.querySelector('textarea');
    let timer = 0;
    ta.addEventListener('input', () => {
      preview(f.id, ta.value);
      clearTimeout(timer);
      timer = setTimeout(() => ctx.commit(setFormula(ctx.session, f.id, ta.value)), 300);
    });
    ta.addEventListener('blur', () => {
      clearTimeout(timer);
      const cur = ctx.session.current.formulas.find((x) => x.id === f.id)?.expr;
      if (cur !== ta.value) ctx.commit(setFormula(ctx.session, f.id, ta.value));
    });
    node.querySelector('[data-reset]').addEventListener('click', () => ctx.commit(resetFormula(ctx.session, f.id)));
    items.set(f.id, { node, ta, lastPreview: '' });
    list.append(node);
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
    for (const f of ctx.session.current.formulas) {
      const item = items.get(f.id);
      if (!item) continue;
      if (document.activeElement !== item.ta && item.ta.value !== f.expr) item.ta.value = f.expr;
      if (document.activeElement !== item.ta) preview(f.id, f.expr);
      item.node.querySelector('[data-modified]').hidden = f.expr === DEFAULT_EXPR[f.id];

      const unit = comp?.units?.[f.id];
      const unitEl = item.node.querySelector('[data-unit]');
      const unitMsg = item.node.querySelector('[data-unit-msg]');
      unitEl.className = `unit-status ${unit?.status ?? ''}`;
      unitEl.textContent = unit ? UNIT_LABEL[unit.status] : '';
      unitMsg.textContent = unit && unit.status !== 'ok' ? unit.message : '';

      const errs = (comp?.errors ?? []).filter((e) => e.formulaId === f.id);
      const errEl = item.node.querySelector('[data-error]');
      errEl.hidden = errs.length === 0;
      item.ta.setAttribute('aria-invalid', errs.length ? 'true' : 'false');
      errEl.innerHTML = errs.map((e) => {
        const hasPos = Number.isInteger(e.start) && e.start !== null;
        const s = hasPos ? e.start : 0;
        const t = hasPos ? Math.max(e.end ?? s + 1, s + 1) : 0;
        const snippet = hasPos
          ? `<code>${esc(f.expr.slice(0, s))}<mark>${esc(f.expr.slice(s, t) || ' ')}</mark>${esc(f.expr.slice(t))}</code>`
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
