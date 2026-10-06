// 因素（Level 1）、子變數（Level 2）、係數、情境面板。
// 面板只建一次，之後以 sync() 更新數值與狀態，避免打斷輸入焦點。

import {
  BASELINE_EQUILIBRIUM, CATEGORIES, CHILDREN_OF, COEFFICIENTS, COEFFICIENT_GROUPS, FACTORS, FACTOR_BY_ID,
  LEVEL2, MODEL_VERSION, PENDING_FACTORS, PLAYERS, REFERENCE_ROWS, SOURCE_LABELS,
} from '../engine/model.js';
import {
  deleteSaved, duplicateScenario, loadSaved, resetCoefficients, resetFactors, restoreDefaults, setMode, setRange,
  setSolver, setValue,
} from '../engine/session.js';
import { el, esc, fmtNum, inputValue, symbolHTML } from './format.js';

const AVAILABILITY = {
  1: '公開可查', 2: '需換算／定口徑', 3: '需私有資料／估計', 4: '未定義／無來源',
};

function badge(node, source) {
  node.className = `badge ${source}`;
  node.textContent = SOURCE_LABELS[source] ?? source;
}

function readNumber(input) {
  const raw = input.value.trim();
  if (raw === '') return { ok: false, message: '請輸入數字；空白不會被當成 0' };
  const v = Number(raw);
  if (!Number.isFinite(v)) return { ok: false, message: '請輸入有限數字（可用 1.5e11 科學記號）' };
  return { ok: true, value: v };
}

/** 滑桿範圍：以研究區間為主，向外留 50% 以便觀察區間外情境。 */
function sliderBounds(x) {
  const span = x.high - x.low;
  const pad = span > 0 ? span * 0.5 : Math.max(Math.abs(x.base) * 0.5, 1);
  const min = x.domain?.min !== undefined ? Math.max(x.low - pad, x.domain.min) : x.low - pad;
  const max = x.high + pad;
  return [min, max > min ? max : min + 1];
}

function valueRow(x, ctx, { showMode = false } = {}) {
  const [smin, smax] = sliderBounds(x);
  const node = el('div', { class: 'row', 'data-id': x.id });
  const children = CHILDREN_OF[x.id] ?? [];
  node.innerHTML = `
    <div class="row-head">
      <label class="row-label" for="num-${x.id}"><span class="sym">${symbolHTML(x.id)}</span><span>${esc(x.label)}</span></label>
      <span data-badge></span>
    </div>
    <div class="row-inputs">
      <input type="range" min="${smin}" max="${smax}" step="${(smax - smin) / 1000}" aria-label="${esc(x.label)} ${x.id} 滑桿（${esc(x.unitLabel)}）">
      <input type="number" id="num-${x.id}" step="any" inputmode="decimal" aria-describedby="unit-${x.id} err-${x.id}">
      <span class="unit" id="unit-${x.id}">單位：${esc(x.unitLabel)}｜資料可得性：${esc(AVAILABILITY[x.availability] ?? '—')}</span>
    </div>
    ${showMode && children.length ? `
    <div class="mode-row">
      <span>輸入方式</span>
      <label><input type="radio" name="mode-${x.id}" value="direct"> 直接設定</label>
      <label><input type="radio" name="mode-${x.id}" value="derived"> 由 ${children.length} 個子項換算</label>
      <span class="derived-value" data-derived hidden></span>
    </div>` : ''}
    <details class="range-box">
      <summary>研究區間（敏感度用）</summary>
      <div class="kv">
        <label for="low-${x.id}">下限</label><input type="number" id="low-${x.id}" step="any">
        <label for="high-${x.id}">上限</label><input type="number" id="high-${x.id}" step="any">
      </div>
      <p class="hint">下限 ≤ 基準 ≤ 上限；敏感度只替換這個因素到端點，其餘輸入固定基準。</p>
    </details>
    <p class="meta">${x.shared ? `<span class="shared">跨市場共用</span>` : ''}${x.parents ? `<span class="shared">父層：${x.parents.map((p) => `${FACTOR_BY_ID[p]?.label ?? p}`).join('、')}</span>` : ''}<span>${esc(x.sourceNote ?? '研究情境假設')}</span></p>
    ${x.note ? `<p class="note">${esc(x.note)}</p>` : ''}
    <p class="field-error" id="err-${x.id}" data-error hidden></p>
    <details class="teach"><summary>傳導與影響條件</summary><div data-teach></div></details>`;

  const range = node.querySelector('input[type="range"]');
  const num = node.querySelector(`#num-${x.id}`);
  const low = node.querySelector(`#low-${x.id}`);
  const high = node.querySelector(`#high-${x.id}`);
  const errEl = node.querySelector('[data-error]');
  const teach = node.querySelector('.teach');
  const localErr = { message: null };

  const commit = (value) => {
    let next = setValue(ctx.session, x.id, value);
    // 編輯子變數時自動改用換算模式，否則父層不會更新
    if (x.parents) {
      const needed = x.parents.filter((p) => next.current.modes[p] !== 'derived');
      for (const p of needed) next = setMode(next, p, 'derived');
      if (needed.length) ctx.notify(`已將 ${needed.join('、')} 改為「由子項換算」，父層的直接輸入已鎖定。`, 'ok');
    }
    ctx.commit(next);
  };

  range.addEventListener('input', () => { localErr.message = null; num.value = inputValue(range.valueAsNumber); commit(range.valueAsNumber); });
  num.addEventListener('input', () => {
    const r = readNumber(num);
    localErr.message = r.ok ? null : r.message;
    if (r.ok) commit(r.value); else sync();
  });
  num.addEventListener('blur', () => { if (localErr.message) { localErr.message = null; sync(); } });
  low.addEventListener('change', () => { const r = readNumber(low); if (r.ok) ctx.commit(setRange(ctx.session, x.id, { low: r.value })); else sync(); });
  high.addEventListener('change', () => { const r = readNumber(high); if (r.ok) ctx.commit(setRange(ctx.session, x.id, { high: r.value })); else sync(); });
  node.querySelectorAll(`input[name="mode-${x.id}"]`).forEach((radio) => {
    radio.addEventListener('change', () => ctx.commit(setMode(ctx.session, x.id, radio.value)));
  });
  teach.addEventListener('toggle', () => { if (teach.open) renderTeach(); });

  function renderTeach() {
    const box = node.querySelector('[data-teach]');
    const kids = children.map((id) => LEVEL2.find((s) => s.id === id)).filter(Boolean);
    box.innerHTML = `
      <p><strong>影響條件：</strong>${esc(x.condition ?? '—')}</p>
      ${x.parents ? `<p><strong>父層換算：</strong>改這個子項會先更新 ${esc(x.parents.join('、'))}，再重新求三市場均衡。</p>` : ''}
      ${kids.length ? `<p><strong>子項（${kids.length}）：</strong>${kids.map((k) => esc(k.label)).join('、')}</p>` : ''}
      <p class="t-muted">完整均衡變動由三市場聯立求解決定；敏感度分數見「敏感度」分頁。</p>`;
  }

  function sync() {
    const v = ctx.session.current.values[x.id];
    const mode = ctx.session.current.modes?.[x.id];
    const isDerived = mode === 'derived';
    if (document.activeElement !== num && !localErr.message) num.value = inputValue(v.value);
    if (document.activeElement !== range) range.value = String(v.value);
    num.disabled = isDerived;
    range.disabled = isDerived;
    badge(node.querySelector('[data-badge]'), isDerived ? 'derived' : v.source);
    const r = ctx.session.current.ranges[x.id] ?? {};
    if (document.activeElement !== low) low.value = inputValue(r.low);
    if (document.activeElement !== high) high.value = inputValue(r.high);
    node.querySelectorAll(`input[name="mode-${x.id}"]`).forEach((radio) => { radio.checked = radio.value === (mode ?? 'direct'); });
    const dv = node.querySelector('[data-derived]');
    if (dv) {
      const env = ctx.computed?.current?.env;
      const show = isDerived && env && Number.isFinite(env[x.id]);
      dv.hidden = !show;
      if (show) dv.textContent = `換算結果：${fmtNum(env[x.id])} ${x.unitLabel}`;
    }
    const inputErr = ctx.computed?.current?.inputErrors?.find((e) => e.id === x.id)?.message;
    const warn = ctx.computed?.current?.warnings?.find((e) => e.id === x.id)?.message;
    const msg = localErr.message ?? inputErr ?? warn ?? null;
    errEl.hidden = !msg;
    errEl.textContent = msg ?? '';
    errEl.className = `field-${localErr.message || inputErr ? 'error' : 'warn'}`;
    num.setAttribute('aria-invalid', localErr.message || inputErr ? 'true' : 'false');
    if (teach.open) renderTeach();
  }

  return { node, sync };
}

// ---------- Level 1 ----------

export function buildFactorPanel(root, ctx) {
  root.innerHTML = '';
  const intro = el('div', { class: 'panel-intro' }, `
    <p>41 個直接進入供需式的 Level 1 因素，依四個 Player 與五大項分組（模型版本 ${MODEL_VERSION}）。有子項者可切換「直接設定」或「由 Level 2 換算」。</p>
    <div class="btns"><button type="button" data-reset-factors>重設所有因素（回到基準）</button></div>`);
  intro.querySelector('[data-reset-factors]').addEventListener('click', () => ctx.commit(resetFactors(ctx.session)));
  root.append(intro);

  const rows = [];
  for (const player of PLAYERS) {
    const list = FACTORS.filter((x) => x.player === player.id);
    if (!list.length) continue;
    const sec = el('section', { class: 'group' }, `<h3>${esc(player.label)}</h3>`);
    for (const [catId, catLabel] of Object.entries(CATEGORIES)) {
      const inCat = list.filter((x) => x.category === catId);
      if (!inCat.length) continue;
      sec.append(el('h4', { class: 'cat' }, esc(catLabel)));
      for (const x of inCat) {
        const row = valueRow(x, ctx, { showMode: true });
        rows.push(row);
        sec.append(row.node);
      }
    }
    root.append(sec);
  }
  root.append(el('section', { class: 'group pending' }, `
    <h3>待估因素（不以 0 代替）</h3>
    <ul>${PENDING_FACTORS.map((p) => `<li><span class="sym">${symbolHTML(p.id)}</span> ${esc(p.label)}（${esc(p.unitLabel)}）：${esc(p.reason)}</li>`).join('')}</ul>
    <p class="t-muted">P_H、P_C、P_A 為求解輸出，不是外生因素。</p>`));
  return { sync: () => rows.forEach((r) => r.sync()) };
}

// ---------- Level 2 ----------

export function buildLevel2Panel(root, ctx) {
  root.innerHTML = '';
  root.append(el('div', { class: 'panel-intro' }, `
    <p>61 個子變數。修改子項會先更新它影響的全部父層（自動切換為「由子項換算」），再重新求均衡；不把換算出的父層值截回父層區間。</p>
    <p>另有 4 筆同量換算／參照不獨立排名：${REFERENCE_ROWS.map((r) => esc(r.label)).join('、')}。</p>`));

  const rows = [];
  const byParent = new Map();
  for (const s of LEVEL2) {
    const key = s.parents.join('、');
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(s);
  }
  let first = true;
  for (const [key, list] of byParent) {
    const det = el('details', { class: 'coef-group', open: first });
    first = false;
    const parentLabels = key.split('、').map((p) => `${FACTOR_BY_ID[p]?.label ?? p}（${p}）`).join('、');
    det.innerHTML = `<summary>→ ${esc(parentLabels)}<span class="count">${list.length}</span></summary><div class="rows"></div>`;
    const box = det.querySelector('.rows');
    for (const s of list) {
      const row = valueRow(s, ctx);
      rows.push(row);
      box.append(row.node);
    }
    root.append(det);
  }
  return { sync: () => rows.forEach((r) => r.sync()) };
}

// ---------- 係數 ----------

export function buildCoefficientPanel(root, ctx) {
  root.innerHTML = '';
  const intro = el('div', { class: 'panel-intro' }, `
    <p>係數、截距與價格斜率；與要排名的因素分開。標「推導」者由第 04 頁 4.1 節的經濟關係決定（如 k_AC＝b_A、k_HC＝d_H·m、k_CH＝d_H·h_new），其餘為設定的反應幅度。</p>
    <p>敏感度分析時係數固定於同一輪，不在每個端點重新校準。</p>
    <div class="btns"><button type="button" data-reset-coefs>重設係數（回到基準）</button></div>`);
  intro.querySelector('[data-reset-coefs]').addEventListener('click', () => ctx.commit(resetCoefficients(ctx.session)));
  root.append(intro);

  const rows = [];
  COEFFICIENT_GROUPS.forEach((g, i) => {
    const list = COEFFICIENTS.filter((c) => c.group === g.id);
    if (!list.length) return;
    const det = el('details', { class: 'coef-group', open: i === 0 });
    det.innerHTML = `<summary>${esc(g.label)}<span class="count">${list.length}</span></summary><div class="rows"></div>`;
    const box = det.querySelector('.rows');
    for (const c of list) {
      const node = el('div', { class: 'row coef', 'data-id': c.id });
      node.innerHTML = `
        <div class="row-head">
          <label class="row-label" for="coef-${c.id}"><span class="sym">${symbolHTML(c.id)}</span><span>${esc(c.label)}</span></label>
          <span class="badge ${c.origin === 'derived' ? 'calibrated' : 'assumption'}">${c.origin === 'derived' ? '推導' : '設定'}</span>
        </div>
        <div class="row-inputs">
          <input type="number" id="coef-${c.id}" step="any" inputmode="decimal">
          <span class="unit" style="grid-column:auto">${esc(c.unitLabel)}</span>
        </div>
        ${c.purpose ? `<p class="purpose">${esc(c.purpose)}</p>` : ''}
        <p class="field-error" data-error hidden></p>`;
      const num = node.querySelector('input');
      const errEl = node.querySelector('[data-error]');
      let localErr = null;
      num.addEventListener('input', () => {
        const r = readNumber(num);
        localErr = r.ok ? null : r.message;
        if (r.ok) ctx.commit(setValue(ctx.session, c.id, r.value)); else sync();
      });
      num.addEventListener('blur', () => { if (localErr) { localErr = null; sync(); } });
      function sync() {
        const v = ctx.session.current.values[c.id];
        if (document.activeElement !== num && !localErr) num.value = inputValue(v.value);
        errEl.hidden = !localErr;
        errEl.textContent = localErr ?? '';
      }
      rows.push({ sync });
      box.append(node);
    }
    root.append(det);
  });
  return { sync: () => rows.forEach((r) => r.sync()) };
}

// ---------- 情境 ----------

export function buildScenarioPanel(root, ctx) {
  root.innerHTML = `
    <div class="scn">
      <h3>目前情境</h3>
      <div class="kv"><label for="scn-name">名稱</label><input type="text" id="scn-name"></div>
      <p>比較基準：<strong data-baseline-name></strong></p>
      <div class="btns">
        <button type="button" data-save-baseline>儲存為基準</button>
        <button type="button" data-reset>重設（回到基準）</button>
        <button type="button" data-restore>還原網站預設</button>
      </div>

      <h3>複製情境</h3>
      <div class="inline"><label class="sr-only" for="dup-name">新情境名稱</label><input type="text" id="dup-name" placeholder="例如：高推理強度"><button type="button" data-dup>複製</button></div>
      <ul class="saved-list" data-saved></ul>

      <h3>匯出／匯入</h3>
      <p>JSON 包含方法識別（oat_baseline_pct_max_abs）、模型版本、全部因素與上下限、單位與來源、父層決定式、輸入模式、係數、公式、容差、結果與敏感度。CSV 匯出數值與單位。</p>
      <div class="btns">
        <button type="button" data-export>匯出 JSON</button>
        <button type="button" data-import>匯入 JSON</button>
        <button type="button" data-export-csv>匯出 CSV</button>
      </div>

      <h3>求解設定</h3>
      <div class="kv">
        <label for="tol-rel">相對容差</label><input type="number" id="tol-rel" step="any" min="0">
        <label for="tol-abs">絕對容差</label><input type="number" id="tol-abs" step="any" min="0">
        <label for="max-iter">最大迭代次數</label><input type="number" id="max-iter" step="1" min="1" max="1000">
      </div>
      <p>預設式對三個價格為線性，可直接以線性代數求解並代回核對；改成非線性式時改用數值求解。</p>

      <h3>2027 基準均衡</h3>
      <table class="mini-table"><tbody>
        <tr><td>硬體</td><td>P_H＝${fmtNum(BASELINE_EQUILIBRIUM.P.P_H)} 美元／有效 PFLOPS</td><td>Q_H＝${fmtNum(BASELINE_EQUILIBRIUM.Q.H)}</td></tr>
        <tr><td>算力</td><td>P_C＝${BASELINE_EQUILIBRIUM.P.P_C} 美元／PFLOP-hour</td><td>Q_C＝${fmtNum(BASELINE_EQUILIBRIUM.Q.C)}</td></tr>
        <tr><td>AI 服務</td><td>P_A＝${BASELINE_EQUILIBRIUM.P.P_A} 美元／百萬 token</td><td>Q_A＝${fmtNum(BASELINE_EQUILIBRIUM.Q.A)}</td></tr>
        <tr><td>分群</td><td colspan="2">企業 240 億／個人 80 億／政府 80 億 百萬 token／年；推論與其他算力各 40 億 PFLOP-hour</td></tr>
      </tbody></table>

      <h3>資料標記</h3>
      <p><span class="badge observed">公開可查（參照）</span> r、e、u 等有公開參照值；區間仍多為研究者估計。</p>
      <p><span class="badge assumption">研究情境假設</span> 2027 單期研究情境值，非公司或市場觀測資料。</p>
      <p><span class="badge calibrated">由父層換算</span> 以 Level 2 子項換算得到的父層值。</p>
      <p><span class="badge user">使用者輸入</span> 你修改過的值。</p>

      <h3>保存方式</h3>
      <p data-storage>情境自動存在這個瀏覽器；重新整理可恢復。清除瀏覽器資料會移除；跨裝置請用 JSON 匯出／匯入。不同瀏覽器或無痕視窗各自獨立，不會改寫網站預設模型。</p>
    </div>`;

  const nameInput = root.querySelector('#scn-name');
  nameInput.addEventListener('change', () => {
    const next = structuredClone(ctx.session);
    next.current.name = nameInput.value.trim() || '未命名情境';
    ctx.commit(next);
  });
  root.querySelector('[data-save-baseline]').addEventListener('click', () => ctx.action('save-baseline'));
  root.querySelector('[data-reset]').addEventListener('click', () => ctx.action('reset'));
  root.querySelector('[data-restore]').addEventListener('click', () => {
    if (window.confirm('還原網站預設會以 2027 基準情境取代目前情境與基準（已複製的情境保留）。確定嗎？')) {
      ctx.replaceSession(restoreDefaults(ctx.session), '已還原網站預設的 2027 基準情境。');
    }
  });
  const dupName = root.querySelector('#dup-name');
  root.querySelector('[data-dup]').addEventListener('click', () => {
    const name = dupName.value.trim() || `${ctx.session.current.name}（複本 ${ctx.session.saved.length + 1}）`;
    ctx.commit(duplicateScenario(ctx.session, name));
    dupName.value = '';
    ctx.notify(`已複製為「${name}」。`, 'ok');
  });
  root.querySelector('[data-export]').addEventListener('click', () => ctx.action('export'));
  root.querySelector('[data-import]').addEventListener('click', () => ctx.action('import'));
  root.querySelector('[data-export-csv]').addEventListener('click', () => ctx.action('export-csv'));

  const tolRel = root.querySelector('#tol-rel');
  const tolAbs = root.querySelector('#tol-abs');
  const maxIter = root.querySelector('#max-iter');
  const bind = (input, key, valid) => input.addEventListener('change', () => {
    const v = input.valueAsNumber;
    if (valid(v)) ctx.commit(setSolver(ctx.session, { [key]: v }));
    else { ctx.notify('數值無效，未套用。', 'warn'); sync(); }
  });
  bind(tolRel, 'relTol', (v) => v > 0 && v < 1);
  bind(tolAbs, 'absTol', (v) => v > 0 && v < 1);
  bind(maxIter, 'maxIter', (v) => Number.isInteger(v) && v >= 1 && v <= 1000);

  const savedList = root.querySelector('[data-saved]');
  function sync() {
    const s = ctx.session;
    if (document.activeElement !== nameInput) nameInput.value = s.current.name;
    root.querySelector('[data-baseline-name]').textContent = s.baseline.name;
    if (document.activeElement !== tolRel) tolRel.value = s.solver.relTol;
    if (document.activeElement !== tolAbs) tolAbs.value = s.solver.absTol;
    if (document.activeElement !== maxIter) maxIter.value = s.solver.maxIter;
    const key = JSON.stringify(s.saved.map((x) => [x.name, x.savedAt]));
    if (savedList.dataset.key !== key) {
      savedList.dataset.key = key;
      savedList.innerHTML = s.saved.length ? '' : '<li><span class="t-muted">尚未複製任何情境</span></li>';
      s.saved.forEach((item, i) => {
        const li = el('li', {}, `<span title="${esc(item.name)}">${esc(item.name)}</span><button type="button" class="small" data-load>載入</button><button type="button" class="small" data-del aria-label="刪除 ${esc(item.name)}">刪除</button>`);
        li.querySelector('[data-load]').addEventListener('click', () => { ctx.commit(loadSaved(ctx.session, i)); ctx.notify(`已載入「${item.name}」。`, 'ok'); });
        li.querySelector('[data-del]').addEventListener('click', () => { if (window.confirm(`刪除「${item.name}」？`)) ctx.commit(deleteSaved(ctx.session, i)); });
        savedList.append(li);
      });
    }
    if (!ctx.storageAvailable) root.querySelector('[data-storage]').textContent = '這個瀏覽器目前無法使用本機儲存；網站仍可使用，但重新整理後情境不會保留，請用 JSON 匯出保存。';
  }
  return { sync };
}
