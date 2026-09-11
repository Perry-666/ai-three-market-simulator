// 數字與文字格式化。大數以萬／億／兆表示；精確值放在 title。

export { symbolHTML } from '../engine/parser.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const trimZeros = (s) => (s.includes('e') || !s.includes('.') ? s : s.replace(/\.?0+$/, ''));
// toPrecision 在整數位數超過有效位數時會輸出指數形式；先轉回 Number 取一般寫法。
const sig = (v, digits) => String(Number(v.toPrecision(digits)));

export function fmtNum(v, digits = 4) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e16 || a < 1e-4) return v.toExponential(digits - 1).replace(/\.?0+e/, 'e');
  for (const [scale, unit] of [[1e12, '兆'], [1e8, '億'], [1e4, '萬']]) {
    if (a >= scale) return `${sig(v / scale, digits)}${unit}`;
  }
  return sig(v, digits);
}

export function fmtFull(v) {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e9 || a < 1e-4)) return v.toExponential(8).replace(/\.?0+e/, 'e');
  return trimZeros(v.toPrecision(10));
}

export function fmtDelta(v) {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  return `${v > 0 ? '+' : '−'}${fmtNum(Math.abs(v))}`;
}

export function fmtPct(p) {
  if (p === null || p === undefined) return '不適用';
  if (p === 0) return '0.00%';
  return `${p > 0 ? '+' : '−'}${Math.abs(p).toFixed(2)}%`;
}

export function fmtResidual(v) {
  if (!Number.isFinite(v)) return '—';
  return v === 0 ? '0' : v.toExponential(1);
}

/** 數字輸入框顯示值：保留 12 位有效數字，避免浮點尾數干擾閱讀。 */
export function inputValue(v) {
  return Number.isFinite(v) ? String(Number(v.toPrecision(12))) : '';
}

export function niceTicks(min, max, count = 5) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return ticks;
}

export function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    node.setAttribute(k, v === true ? '' : v);
  }
  if (html) node.innerHTML = html;
  return node;
}
