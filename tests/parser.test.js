import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, compileAst, renderHTML, FormulaError, containsCall } from '../src/engine/parser.js';

const evalExpr = (src, env = {}) => compileAst(parse(src), src)(Object.assign(Object.create(null), env));

test('運算子優先序與結合性', () => {
  assert.equal(evalExpr('1+2*3^2'), 19);
  assert.equal(evalExpr('-2^2'), -4);
  assert.equal(evalExpr('2^3^2'), 512);
  assert.equal(evalExpr('(1+2)*3'), 9);
  assert.equal(evalExpr('2^-1'), 0.5);
  assert.equal(evalExpr('10 - 4 - 3'), 3);
  assert.equal(evalExpr('12 / 3 / 2'), 2);
  assert.equal(evalExpr('1.5e3 + .5'), 1500.5);
});

test('符號與白名單函數', () => {
  assert.equal(evalExpr('a*b + max(a, b, 7)', { a: 2, b: 3 }), 13);
  assert.equal(evalExpr('ln(exp(2)) + log(100) + sqrt(9) + abs(-1) + pow(2, 3) + min(4, 5)'), 2 + 2 + 3 + 1 + 8 + 4);
});

test('全形／數學符號別名', () => {
  assert.equal(evalExpr('2×3−1'), 5);
  assert.equal(evalExpr('（6÷3）'), 2);
});

function throwsCode(fn, code, start) {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof FormulaError, `應為 FormulaError，實際 ${e}`);
    assert.equal(e.code, code, e.message);
    if (start !== undefined) assert.equal(e.start, start, e.message);
    return e;
  }
  assert.fail(`預期拋出 ${code}`);
}

test('語法錯誤附位置', () => {
  throwsCode(() => parse('a + * b'), 'syntax', 4);
  throwsCode(() => parse('(a + b'), 'syntax', 6);
  throwsCode(() => parse('a + b)'), 'syntax', 5);
  throwsCode(() => parse('a b'), 'syntax', 2);
  throwsCode(() => parse(''), 'syntax');
});

test('不允許任意程式碼', () => {
  throwsCode(() => parse('a; alert(1)'), 'syntax', 1);
  throwsCode(() => parse('P_H.toString()'), 'syntax', 3);
  throwsCode(() => parse('"x"'), 'syntax', 0);
  throwsCode(() => parse('alert(1)'), 'unknown_function', 0);
  throwsCode(() => evalExpr('constructor'), 'unknown_symbol', 0);
});

test('函數參數個數', () => {
  throwsCode(() => parse('sqrt(1, 2)'), 'arity', 0);
  throwsCode(() => parse('max(1)'), 'arity', 0);
});

test('除以零與非有限值指出位置', () => {
  const e = throwsCode(() => evalExpr('a/(b-b)', { a: 1, b: 2 }), 'div_zero', 2);
  assert.match(e.message, /除以零/);
  throwsCode(() => evalExpr('exp(1000)'), 'non_finite', 0);
  throwsCode(() => evalExpr('sqrt(0-1)'), 'domain', 0);
  throwsCode(() => evalExpr('ln(0)'), 'domain', 0);
});

test('公式預覽使用同一語法樹', () => {
  const html = renderHTML(parse('A_H_S + b_H*P_H - k_Hc*c/h'));
  assert.match(html, /<i>A<\/i><sub>H<\/sub><sup>S<\/sup>/);
  assert.match(html, /class="frac"/);
  assert.match(renderHTML(parse('e * epsilon * u')), /ε/);
  assert.match(renderHTML(parse('a - (b - c)')), /\(/);
});

test('containsCall 偵測 min/max', () => {
  assert.equal(containsCall(parse('a + max(b, c)'), ['min', 'max']), true);
  assert.equal(containsCall(parse('a + b'), ['min', 'max']), false);
});
