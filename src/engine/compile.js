// 公式編譯：解析、未知符號、循環衍生式偵測、拓撲排序，輸出求值函數。

import { parse, compileAst, collectSymbols, FormulaError } from './parser.js';
import { REQUIRED_FORMULAS, SYMBOL_IDS } from './model.js';

export function compileFormulas(formulas, { knownSymbols = SYMBOL_IDS, required = REQUIRED_FORMULAS } = {}) {
  const errors = [];
  const byId = new Map();

  for (const f of formulas) {
    if (byId.has(f.id)) {
      errors.push(new FormulaError('duplicate', `「${f.id}」重複定義`, { formulaId: f.id }));
      continue;
    }
    if (knownSymbols.has(f.id)) {
      errors.push(new FormulaError('redefine', `「${f.id}」是因素、係數或價格，不能用公式重新定義`, { formulaId: f.id }));
    }
    let ast = null;
    try {
      ast = parse(f.expr);
    } catch (e) {
      if (!(e instanceof FormulaError)) throw e;
      e.formulaId = f.id;
      errors.push(e);
    }
    byId.set(f.id, { id: f.id, expr: f.expr, ast, refs: ast ? collectSymbols(ast) : [] });
  }

  for (const id of required) {
    if (!byId.has(id)) errors.push(new FormulaError('missing', `缺少必要公式「${id}」`, { formulaId: id }));
  }

  for (const f of byId.values()) {
    for (const ref of f.refs) {
      if (!knownSymbols.has(ref.name) && !byId.has(ref.name)) {
        errors.push(new FormulaError('unknown_symbol',
          `未知符號「${ref.name}」（第 ${ref.start + 1} 個字元）；只能使用已宣告的因素、係數、價格或衍生式`,
          { formulaId: f.id, start: ref.start, end: ref.end }));
      }
    }
  }

  // 循環偵測（DFS）＋拓撲排序
  const order = [];
  const state = new Map(); // 1 = 走訪中, 2 = 完成
  const stack = [];
  const seenCycles = new Set();
  function visit(id) {
    const f = byId.get(id);
    state.set(id, 1);
    stack.push(id);
    for (const ref of f.refs) {
      const dep = byId.get(ref.name);
      if (!dep || !dep.ast) continue;
      const s = state.get(ref.name);
      if (s === 1) {
        const cycle = [...stack.slice(stack.indexOf(ref.name)), ref.name];
        const key = [...new Set(cycle)].sort().join('|');
        if (!seenCycles.has(key)) {
          seenCycles.add(key);
          errors.push(new FormulaError('cycle', `循環的衍生式：${cycle.join(' → ')}（「${id}」第 ${ref.start + 1} 個字元）`,
            { formulaId: id, start: ref.start, end: ref.end }));
        }
      } else if (!s) {
        visit(ref.name);
      }
    }
    stack.pop();
    state.set(id, 2);
    order.push(id);
  }
  for (const [id, f] of byId) if (f.ast && !state.get(id)) visit(id);

  if (errors.length) return { ok: false, errors, formulas: byId };

  const steps = order.map((id) => {
    const f = byId.get(id);
    return { id, fn: compileAst(f.ast, f.expr, id) };
  });

  return {
    ok: true,
    errors: [],
    formulas: byId,
    order,
    /** values：{符號: 數值}；prices：{P_H, P_C, P_A}。回傳含所有衍生式的環境。 */
    evaluate(values, prices) {
      const env = Object.assign(Object.create(null), values, prices);
      for (const s of steps) env[s.id] = s.fn(env);
      return env;
    },
  };
}
