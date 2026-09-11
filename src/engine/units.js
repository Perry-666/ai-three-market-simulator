// 單位代數與公式量綱檢查。單位字串沿用公式解析器（例如 "USD/(PFLOPS*h)"）。
// 檢查結果三態：ok（一致）、mismatch（不一致）、unverified（無法完整確認，須明示）。

import { parse } from './parser.js';

export const BASE_UNITS = {
  USD: '美元', PFLOPS: 'PFLOPS', h: '小時', yr: '年', month: '月', set: '套', kWh: 'kWh', MW: 'MW',
  pct: '%', Mtok: '百萬 token', Mdtok: '百萬資料 token', task: '任務', project: '專案', personyr: '人年', run: '次訓練',
};

const EPS = 1e-12;
const cache = new Map();

export function mulDims(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const s = (out[k] ?? 0) + v;
    if (Math.abs(s) < EPS) delete out[k]; else out[k] = s;
  }
  return out;
}

export function powDims(a, p) {
  const out = {};
  for (const [k, v] of Object.entries(a)) {
    const s = v * p;
    if (Math.abs(s) >= EPS) out[k] = s;
  }
  return out;
}

export const isDimensionless = (d) => Object.keys(d).length === 0;

export function sameDims(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (Math.abs((a[k] ?? 0) - (b[k] ?? 0)) >= EPS) return false;
  return true;
}

function literalValue(n) {
  if (n.type === 'num') return n.value;
  if (n.type === 'unary' && n.arg.type === 'num') return n.op === '-' ? -n.arg.value : n.arg.value;
  return null;
}

export function parseUnit(str) {
  if (cache.has(str)) return cache.get(str);
  const walk = (n) => {
    switch (n.type) {
      case 'num':
        if (n.value === 1) return {};
        throw new Error(`單位「${str}」含有非 1 的數字`);
      case 'sym':
        if (n.name === 'ratio') return {};
        if (!(n.name in BASE_UNITS)) throw new Error(`未知單位「${n.name}」`);
        return { [n.name]: 1 };
      case 'binary': {
        if (n.op === '*') return mulDims(walk(n.left), walk(n.right));
        if (n.op === '/') return mulDims(walk(n.left), powDims(walk(n.right), -1));
        if (n.op === '^') {
          const p = literalValue(n.right);
          if (p === null) throw new Error(`單位「${str}」的指數必須是數字`);
          return powDims(walk(n.left), p);
        }
        throw new Error(`單位「${str}」不能使用 ${n.op}`);
      }
      default:
        throw new Error(`無法解析單位「${str}」`);
    }
  };
  const dims = walk(parse(str));
  cache.set(str, dims);
  return dims;
}

export function formatDims(d) {
  if (isDimensionless(d)) return '無因次';
  const rest = { ...d };
  const num = [];
  const den = [];
  const push = (label, v) => {
    const p = Math.abs(v);
    const text = p === 1 ? label : `${label}^${Number(p.toFixed(6))}`;
    (v > 0 ? num : den).push(text);
  };
  if (rest.PFLOPS && rest.h && rest.PFLOPS === rest.h) {
    push('PFLOP-hour', rest.PFLOPS);
    delete rest.PFLOPS;
    delete rest.h;
  }
  for (const [k, v] of Object.entries(rest)) push(BASE_UNITS[k] ?? k, v);
  return `${num.join('·') || '1'}${den.length ? `／${den.join('·')}` : ''}`;
}

export const formatUnit = (str) => formatDims(parseUnit(str));

class UnitMismatch extends Error {
  constructor(message, node) {
    super(message);
    this.start = node.start;
    this.end = node.end;
  }
}

/**
 * 檢查公式 AST 的量綱。
 * @param {object} ast 公式語法樹
 * @param {string} declaredUnit 公式宣告的結果單位
 * @param {(name:string)=>string|null} unitOf 符號 → 單位字串
 * @param {string} src 原始公式文字（用於訊息）
 */
export function checkFormulaUnits(ast, declaredUnit, unitOf, src = '') {
  const unverified = [];
  const snippet = (n) => src.slice(n.start, n.end) || '常數';

  function additive(parts, nodes, opNode) {
    const ref = parts.find((p) => !p.konst && !p.unknown);
    if (!ref) {
      return { dims: {}, konst: parts.every((p) => p.konst), unknown: parts.some((p) => p.unknown) };
    }
    parts.forEach((p, i) => {
      if (p.unknown) return;
      if (p.konst) {
        if (!isDimensionless(ref.dims)) {
          unverified.push({ msg: `常數「${snippet(nodes[i])}」沒有單位，無法確認與 ${formatDims(ref.dims)} 一致`, node: nodes[i] });
        }
        return;
      }
      if (!sameDims(p.dims, ref.dims)) {
        throw new UnitMismatch(
          `「${snippet(nodes[i])}」的單位是 ${formatDims(p.dims)}，與同一${opNode.type === 'call' ? '函數' : '加減式'}中的 ${formatDims(ref.dims)} 不同（第 ${nodes[i].start + 1} 個字元）`,
          nodes[i]);
      }
    });
    return { dims: ref.dims, konst: false, unknown: parts.some((p) => p.unknown) };
  }

  function power(base, exp, expNode, node) {
    if (exp.unknown || base.unknown) return { dims: {}, konst: false, unknown: true };
    const lit = literalValue(expNode);
    if (lit !== null) return { dims: powDims(base.dims, lit), konst: base.konst, unknown: false };
    if (!isDimensionless(exp.dims)) {
      throw new UnitMismatch(`指數「${snippet(expNode)}」必須無單位，目前是 ${formatDims(exp.dims)}`, expNode);
    }
    if (isDimensionless(base.dims)) return { dims: {}, konst: base.konst && exp.konst, unknown: false };
    unverified.push({ msg: `「${snippet(node)}」的指數不是數字常數，無法計算單位`, node });
    return { dims: {}, konst: false, unknown: true };
  }

  function infer(n) {
    switch (n.type) {
      case 'num': return { dims: {}, konst: true, unknown: false };
      case 'sym': {
        const u = unitOf(n.name);
        if (u == null) {
          unverified.push({ msg: `「${n.name}」沒有宣告單位`, node: n });
          return { dims: {}, konst: false, unknown: true };
        }
        return { dims: parseUnit(u), konst: false, unknown: false };
      }
      case 'unary': return infer(n.arg);
      case 'binary': {
        const L = infer(n.left);
        const R = infer(n.right);
        if (n.op === '+' || n.op === '-') return additive([L, R], [n.left, n.right], n);
        if (n.op === '*' || n.op === '/') {
          return {
            dims: mulDims(L.dims, n.op === '*' ? R.dims : powDims(R.dims, -1)),
            konst: L.konst && R.konst,
            unknown: L.unknown || R.unknown,
          };
        }
        return power(L, R, n.right, n);
      }
      case 'call': {
        const args = n.args.map(infer);
        switch (n.name) {
          case 'sqrt': return { ...args[0], dims: powDims(args[0].dims, 0.5) };
          case 'abs': return args[0];
          case 'exp': case 'ln': case 'log': {
            const a = args[0];
            if (!a.unknown && !a.konst && !isDimensionless(a.dims)) {
              throw new UnitMismatch(`${n.name} 的參數必須無單位，目前是 ${formatDims(a.dims)}`, n.args[0]);
            }
            return { dims: {}, konst: a.konst, unknown: a.unknown };
          }
          case 'min': case 'max': return additive(args, n.args, n);
          case 'pow': return power(args[0], args[1], n.args[1], n);
          default:
            unverified.push({ msg: `函數「${n.name}」沒有單位規則`, node: n });
            return { dims: {}, konst: false, unknown: true };
        }
      }
      default:
        unverified.push({ msg: '無法辨識的節點', node: n });
        return { dims: {}, konst: false, unknown: true };
    }
  }

  const want = parseUnit(declaredUnit);
  try {
    const res = infer(ast);
    if (!res.unknown && !res.konst && !sameDims(res.dims, want)) {
      return {
        status: 'mismatch',
        message: `式子結果單位是 ${formatDims(res.dims)}，但宣告為 ${formatDims(want)}`,
        start: ast.start, end: ast.end,
      };
    }
    if (res.konst && !isDimensionless(want)) unverified.push({ msg: '整條式子只有常數，沒有單位', node: ast });
    if (unverified.length) {
      return {
        status: 'unverified',
        message: `尚未驗證：${unverified.map((u) => u.msg).join('；')}`,
        start: unverified[0].node.start, end: unverified[0].node.end,
      };
    }
    return { status: 'ok', message: `單位一致：${formatDims(want)}`, start: null, end: null };
  } catch (e) {
    if (e instanceof UnitMismatch) return { status: 'mismatch', message: `單位不一致：${e.message}`, start: e.start, end: e.end };
    throw e;
  }
}
