// 模型定義：依 Notion 03（變數表）、04（公式與符號）、05 §4（預設式）。
// 除 source 為 'observed' 的項目外，所有數值皆為示範假設，不是市場估計或實測資料。
// 百分數一律以百分數值運算（3.64% 記為 3.64），運算中不隱含 ÷100。

export const MARKET_IDS = ['H', 'C', 'A'];
export const PRICE_IDS = ['P_H', 'P_C', 'P_A'];

export const MARKETS = {
  H: {
    id: 'H', label: '硬體市場', short: '硬體', price: 'P_H', supply: 'Q_H_S', demand: 'Q_H_D', quantity: 'Q_H',
    priceUnit: 'USD/PFLOPS', priceLabel: '美元／PFLOPS', qtyUnit: 'PFLOPS/yr', qtyLabel: 'PFLOPS／年',
    qtyName: '新增硬體有效容量',
  },
  C: {
    id: 'C', label: '算力市場', short: '算力', price: 'P_C', supply: 'Q_C_S', demand: 'Q_C_D', quantity: 'Q_C',
    priceUnit: 'USD/(PFLOPS*h)', priceLabel: '美元／PFLOP-hour', qtyUnit: 'PFLOPS*h/yr', qtyLabel: 'PFLOP-hour／年',
    qtyName: '算力使用量',
  },
  A: {
    id: 'A', label: 'AI 服務市場', short: 'AI 服務', price: 'P_A', supply: 'Q_A_S', demand: 'Q_A_D', quantity: 'Q_A',
    priceUnit: 'USD/Mtok', priceLabel: '美元／百萬 token', qtyUnit: 'Mtok/yr', qtyLabel: '百萬 token／年',
    qtyName: 'AI 使用量',
  },
};

export const PRICES = PRICE_IDS.map((id, i) => {
  const m = MARKETS[MARKET_IDS[i]];
  return { id, kind: 'price', label: `${m.short}價格`, unit: m.priceUnit, unitLabel: m.priceLabel, market: m.id };
});

export const SOURCE_LABELS = {
  observed: '來源觀測值',
  assumption: '示範假設',
  calibrated: '示範校準（反推）',
  user: '使用者輸入',
};

export const REFERENCES = {
  r: '[1] FRED：SOFR，2026/09/09：3.64%／年；此處作為利率的參考樣本，非全球統一值。',
  e: '[2] EIA：電價，美國工業平均，2026/06：0.0917 美元／kWh；非全球統一值。',
};

// ---------- 公式 ----------

export const FORMULA_META = {
  c_elec: { label: '每單位運算電力成本', unit: 'USD/(PFLOPS*h)', unitLabel: '美元／PFLOP-hour', role: 'aux', market: 'C' },
  Q_H_S: { label: '硬體供給量', unit: 'PFLOPS/yr', unitLabel: 'PFLOPS／年', role: 'supply', market: 'H' },
  Q_H_D: { label: '硬體需求量', unit: 'PFLOPS/yr', unitLabel: 'PFLOPS／年', role: 'demand', market: 'H' },
  Q_C_S: { label: '算力供給量', unit: 'PFLOPS*h/yr', unitLabel: 'PFLOP-hour／年', role: 'supply', market: 'C' },
  Q_C_D: { label: '算力需求量', unit: 'PFLOPS*h/yr', unitLabel: 'PFLOP-hour／年', role: 'demand', market: 'C' },
  Q_A_S: { label: 'AI 服務供給量', unit: 'Mtok/yr', unitLabel: '百萬 token／年', role: 'supply', market: 'A' },
  Q_E_D: { label: '企業 AI 需求量', unit: 'Mtok/yr', unitLabel: '百萬 token／年', role: 'segment', market: 'A' },
  Q_G_D: { label: '政府 AI 需求量', unit: 'Mtok/yr', unitLabel: '百萬 token／年', role: 'segment', market: 'A' },
  Q_U_D: { label: '消費者 AI 需求量', unit: 'Mtok/yr', unitLabel: '百萬 token／年', role: 'segment', market: 'A' },
  Q_A_D: { label: 'AI 服務總需求量', unit: 'Mtok/yr', unitLabel: '百萬 token／年', role: 'demand', market: 'A' },
};

export const DEFAULT_FORMULAS = [
  { id: 'c_elec', expr: 'e * epsilon * u' },
  { id: 'Q_H_S', expr: 'A_H_S + b_H*P_H - k_Hc*c/h + k_Hy*y - k_Hr_S*r + k_HN*N' },
  { id: 'Q_H_D', expr: 'A_H_D - d_H*P_H + k_HC*P_C - k_Hr_D*r - k_He*e - k_HL*L + k_HM*M' },
  { id: 'Q_C_S', expr: 'A_C_S + b_C*P_C - k_CH*P_H - k_Cr_S*r - k_Ce*c_elec - k_CB*B + k_CM*M + k_CK*K_C' },
  { id: 'Q_C_D', expr: 'A_C_D - d_C*P_C + k_CA*P_A - k_Cr_D*r + k_Ca*a + k_CF*F' },
  { id: 'Q_A_S', expr: 'A_A_S + b_A*P_A - k_AC*a*P_C - k_AD*p_D - k_Aw*w - k_Ar_S*r' },
  { id: 'Q_E_D', expr: 'A_E - d_E*P_A + k_Ev*v_E - k_EI*I_E + k_Es*s_E - k_Er*r + k_EW*W_E' },
  { id: 'Q_G_D', expr: 'A_G - d_G*P_A + k_Gv*v_G - k_GI*I_G + k_Gs*s_G - k_Gr*r + k_GW*W_G' },
  { id: 'Q_U_D', expr: 'A_U - d_U*P_A' },
  { id: 'Q_A_D', expr: 'Q_E_D + Q_U_D + Q_G_D' },
];

export const DEFAULT_EXPR = Object.fromEntries(DEFAULT_FORMULAS.map((f) => [f.id, f.expr]));
export const REQUIRED_FORMULAS = ['Q_H_S', 'Q_H_D', 'Q_C_S', 'Q_C_D', 'Q_A_S', 'Q_A_D'];
export const SEGMENT_FORMULAS = ['Q_E_D', 'Q_U_D', 'Q_G_D'];

// 方程式鍵 → 公式 id（教學提示與移線方向用）
export const EQUATIONS = {
  H_S: 'Q_H_S', H_D: 'Q_H_D', C_S: 'Q_C_S', C_D: 'Q_C_D', A_S: 'Q_A_S', A_D: 'Q_A_D',
};
export const EQUATION_LABELS = {
  H_S: '硬體供給', H_D: '硬體需求', C_S: '算力供給', C_D: '算力需求', A_S: 'AI 服務供給', A_D: 'AI 服務需求',
};

// ---------- 外生因素（第 03 頁） ----------

const nonNeg = { min: 0 };

function factor(id, label, group, unit, unitLabel, demo, opts = {}) {
  return {
    id, kind: 'factor', label, group, unit, unitLabel, demo,
    source: opts.source ?? 'assumption',
    pending: opts.pending ?? true,
    ref: opts.ref ?? null,
    origin: opts.origin ?? null,
    domain: opts.domain ?? nonNeg,
    slider: opts.slider ?? [0, demo * 3],
    expect: opts.expect ?? {},
    absorbedBy: opts.absorbedBy ?? null,
    shared: opts.shared ?? null,
    note: opts.note ?? null,
  };
}

export const FACTOR_GROUPS = [
  { id: 'shared', label: '跨市場共用因素', hint: '同一份狀態，同時進入多個市場的方程式' },
  { id: 'H', label: '硬體市場因素' },
  { id: 'C', label: '算力市場因素' },
  { id: 'A', label: 'AI 服務市場因素' },
];

export const FACTORS = [
  // 跨市場共用
  factor('r', '利率', 'shared', 'pct/yr', '%／年', 3.64, {
    source: 'observed', pending: false, ref: REFERENCES.r, origin: '融資與資金成本',
    domain: {}, slider: [-2, 15], shared: ['H', 'C', 'A'],
    expect: {
      H_S: ['left', '長期左移'], H_D: ['left', '通常左移'],
      C_S: ['left', '長期左移'], C_D: ['left', '研發／訓練投資需求通常左移'],
      A_S: ['left', '長期左移'], A_D: ['left', '需前期投資的導入需求通常左移'],
    },
    note: '利率同時放入三個市場是簡化假設（投資與融資成本管道），不假設所有即時使用需求都必然下降。',
  }),
  factor('e', '電價', 'shared', 'USD/kWh', '美元／kWh', 0.0917, {
    source: 'observed', pending: false, ref: REFERENCES.e, origin: '電力與營運成本',
    slider: [0, 0.3], shared: ['H', 'C'],
    expect: { H_D: ['left', '通常左移'], C_S: ['left', '左移（經 c_elec＝e×ε×u）'] },
  }),
  factor('M', '可部署 IT 容量', 'shared', 'MW', 'MW', 50000, {
    origin: '電網、機房、土地與冷卻容量', shared: ['H', 'C'],
    expect: { H_D: ['right', '需求線右移'], C_S: ['right', '供給線右移'] },
    note: '作為移線因素，幅度由 k_HM、k_CM 決定；不設容量上限。',
  }),
  factor('a', '推論算力需求強度', 'shared', 'PFLOPS*h/Mtok', 'PFLOP-hour／百萬 token', 0.1, {
    origin: '演算法效率（同品質）', slider: [0, 0.3], shared: ['C', 'A'],
    expect: { C_D: ['right', '固定 token 工作量下需求量增加；完整曲線方向待定'], A_S: ['left', '左移'] },
    note: 'a 增加代表效率降低；a 減少代表效率改善。',
  }),
  // 硬體
  factor('c', '系統製造成本', 'H', 'USD/set', '美元／套', 250000, {
    origin: '硬體生產成本（同配置）', expect: { H_S: ['left', '固定效能下左移'] },
  }),
  factor('y', '良率', 'H', 'pct', '%', 90, {
    origin: '製造與系統生產率（合格品／投入數量）', domain: { min: 0, max: 100 }, slider: [0, 100],
    expect: { H_S: ['right', '右移'] },
    absorbedBy: { coef: 'k_Hy', note: '已由成本 c 反映：c 已含不良品損失，預設 k_Hy＝0' },
  }),
  factor('N', '系統交付產能', 'H', 'set/yr', '套／年', 5.0e6, {
    origin: '供應鏈與製造產能（固定配置）', expect: { H_S: ['right', '供給線右移'] },
    note: '作為移線因素，幅度由 k_HN 決定；不設產能上限。',
  }),
  factor('h', '系統有效運算能力', 'H', 'PFLOPS/set', 'PFLOPS／套', 40, {
    origin: '硬體能力／Compute 轉換效率（實測）', domain: { min: 0, exclusiveMin: true }, slider: [1, 120],
    expect: { H_S: ['right', '每套成本與產能固定時右移'] },
    note: '需求線：每單位算力收益及營運成本固定時不另位移。h 必須大於 0。',
  }),
  factor('L', '建置時間', 'H', 'month', '月', 18, {
    origin: '電網、機房、土地與冷卻容量', slider: [0, 48],
    expect: { H_D: ['left', '給定期間內通常左移'] },
  }),
  // 算力
  factor('epsilon', 'IT 單位運算耗電量', 'C', 'kWh/(PFLOPS*h)', 'kWh／PFLOP-hour', 0.25, {
    origin: '硬體效能與能源效率', slider: [0, 0.75], expect: { C_S: ['left', '左移'] },
  }),
  factor('u', 'PUE', 'C', 'ratio', '倍（機房總用電／IT 用電）', 1.3, {
    origin: '電力、冷卻與網路成本', domain: { min: 1 }, slider: [1, 3], expect: { C_S: ['left', '左移'] },
  }),
  factor('B', '機房建置成本', 'C', 'USD/MW', '美元／MW（IT 容量）', 1.0e7, {
    origin: '算力資本與營運成本', expect: { C_S: ['left', '長期左移'] },
  }),
  factor('F', '達到指定品質的訓練算力', 'C', 'PFLOPS*h/run', 'PFLOP-hour／次訓練', 1.0e6, {
    origin: '演算法效率、訓練規模與模型 Compute 強度', expect: { C_D: ['right', '固定訓練次數下需求量增加'] },
  }),
  factor('K_C', '可用硬體存量', 'C', 'PFLOPS', 'PFLOPS（期初已部署有效容量）', 8.0e8, {
    origin: '跨市場傳導：期初存量', expect: { C_S: ['right', '其他容量足夠時，算力供給線右移'] },
    note: '比較靜態：Q_H 不自動加入 K_C。',
  }),
  // AI 服務
  factor('p_D', '資料價格', 'A', 'USD/Mdtok', '美元／百萬資料 token', 5, {
    origin: '資料、人才、評測與部署成本', expect: { A_S: ['left', '通常左移；固定投入以長期為主'] },
  }),
  factor('w', '人才薪資', 'A', 'USD/personyr', '美元／人年', 300000, {
    origin: '資料、人才、評測與部署成本（固定職類）', expect: { A_S: ['left', '通常長期左移'] },
  }),
  factor('v_E', '企業使用價值', 'A', 'USD/task', '美元／任務', 2, {
    origin: 'Enterprise 的 AI 使用價值', expect: { A_D: ['right', '通常右移'] },
  }),
  factor('v_G', '公共服務使用價值', 'A', 'USD/task', '美元／任務', 1, {
    origin: 'Government 的公共與戰略價值', expect: { A_D: ['right', '政府需求通常右移'] },
  }),
  factor('I_E', '企業導入成本', 'A', 'USD/project', '美元／專案', 5.0e5, {
    origin: 'AI 導入與使用成本（不含 P_A）', expect: { A_D: ['left', '通常左移'] },
  }),
  factor('I_G', '政府導入成本', 'A', 'USD/project', '美元／專案', 1.0e6, {
    origin: 'AI 導入與使用成本（不含 P_A）', expect: { A_D: ['left', '通常左移'] },
  }),
  factor('s_E', '企業任務成功率', 'A', 'pct', '%', 80, {
    origin: '任務適配、可用品質與流程效率', domain: { min: 0, max: 100 }, slider: [0, 100],
    expect: { A_D: ['right', '固定每任務 token 用量時通常右移'] },
    absorbedBy: { coef: 'k_Es', note: '已由使用價值 v_E 反映：v_E 為當前成功率下的可實現價值，預設 k_Es＝0' },
  }),
  factor('s_G', '政府任務成功率', 'A', 'pct', '%', 75, {
    origin: '任務適配、可用品質與流程效率', domain: { min: 0, max: 100 }, slider: [0, 100],
    expect: { A_D: ['right', '固定每任務 token 用量時通常右移'] },
    absorbedBy: { coef: 'k_Gs', note: '已由使用價值 v_G 反映：v_G 為當前成功率下的可實現價值，預設 k_Gs＝0' },
  }),
  factor('W_E', '企業可用預算', 'A', 'USD/yr', '美元／年', 1.5e11, {
    origin: '預算、採購與存取限制（API 可用預算）', expect: { A_D: ['right', '需求線右移（簡化設定）'] },
    note: '作為移線因素，幅度由 k_EW 決定；不使用 W／P_A 作支出上限。',
  }),
  factor('W_G', '政府可用預算', 'A', 'USD/yr', '美元／年', 2.0e10, {
    origin: '預算、採購與存取限制（API 可用預算）', expect: { A_D: ['right', '需求線右移（簡化設定）'] },
    note: '作為移線因素，幅度由 k_GW 決定；不使用 W／P_A 作支出上限。',
  }),
];

// ---------- 係數（第 04 頁）----------
// 係數單位＝式中數量單位 ÷ 所乘項單位（明確宣告，不由公式反推）。
// 示範值以基準點彈性設定：k ≈ 彈性 × Q*／X*，取 4 位有效數字；k_Ca、k_CF 依第 04 頁說明取工作量假設。

function coef(id, eq, kind, term, termUnit, termLabel, demo, purpose) {
  const meta = FORMULA_META[eq];
  const unit = kind === 'intercept' ? meta.unit : `(${meta.unit})/(${termUnit})`;
  const unitLabel = kind === 'intercept' ? meta.unitLabel : `(${meta.unitLabel}) ÷ (${termLabel})`;
  return { id, kind: 'coefficient', coefKind: kind, eq, term, unit, unitLabel, demo, purpose, source: kind === 'intercept' ? 'calibrated' : 'assumption' };
}

export const COEFFICIENT_GROUPS = [
  { eq: 'Q_H_S', label: '硬體供給 Q_H^S' },
  { eq: 'Q_H_D', label: '硬體需求 Q_H^D' },
  { eq: 'Q_C_S', label: '算力供給 Q_C^S' },
  { eq: 'Q_C_D', label: '算力需求 Q_C^D' },
  { eq: 'Q_A_S', label: 'AI 服務供給 Q_A^S' },
  { eq: 'Q_E_D', label: '企業需求 Q_E^D' },
  { eq: 'Q_U_D', label: '消費者需求 Q_U^D' },
  { eq: 'Q_G_D', label: '政府需求 Q_G^D' },
];

export const COEFFICIENTS = [
  coef('A_H_S', 'Q_H_S', 'intercept', '—', 'ratio', '', null, '硬體供給式常數項（示範校準反推，非實測供給量）'),
  coef('b_H', 'Q_H_S', 'slope', 'P_H', 'USD/PFLOPS', '美元／PFLOPS', 2.222e4, '硬體價格每升 1 美元／PFLOPS，年供給量增加多少'),
  coef('k_Hc', 'Q_H_S', 'k', 'c/h', 'USD/PFLOPS', '美元／PFLOPS', 1.92e4, '每單位容量製造成本 c/h 上升時供給減少的幅度'),
  coef('k_Hy', 'Q_H_S', 'k', 'y', 'pct', '%', 0, '良率對供給的直接效果；c 已含良率損失時為 0'),
  coef('k_Hr_S', 'Q_H_S', 'k', 'r', 'pct/yr', '%／年', 2.747e6, '利率每升 1 個百分點，硬體長期供給減少多少'),
  coef('k_HN', 'Q_H_S', 'k', 'N', 'set/yr', '套／年', 20, '系統交付產能對供給的移線幅度'),

  coef('A_H_D', 'Q_H_D', 'intercept', '—', 'ratio', '', null, '硬體需求式常數項（示範校準反推）'),
  coef('d_H', 'Q_H_D', 'slope', 'P_H', 'USD/PFLOPS', '美元／PFLOPS', 1.778e4, '硬體價格每升 1 美元／PFLOPS，年需求量減少多少'),
  coef('k_HC', 'Q_H_D', 'k', 'P_C', 'USD/(PFLOPS*h)', '美元／PFLOP-hour', 2.5e8, '算力價格上升使硬體需求右移的幅度'),
  coef('k_Hr_D', 'Q_H_D', 'k', 'r', 'pct/yr', '%／年', 5.495e6, '利率每升 1 個百分點，硬體需求減少多少'),
  coef('k_He', 'Q_H_D', 'k', 'e', 'USD/kWh', '美元／kWh', 2.181e8, '電價上升使硬體需求左移的幅度'),
  coef('k_HL', 'Q_H_D', 'k', 'L', 'month', '月', 2.222e6, '建置時間每多 1 個月，年度硬體需求減少多少'),
  coef('k_HM', 'Q_H_D', 'k', 'M', 'MW', 'MW', 1600, '可部署 IT 容量對硬體需求的移線幅度'),

  coef('A_C_S', 'Q_C_S', 'intercept', '—', 'ratio', '', null, '算力供給式常數項（示範校準反推）'),
  coef('b_C', 'Q_C_S', 'slope', 'P_C', 'USD/(PFLOPS*h)', '美元／PFLOP-hour', 8.0e12, '算力價格每升 1 美元／PFLOP-hour，年供給量增加多少'),
  coef('k_CH', 'Q_C_S', 'k', 'P_H', 'USD/PFLOPS', '美元／PFLOPS', 1.333e8, '硬體價格上升使中長期算力供給左移的幅度'),
  coef('k_Cr_S', 'Q_C_S', 'k', 'r', 'pct/yr', '%／年', 5.495e10, '利率每升 1 個百分點，算力長期供給減少多少'),
  coef('k_Ce', 'Q_C_S', 'k', 'c_elec', 'USD/(PFLOPS*h)', '美元／PFLOP-hour', 1.342e13, '每單位運算電力成本上升使供給左移的幅度'),
  coef('k_CB', 'Q_C_S', 'k', 'B', 'USD/MW', '美元／MW', 4.0e4, '機房建置成本上升使長期供給左移的幅度'),
  coef('k_CM', 'Q_C_S', 'k', 'M', 'MW', 'MW', 2.4e7, '可部署 IT 容量對算力供給的移線幅度'),
  coef('k_CK', 'Q_C_S', 'k', 'K_C', 'PFLOPS', 'PFLOPS', 3000, '可用硬體存量對算力供給的移線幅度（約為年有效使用小時）'),

  coef('A_C_D', 'Q_C_D', 'intercept', '—', 'ratio', '', null, '算力需求式常數項（示範校準反推）'),
  coef('d_C', 'Q_C_D', 'slope', 'P_C', 'USD/(PFLOPS*h)', '美元／PFLOP-hour', 6.0e12, '算力價格每升 1 美元／PFLOP-hour，年需求量減少多少'),
  coef('k_CA', 'Q_C_D', 'k', 'P_A', 'USD/Mtok', '美元／百萬 token', 6.0e11, 'AI 服務價格上升使算力需求右移的幅度'),
  coef('k_Cr_D', 'Q_C_D', 'k', 'r', 'pct/yr', '%／年', 1.099e11, '利率每升 1 個百分點，研發／訓練算力需求減少多少'),
  coef('k_Ca', 'Q_C_D', 'k', 'a', 'PFLOPS*h/Mtok', 'PFLOP-hour／百萬 token', 1.0e11, '固定的年度百萬 token 工作量（第 04 頁：情境設定，不代入當期 Q_A）'),
  coef('k_CF', 'Q_C_D', 'k', 'F', 'PFLOPS*h/run', 'PFLOP-hour／次訓練', 1000, '固定的年度訓練次數（第 04 頁：情境設定）'),

  coef('A_A_S', 'Q_A_S', 'intercept', '—', 'ratio', '', null, 'AI 服務供給式常數項（示範校準反推）'),
  coef('b_A', 'Q_A_S', 'slope', 'P_A', 'USD/Mtok', '美元／百萬 token', 5.0e10, 'AI 服務價格每升 1 美元／百萬 token，年供給量增加多少'),
  coef('k_AC', 'Q_A_S', 'k', 'a·P_C', 'USD/Mtok', '美元／百萬 token', 1.25e11, '每百萬 token 推論算力成本 a·P_C 上升使供給左移的幅度'),
  coef('k_AD', 'Q_A_S', 'k', 'p_D', 'USD/Mdtok', '美元／百萬資料 token', 2.0e9, '資料價格上升使供給左移的幅度'),
  coef('k_Aw', 'Q_A_S', 'k', 'w', 'USD/personyr', '美元／人年', 3.333e4, '人才薪資上升使長期供給左移的幅度'),
  coef('k_Ar_S', 'Q_A_S', 'k', 'r', 'pct/yr', '%／年', 1.374e9, '利率每升 1 個百分點，AI 服務長期供給減少多少'),

  coef('A_E', 'Q_E_D', 'intercept', '—', 'ratio', '', null, '企業需求式常數項（示範校準反推）'),
  coef('d_E', 'Q_E_D', 'slope', 'P_A', 'USD/Mtok', '美元／百萬 token', 2.2e10, 'AI 服務價格每升 1 單位，企業需求減少多少'),
  coef('k_Ev', 'Q_E_D', 'k', 'v_E', 'USD/task', '美元／任務', 1.375e10, '企業使用價值上升使需求右移的幅度'),
  coef('k_EI', 'Q_E_D', 'k', 'I_E', 'USD/project', '美元／專案', 1.1e4, '企業導入成本上升使需求左移的幅度'),
  coef('k_Es', 'Q_E_D', 'k', 's_E', 'pct', '%', 0, '企業任務成功率的直接效果；v_E 已含成功率效果時為 0'),
  coef('k_Er', 'Q_E_D', 'k', 'r', 'pct/yr', '%／年', 7.555e8, '利率每升 1 個百分點，需前期投資的企業需求減少多少'),
  coef('k_EW', 'Q_E_D', 'k', 'W_E', 'USD/yr', '美元／年', 0.1833, '企業 API 可用預算對需求的移線幅度'),

  coef('A_U', 'Q_U_D', 'intercept', '—', 'ratio', '', null, '消費者需求式常數項（示範校準反推）'),
  coef('d_U', 'Q_U_D', 'slope', 'P_A', 'USD/Mtok', '美元／百萬 token', 1.5e10, 'AI 服務價格每升 1 單位，消費者需求減少多少'),

  coef('A_G', 'Q_G_D', 'intercept', '—', 'ratio', '', null, '政府需求式常數項（示範校準反推）'),
  coef('d_G', 'Q_G_D', 'slope', 'P_A', 'USD/Mtok', '美元／百萬 token', 3.75e9, 'AI 服務價格每升 1 單位，政府需求減少多少'),
  coef('k_Gv', 'Q_G_D', 'k', 'v_G', 'USD/task', '美元／任務', 7.5e9, '公共服務使用價值上升使需求右移的幅度'),
  coef('k_GI', 'Q_G_D', 'k', 'I_G', 'USD/project', '美元／專案', 1500, '政府導入成本上升使需求左移的幅度'),
  coef('k_Gs', 'Q_G_D', 'k', 's_G', 'pct', '%', 0, '政府任務成功率的直接效果；v_G 已含成功率效果時為 0'),
  coef('k_Gr', 'Q_G_D', 'k', 'r', 'pct/yr', '%／年', 2.06e8, '利率每升 1 個百分點，需前期投資的政府需求減少多少'),
  coef('k_GW', 'Q_G_D', 'k', 'W_G', 'USD/yr', '美元／年', 0.375, '政府 API 可用預算對需求的移線幅度'),
];

export const INTERCEPTS = COEFFICIENTS.filter((c) => c.coefKind === 'intercept');

// ---------- 示範校準基準點（假設，非市場估計） ----------

export const CALIBRATION = {
  note: '示範校準：先選正價格與正數量，再反推截距使各式通過此點。這不是市場估計。',
  prices: { P_H: 9000, P_C: 0.4, P_A: 2.0 },
  quantities: { H: 2.0e8, C: 4.0e12, A: 1.0e11 },
  shares: { E: 55, U: 30, G: 15 },
  shareLabels: { E: 'share_E 企業使用量占比（%）', U: 'share_U 消費者使用量占比（%）', G: 'share_G 政府使用量占比（%）' },
};

// ---------- 彙整 ----------

export const SYMBOLS = Object.fromEntries([...FACTORS, ...COEFFICIENTS, ...PRICES].map((s) => [s.id, s]));
export const SYMBOL_IDS = new Set(Object.keys(SYMBOLS));
export const VALUE_IDS = [...FACTORS, ...COEFFICIENTS].map((s) => s.id);

export function unitOfSymbol(name) {
  return SYMBOLS[name]?.unit ?? FORMULA_META[name]?.unit ?? null;
}
