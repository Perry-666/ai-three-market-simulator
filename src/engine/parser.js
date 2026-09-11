// 受限數學運算解析器：只允許數字、已宣告符號、+ - * / ^、括號與白名單函數。
// 不使用 eval 或 Function；求值由 AST 編譯成的閉包直接執行。

export class FormulaError extends Error {
  constructor(code, message, loc = {}) {
    super(message);
    this.name = 'FormulaError';
    this.code = code;
    this.formulaId = loc.formulaId ?? null;
    this.start = loc.start ?? null;
    this.end = loc.end ?? null;
  }
}

export const FUNCTIONS = Object.freeze({
  abs: { min: 1, max: 1, fn: Math.abs, label: '絕對值' },
  sqrt: { min: 1, max: 1, fn: Math.sqrt, label: '平方根' },
  exp: { min: 1, max: 1, fn: Math.exp, label: '指數 e^x' },
  ln: { min: 1, max: 1, fn: Math.log, label: '自然對數' },
  log: { min: 1, max: 1, fn: Math.log10, label: '常用對數（底數 10）' },
  min: { min: 2, max: Infinity, fn: Math.min, label: '最小值' },
  max: { min: 2, max: Infinity, fn: Math.max, label: '最大值' },
  pow: { min: 2, max: 2, fn: Math.pow, label: '次方' },
});

const CHAR_ALIASES = { '×': '*', '·': '*', '÷': '/', '−': '-', '（': '(', '）': ')', '，': ',' };
const BINDING = { '+': [10, 11], '-': [10, 11], '*': [20, 21], '/': [20, 21], '^': [31, 30] };
const UNARY_BP = 25;
const NUMBER_RE = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/;

export function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const raw = src[i];
    const ch = CHAR_ALIASES[raw] ?? raw;
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = NUMBER_RE.exec(src.slice(i));
      if (!m) throw new FormulaError('syntax', `無法辨識的數字（第 ${i + 1} 個字元）`, { start: i, end: i + 1 });
      tokens.push({ type: 'num', value: Number(m[0]), text: m[0], start: i, end: i + m[0].length });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = IDENT_RE.exec(src.slice(i));
      tokens.push({ type: 'id', value: m[0], text: m[0], start: i, end: i + m[0].length });
      i += m[0].length;
      continue;
    }
    if ('+-*/^(),'.includes(ch)) {
      tokens.push({ type: 'op', value: ch, text: raw, start: i, end: i + 1 });
      i++;
      continue;
    }
    throw new FormulaError('syntax', `不允許的字元「${raw}」（第 ${i + 1} 個字元）`, { start: i, end: i + 1 });
  }
  tokens.push({ type: 'eof', value: null, text: '', start: src.length, end: src.length });
  return tokens;
}

export function parse(src) {
  if (typeof src !== 'string' || src.trim() === '') {
    throw new FormulaError('syntax', '式子是空的', { start: 0, end: 0 });
  }
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const isOp = (t, v) => t.type === 'op' && t.value === v;
  const describe = (t) => (t.type === 'eof' ? '式子結尾' : `「${t.text}」`);
  const syntax = (msg, t) => new FormulaError('syntax', `${msg}（第 ${t.start + 1} 個字元）`, { start: t.start, end: Math.max(t.end, t.start + 1) });

  function expectClose(openTok) {
    const t = next();
    if (!isOp(t, ')')) {
      throw syntax(`預期「)」以配對第 ${openTok.start + 1} 個字元的「(」，卻遇到${describe(t)}`, t);
    }
    return t;
  }

  function parseExpr(minBp) {
    const t = next();
    let left;
    if (t.type === 'num') {
      left = { type: 'num', value: t.value, start: t.start, end: t.end };
    } else if (t.type === 'id') {
      if (isOp(peek(), '(')) {
        const open = next();
        const args = [];
        if (!isOp(peek(), ')')) {
          for (;;) {
            args.push(parseExpr(0));
            if (isOp(peek(), ',')) { next(); continue; }
            break;
          }
        }
        const close = expectClose(open);
        const f = FUNCTIONS[t.value];
        if (!f) {
          throw new FormulaError('unknown_function',
            `未知函數「${t.value}」（第 ${t.start + 1} 個字元）；只允許 ${Object.keys(FUNCTIONS).join('、')}`,
            { start: t.start, end: t.end });
        }
        if (args.length < f.min || args.length > f.max) {
          const want = f.max === Infinity ? `至少 ${f.min} 個` : f.min === f.max ? `${f.min} 個` : `${f.min}–${f.max} 個`;
          throw new FormulaError('arity', `函數「${t.value}」需要 ${want}參數，目前 ${args.length} 個`, { start: t.start, end: close.end });
        }
        left = { type: 'call', name: t.value, args, start: t.start, end: close.end };
      } else {
        left = { type: 'sym', name: t.value, start: t.start, end: t.end };
      }
    } else if (isOp(t, '(')) {
      const inner = parseExpr(0);
      const close = expectClose(t);
      left = { ...inner, start: t.start, end: close.end };
    } else if (isOp(t, '-') || isOp(t, '+')) {
      const arg = parseExpr(UNARY_BP);
      left = { type: 'unary', op: t.value, arg, start: t.start, end: arg.end };
    } else if (t.type === 'eof') {
      throw syntax('式子未完成，缺少數值或符號', t);
    } else {
      throw syntax(`非預期的${describe(t)}`, t);
    }

    for (;;) {
      const op = peek();
      if (op.type !== 'op' || !BINDING[op.value]) break;
      const [lbp, rbp] = BINDING[op.value];
      if (lbp < minBp) break;
      next();
      const right = parseExpr(rbp);
      left = { type: 'binary', op: op.value, left, right, start: left.start, end: right.end, opStart: op.start };
    }
    return left;
  }

  const ast = parseExpr(0);
  const rest = peek();
  if (rest.type !== 'eof') {
    if (isOp(rest, ')')) throw syntax('多出的「)」', rest);
    throw syntax(`${describe(rest)}前缺少運算子`, rest);
  }
  return ast;
}

export function collectSymbols(ast) {
  const out = [];
  (function walk(n) {
    switch (n.type) {
      case 'sym': out.push({ name: n.name, start: n.start, end: n.end }); break;
      case 'unary': walk(n.arg); break;
      case 'binary': walk(n.left); walk(n.right); break;
      case 'call': n.args.forEach(walk); break;
      default: break;
    }
  })(ast);
  return out;
}

export function containsCall(ast, names) {
  let found = false;
  (function walk(n) {
    if (found) return;
    if (n.type === 'call') { if (names.includes(n.name)) found = true; n.args.forEach(walk); }
    else if (n.type === 'unary') walk(n.arg);
    else if (n.type === 'binary') { walk(n.left); walk(n.right); }
  })(ast);
  return found;
}

/** 把 AST 編譯成 (env) => number 的閉包；除以零、非有限值、定義域錯誤皆附位置。 */
export function compileAst(ast, src = '', formulaId = null) {
  const loc = (n) => ({ formulaId, start: n.start, end: n.end });
  const snippet = (n) => src.slice(n.start, n.end) || '?';
  const finite = (n, v) => {
    if (!Number.isFinite(v)) {
      throw new FormulaError('non_finite',
        `非有限結果（${Number.isNaN(v) ? 'NaN' : '無限大'}）：「${snippet(n)}」（第 ${n.start + 1} 個字元）`, loc(n));
    }
    return v;
  };

  function build(n) {
    switch (n.type) {
      case 'num': { const v = n.value; return () => v; }
      case 'sym': {
        const name = n.name;
        return (env) => {
          const v = env[name];
          if (typeof v !== 'number') {
            throw new FormulaError('unknown_symbol', `符號「${name}」沒有數值（第 ${n.start + 1} 個字元）`, loc(n));
          }
          return v;
        };
      }
      case 'unary': {
        const a = build(n.arg);
        return n.op === '-' ? (env) => -a(env) : a;
      }
      case 'binary': {
        const l = build(n.left);
        const r = build(n.right);
        switch (n.op) {
          case '+': return (env) => finite(n, l(env) + r(env));
          case '-': return (env) => finite(n, l(env) - r(env));
          case '*': return (env) => finite(n, l(env) * r(env));
          case '/': return (env) => {
            const num = l(env);
            const den = r(env);
            if (den === 0) {
              throw new FormulaError('div_zero',
                `除以零：「${snippet(n.right)}」的值為 0（第 ${n.right.start + 1} 個字元）`, loc(n.right));
            }
            return finite(n, num / den);
          };
          case '^': return (env) => finite(n, Math.pow(l(env), r(env)));
          default: throw new FormulaError('syntax', `未知運算子 ${n.op}`, loc(n));
        }
      }
      case 'call': {
        const f = FUNCTIONS[n.name];
        const args = n.args.map(build);
        if (n.name === 'sqrt') {
          return (env) => {
            const x = args[0](env);
            if (x < 0) throw new FormulaError('domain', `sqrt 的參數為負（${x}）：「${snippet(n)}」`, loc(n));
            return Math.sqrt(x);
          };
        }
        if (n.name === 'ln' || n.name === 'log') {
          return (env) => {
            const x = args[0](env);
            if (x <= 0) throw new FormulaError('domain', `${n.name} 的參數必須大於 0（目前 ${x}）：「${snippet(n)}」`, loc(n));
            return f.fn(x);
          };
        }
        return (env) => finite(n, f.fn(...args.map((a) => a(env))));
      }
      default:
        throw new FormulaError('syntax', '無法編譯的節點', loc(n));
    }
  }
  return build(ast);
}

// ---------- 公式預覽（與引擎共用同一 AST） ----------

const GREEK = { epsilon: 'ε', kappa: 'κ', alpha: 'α', beta: 'β' };
const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function symbolHTML(name) {
  const parts = name.split('_');
  const base = GREEK[parts[0]] ?? parts[0];
  if (parts.length === 1) return `<i>${escapeHTML(base)}</i>`;
  const subs = parts.slice(1);
  let sup = '';
  if (parts.length >= 3 && (subs[subs.length - 1] === 'S' || subs[subs.length - 1] === 'D')) sup = subs.pop();
  return `<i>${escapeHTML(base)}</i><sub>${escapeHTML(subs.join(','))}</sub>${sup ? `<sup>${sup}</sup>` : ''}`;
}

function numberHTML(v) {
  if (v !== 0 && (Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3)) {
    const [m, e] = v.toExponential().split('e');
    return `${escapeHTML(Number(m).toString())}×10<sup>${Number(e)}</sup>`;
  }
  return escapeHTML(String(v));
}

function precedence(n) {
  if (n.type === 'binary') return { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 }[n.op];
  if (n.type === 'unary') return 3;
  return 5;
}

export function renderHTML(ast) {
  const wrap = (n, needParen) => (needParen ? `(${render(n)})` : render(n));
  function render(n) {
    switch (n.type) {
      case 'num': return numberHTML(n.value);
      case 'sym': return symbolHTML(n.name);
      case 'unary': return `${n.op === '-' ? '−' : '+'}${wrap(n.arg, precedence(n.arg) < 3)}`;
      case 'call': return `<span class="fn">${escapeHTML(n.name)}</span>(${n.args.map(render).join(', ')})`;
      case 'binary': {
        const p = precedence(n);
        if (n.op === '^') return `${wrap(n.left, precedence(n.left) <= 4)}<sup>${render(n.right)}</sup>`;
        if (n.op === '/') return `<span class="frac"><span class="num">${render(n.left)}</span><span class="den">${render(n.right)}</span></span>`;
        if (n.op === '*') return `${wrap(n.left, precedence(n.left) < p)}<span class="op">·</span>${wrap(n.right, precedence(n.right) < p)}`;
        const rightParen = n.op === '-' ? precedence(n.right) <= p : precedence(n.right) < p;
        return `${render(n.left)}<span class="op"> ${n.op === '-' ? '−' : '+'} </span>${wrap(n.right, rightParen)}`;
      }
      default: return '?';
    }
  }
  return render(ast);
}
