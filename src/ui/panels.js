// 因素面板、係數面板、情境面板。面板只建一次，之後以 sync() 更新數值與狀態，避免打斷輸入焦點。

import {
  CALIBRATION, COEFFICIENTS, COEFFICIENT_GROUPS, EQUATIONS, EQUATION_LABELS, FACTOR_GROUPS, FACTORS, FORMULA_META,
  MARKETS, SOURCE_LABELS,
} from '../engine/model.js';
import { localShift } from '../engine/analysis.js';
import { numericValues } from '../engine/scenario.js';
import {
  deleteSaved, duplicateScenario, loadSaved, resetCoefficients, resetCurrent, resetFactors, restoreDefaults,
  saveAsBaseline, setSolver, setValue,
} from '../engine/session.js';
import { el, esc, fmtNum, inputValue, symbolHTML } from './format.js';

const DIR_LABEL = { right: '右移', left: '左移', none: '無直接位移' };

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

// ---------- 因素面板 ----------

export function buildFactorPanel(root, ctx) {
  root.innerHTML = '';
  const intro = el('div', { class: 'panel-intro' }, `
    <p>第 03 頁的外生因素。滑桿與數字框同步；r、e、M、a 跨市場只有一份狀態。百分數以百分數值輸入（3.64% 輸入 3.64）。</p>
    <div class="btns"><button type="button" data-reset-factors>重設因素（回到基準）</button></div>`);
  intro.querySelector('[data-reset-factors]').addEventListener('click', () => ctx.commit(resetFactors(ctx.session)));
  root.append(intro);

  const rows = [];
  for (const g of FACTOR_GROUPS) {
    const sec = el('section', { class: 'group' }, `<h3>${esc(g.label)}</h3>${g.hint ? `<p class="hint">${esc(g.hint)}</p>` : ''}`);
    for (const f of FACTORS.filter((x) => x.group === g.id)) {
      const row = factorRow(f, ctx);
      rows.push(row);
      sec.append(row.node);
    }
    root.append(sec);
  }
  return { sync: () => rows.forEach((r) => r.sync()) };
}

function factorRow(f, ctx) {
  const [smin, smax] = f.slider;
  const node = el('div', { class: 'row', 'data-id': f.id });
  const source = f.pending
    ? '<span class="pending">第 03 頁：待填（目前為示範假設值，非實測）</span>'
    : `<span>觀測值 ${f.demo}：${esc(f.ref)}</span>`;
  node.innerHTML = `
    <div class="row-head">
      <label class="row-label" for="num-${f.id}"><span class="sym">${symbolHTML(f.id)}</span><span>${esc(f.label)}</span></label>
      <span data-badge></span>
    </div>
    <div class="row-inputs">
      <input type="range" min="${smin}" max="${smax}" step="${(smax - smin) / 1000}" aria-label="${esc(f.label)} ${f.id} 滑桿（${esc(f.unitLabel)}）">
      <input type="number" id="num-${f.id}" step="any" inputmode="decimal" aria-describedby="unit-${f.id} err-${f.id}">
      <span class="unit" id="unit-${f.id}">單位：${esc(f.unitLabel)}${f.origin ? `｜${esc(f.origin)}` : ''}</span>
    </div>
    <p class="meta">${f.shared ? `<span class="shared">跨市場共用：${f.shared.map((m) => MARKETS[m].short).join('、')}</span>` : ''}${source}</p>
    ${f.absorbedBy ? `<p class="absorbed" data-absorbed hidden>${esc(f.absorbedBy.note)}；此滑桿目前不會移動曲線。</p>` : ''}
    ${f.note ? `<p class="note">${esc(f.note)}</p>` : ''}
    <p class="field-error" id="err-${f.id}" data-error hidden></p>
    <details class="teach"><summary>移線方向（教學提示）</summary><div data-teach></div></details>`;

  const range = node.querySelector('input[type="range"]');
  const num = node.querySelector('input[type="number"]');
  const errEl = node.querySelector('[data-error]');
  const localErr = { message: null };
  const teach = node.querySelector('.teach');

  range.addEventListener('input', () => {
    localErr.message = null;
    num.value = inputValue(range.valueAsNumber);
    ctx.commit(setValue(ctx.session, f.id, range.valueAsNumber));
  });
  num.addEventListener('input', () => {
    const r = readNumber(num);
    localErr.message = r.ok ? null : r.message;
    if (r.ok) ctx.commit(setValue(ctx.session, f.id, r.value));
    else sync();
  });
  num.addEventListener('blur', () => { if (localErr.message) { localErr.message = null; sync(); } });
  teach.addEventListener('toggle', () => { if (teach.open) renderTeach(); });

  function renderTeach() {
    const box = node.querySelector('[data-teach]');
    const comp = ctx.computed?.current;
    let dirs = null;
    let problem = null;
    if (comp?.model) {
      try {
        const prices = comp.P ?? ctx.computed.baseline?.P ?? CALIBRATION.prices;
        dirs = localShift(comp.model, numericValues(ctx.session.current), prices, f.id);
      } catch (e) {
        problem = e.message;
      }
    } else {
      problem = '公式有錯誤，無法計算引擎的局部移線';
    }
    const keys = Object.keys(EQUATIONS).filter((k) => f.expect[k] || (dirs && dirs[k] !== 'none'));
    const rowsHTML = keys.map((k) => {
      const exp = f.expect[k];
      const got = dirs?.[k];
      const absorbed = f.absorbedBy && ctx.session.current.values[f.absorbedBy.coef]?.value === 0 && got === 'none' && exp;
      const mismatch = dirs && exp && got !== exp[0] && !absorbed;
      const unexpected = dirs && !exp && got !== 'none';
      return `<tr>
        <td>${esc(EQUATION_LABELS[k])}</td>
        <td>${exp ? `${DIR_LABEL[exp[0]]}<br><span class="t-muted">${esc(exp[1])}</span>` : '—'}</td>
        <td class="${mismatch || unexpected ? 'mismatch' : ''}">${got ? DIR_LABEL[got] : '—'}${absorbed ? '（已由其他變數反映）' : ''}${mismatch || unexpected ? '<br>⚠ 與第 03 頁不同' : ''}</td>
      </tr>`;
    }).join('');
    box.innerHTML = `
      <table><thead><tr><th>方程式</th><th>第 03 頁（變數↑）</th><th>引擎局部移線</th></tr></thead><tbody>${rowsHTML || '<tr><td colspan="3">無直接位移</td></tr>'}</tbody></table>
      ${problem ? `<p class="mismatch">${esc(problem)}</p>` : ''}
      <p>「引擎局部移線」固定跨市場價格，以數值差分計算因素上升時各式數量的變化。完整均衡的價格與數量變動由三市場聯立求解決定（見圖表與結果表），不預先寫死。</p>`;
  }

  function sync() {
    const v = ctx.session.current.values[f.id];
    if (document.activeElement !== num && !localErr.message) num.value = inputValue(v.value);
    if (document.activeElement !== range) range.value = String(v.value);
    badge(node.querySelector('[data-badge]'), v.source);
    const absorbed = node.querySelector('[data-absorbed]');
    if (absorbed) absorbed.hidden = ctx.session.current.values[f.absorbedBy.coef]?.value !== 0;
    const inputErr = ctx.computed?.current?.inputErrors?.find((e) => e.id === f.id)?.message;
    const msg = localErr.message ?? inputErr ?? null;
    errEl.hidden = !msg;
    errEl.textContent = msg ? `${msg}${inputErr && !localErr.message ? '（求解暫停，圖表保留最後有效結果）' : ''}` : '';
    num.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (teach.open) renderTeach();
  }

  return { node, sync };
}

// ---------- 係數面板 ----------

export function buildCoefficientPanel(root, ctx) {
  root.innerHTML = '';
  const intro = el('div', { class: 'panel-intro' }, `
    <p>各市場的截距 A、價格反應 b／d、因素係數 k，與外生因素分開。依第 04 頁：b、d 為正數，k 為非負數；係數單位＝式中數量單位 ÷ 所乘項單位。</p>
    <p>截距由示範校準反推（使各式通過假設基準點）；其餘係數為示範假設，尚未實證估計。</p>
    <div class="btns"><button type="button" data-reset-coefs>重設係數（回到基準）</button></div>`);
  intro.querySelector('[data-reset-coefs]').addEventListener('click', () => ctx.commit(resetCoefficients(ctx.session)));
  root.append(intro);

  const rows = [];
  COEFFICIENT_GROUPS.forEach((g, i) => {
    const det = el('details', { class: 'coef-group', open: i === 0 });
    const meta = FORMULA_META[g.eq];
    det.innerHTML = `<summary>${symbolHTML(g.eq)} ${esc(meta.label)}</summary><div class="rows"></div>`;
    const box = det.querySelector('.rows');
    for (const c of COEFFICIENTS.filter((x) => x.eq === g.eq)) {
      const row = coefRow(c, ctx);
      rows.push(row);
      box.append(row.node);
    }
    root.append(det);
  });
  return { sync: () => rows.forEach((r) => r.sync()) };
}

function coefRow(c, ctx) {
  const node = el('div', { class: 'row coef', 'data-id': c.id });
  const kindLabel = { intercept: '截距', slope: '價格反應', k: '因素係數' }[c.coefKind];
  node.innerHTML = `
    <div class="row-head">
      <label class="row-label" for="coef-${c.id}"><span class="sym">${symbolHTML(c.id)}</span><span>${kindLabel}${c.coefKind === 'intercept' ? '' : `（乘 ${esc(c.term)}）`}</span></label>
      <span data-badge></span>
    </div>
    <div class="row-inputs">
      <input type="number" id="coef-${c.id}" step="any" inputmode="decimal" aria-describedby="coef-unit-${c.id}">
      <span class="unit" id="coef-unit-${c.id}" style="grid-column:auto">${esc(c.unitLabel)}</span>
    </div>
    <p class="purpose">${esc(c.purpose)}</p>
    <p class="field-error" data-error hidden></p>
    <p class="field-warn" data-warn hidden></p>`;
  const num = node.querySelector('input');
  const errEl = node.querySelector('[data-error]');
  const warnEl = node.querySelector('[data-warn]');
  let localErr = null;
  num.addEventListener('input', () => {
    const r = readNumber(num);
    localErr = r.ok ? null : r.message;
    if (r.ok) ctx.commit(setValue(ctx.session, c.id, r.value));
    else sync();
  });
  num.addEventListener('blur', () => { if (localErr) { localErr = null; sync(); } });

  function sync() {
    const v = ctx.session.current.values[c.id];
    if (document.activeElement !== num && !localErr) num.value = inputValue(v.value);
    badge(node.querySelector('[data-badge]'), v.source);
    errEl.hidden = !localErr;
    errEl.textContent = localErr ?? '';
    num.setAttribute('aria-invalid', localErr ? 'true' : 'false');
    const warn = ctx.computed?.current?.warnings?.find((w) => w.id === c.id)?.message;
    warnEl.hidden = !warn;
    warnEl.textContent = warn ? `⚠ ${warn}` : '';
  }
  return { node, sync };
}

// ---------- 情境面板 ----------

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
      <div class="inline"><label class="sr-only" for="dup-name">新情境名稱</label><input type="text" id="dup-name" placeholder="例如：高利率情境"><button type="button" data-dup>複製目前情境</button></div>
      <ul class="saved-list" data-saved></ul>

      <h3>匯出／匯入 JSON</h3>
      <p>包含公式、因素、係數、單位、數值、來源標記（觀測／假設／校準／使用者）、求解設定、基準與結果摘要。匯入時缺值會報錯，不會補 0。</p>
      <div class="btns"><button type="button" data-export>匯出 JSON</button><button type="button" data-import>匯入 JSON</button></div>

      <h3>求解設定</h3>
      <div class="kv">
        <label for="tol-lin">線性殘差容許值</label><input type="number" id="tol-lin" step="any" min="0">
        <label for="tol-nl">非線性殘差容許值</label><input type="number" id="tol-nl" step="any" min="0">
        <label for="max-iter">最大迭代次數</label><input type="number" id="max-iter" step="1" min="1" max="1000">
      </div>
      <p>預設模型對三個價格為線性：以線性代數直接求解並代回六條式子核對。改成非線性式時改用 Newton 法；找不到解就顯示狀態。</p>

      <h3>示範校準基準點（假設）</h3>
      <table class="mini-table"><tbody>
        ${['H', 'C', 'A'].map((m) => `<tr><td>${esc(MARKETS[m].short)}</td><td>${symbolHTML(MARKETS[m].price)}＝${fmtNum(CALIBRATION.prices[MARKETS[m].price])} ${esc(MARKETS[m].priceLabel)}</td><td>${symbolHTML(MARKETS[m].quantity)}＝${fmtNum(CALIBRATION.quantities[m])} ${esc(MARKETS[m].qtyLabel)}</td></tr>`).join('')}
        <tr><td>分群</td><td colspan="2">share_E＝${CALIBRATION.shares.E}%、share_U＝${CALIBRATION.shares.U}%、share_G＝${CALIBRATION.shares.G}%（使用量占比，只用於反推截距）</td></tr>
      </tbody></table>
      <p>${esc(CALIBRATION.note)}</p>

      <h3>資料標記</h3>
      <p><span class="badge observed">來源觀測值</span> 來自第 03 頁參考數值（r、e）。</p>
      <p><span class="badge assumption">示範假設</span> 第 03 頁為「待填」或係數尚未估計，補入的示範值。</p>
      <p><span class="badge calibrated">示範校準（反推）</span> 截距，使各式通過假設基準點。</p>
      <p><span class="badge user">使用者輸入</span> 你修改過的值。</p>

      <h3>保存方式</h3>
      <p data-storage>目前情境自動存在這個瀏覽器的本機儲存；重新整理可恢復。清除瀏覽器資料會移除；跨裝置請用 JSON 匯出／匯入。不同瀏覽器或無痕視窗各自獨立。</p>
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
    if (window.confirm('還原網站預設會以示範情境取代目前情境與基準（已複製的情境保留）。確定嗎？')) {
      ctx.replaceSession(restoreDefaults(ctx.session), '已還原網站預設的示範情境。');
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

  const tolLin = root.querySelector('#tol-lin');
  const tolNl = root.querySelector('#tol-nl');
  const maxIter = root.querySelector('#max-iter');
  const solverInput = (input, key, valid) => input.addEventListener('change', () => {
    const v = input.valueAsNumber;
    if (valid(v)) ctx.commit(setSolver(ctx.session, { [key]: v }));
    else { ctx.notify(`「${input.labels[0].textContent}」數值無效，未套用。`, 'warn'); sync(); }
  });
  solverInput(tolLin, 'tolLinear', (v) => v > 0 && v < 1);
  solverInput(tolNl, 'tolNonlinear', (v) => v > 0 && v < 1);
  solverInput(maxIter, 'maxIter', (v) => Number.isInteger(v) && v >= 1 && v <= 1000);

  const savedList = root.querySelector('[data-saved]');
  function sync() {
    const s = ctx.session;
    if (document.activeElement !== nameInput) nameInput.value = s.current.name;
    root.querySelector('[data-baseline-name]').textContent = s.baseline.name;
    if (document.activeElement !== tolLin) tolLin.value = s.solver.tolLinear;
    if (document.activeElement !== tolNl) tolNl.value = s.solver.tolNonlinear;
    if (document.activeElement !== maxIter) maxIter.value = s.solver.maxIter;
    const key = JSON.stringify(s.saved.map((x) => [x.name, x.savedAt]));
    if (savedList.dataset.key !== key) {
      savedList.dataset.key = key;
      savedList.innerHTML = s.saved.length ? '' : '<li><span class="t-muted">尚未複製任何情境</span></li>';
      s.saved.forEach((item, i) => {
        const li = el('li', {}, `<span title="${esc(item.name)}">${esc(item.name)}</span><button type="button" class="small" data-load>載入</button><button type="button" class="small" data-del aria-label="刪除 ${esc(item.name)}">刪除</button>`);
        li.querySelector('[data-load]').addEventListener('click', () => { ctx.commit(loadSaved(ctx.session, i)); ctx.notify(`已載入「${item.name}」為目前情境。`, 'ok'); });
        li.querySelector('[data-del]').addEventListener('click', () => {
          if (window.confirm(`刪除「${item.name}」？`)) ctx.commit(deleteSaved(ctx.session, i));
        });
        savedList.append(li);
      });
    }
    if (!ctx.storageAvailable) root.querySelector('[data-storage]').textContent = '這個瀏覽器目前無法使用本機儲存（可能是隱私設定）；網站仍可使用，但重新整理後情境不會保留，請用 JSON 匯出保存。';
  }
  return { sync, resetCurrent, saveAsBaseline };
}
