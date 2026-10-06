// 模型定義：依 Notion 01–06、Appendix 與試算表「因子總表（精簡）／Level2換算」（2026-10-05 修訂版）。
// 2027 單期研究情境。除註明外，所有數值為研究情境假設，不是公司或市場觀測資料。
// 百分數一律以百分數值運算（4% 記為 4）；換算式中出現的 /100 已明示於各式。

export const MODEL_VERSION = '2026-10-05';

export const MARKET_IDS = ['H', 'C', 'A'];
export const PRICE_IDS = ['P_H', 'P_C', 'P_A'];

export const MARKETS = {
  H: {
    id: 'H', label: '硬體市場', short: '硬體', price: 'P_H', supply: 'Q_H_S', demand: 'Q_H_D', quantity: 'Q_H',
    priceUnit: 'USD/PFLOPS', priceLabel: '美元／有效 PFLOPS', qtyUnit: 'PFLOPS/yr', qtyLabel: '有效 PFLOPS／年',
    qtyName: '新交付有效容量',
  },
  C: {
    id: 'C', label: '算力市場', short: '算力', price: 'P_C', supply: 'Q_C_S', demand: 'Q_C_D', quantity: 'Q_C',
    priceUnit: 'USD/(PFLOPS*h)', priceLabel: '美元／PFLOP-hour', qtyUnit: 'PFLOPS*h/yr', qtyLabel: 'PFLOP-hour／年',
    qtyName: '實際使用算力（核心產出）',
  },
  A: {
    id: 'A', label: 'AI 服務市場', short: 'AI 服務', price: 'P_A', supply: 'Q_A_S', demand: 'Q_A_D', quantity: 'Q_A',
    priceUnit: 'USD/Mtok', priceLabel: '美元／百萬 token', qtyUnit: 'Mtok/yr', qtyLabel: '百萬 token／年',
    qtyName: 'AI 服務使用量',
  },
};

export const PRICES = PRICE_IDS.map((id, i) => {
  const m = MARKETS[MARKET_IDS[i]];
  return { id, kind: 'price', label: `${m.short}價格`, unit: m.priceUnit, unitLabel: m.priceLabel, market: m.id };
});

/** 2027 基準均衡（Notion 05 §1、Appendix §3）。求解器不讀此值，由測試驗證能獨立求得。 */
export const BASELINE_EQUILIBRIUM = {
  P: { P_H: 100000, P_C: 5, P_A: 1 },
  Q: { H: 1000000, C: 8000000000, A: 40000000000 },
  segments: { Q_E_D: 24000000000, Q_U_D: 8000000000, Q_G_D: 8000000000 },
  split: { inference: 4000000000, other: 4000000000 },
  note: '基準均衡：P_H＝100,000、P_C＝5、P_A＝1；Q_H＝100 萬、Q_C＝80 億、Q_A＝400 億。推論 aQ_A 與訓練等其他算力各 40 億 PFLOP-hour。',
};

export const PLAYERS = [
  { id: 'HW', label: 'Hardware Suppliers（硬體供應商）', short: '硬體供應商' },
  { id: 'CLOUD', label: 'Cloud／Compute Providers（雲端算力商）', short: '雲端算力商' },
  { id: 'MODEL', label: 'Model Providers（模型供應商）', short: '模型供應商' },
  { id: 'DEMAND', label: 'Final Demand（最終需求：企業／個人／政府）', short: '最終需求' },
];

export const CATEGORIES = {
  value: '產出價值', cost: '投入成本', productivity: '生產率', constraint: '限制', expectation: '預期',
};

export const SOURCE_LABELS = {
  observed: '公開可查（參照）',
  assumption: '研究情境假設',
  derived: '由父層換算',
  user: '使用者輸入',
};

// 敏感度旁註（Notion 05 §4／§5 的「其他因素的影響」欄）
const C_NONE = '固定係數下沒有額外直接乘項；a 仍會透過跨市場回饋與均衡式分母改變影響。';
const C_A_CHAIN = '在給定 a 區間內，a 越高，AI 服務變動向算力的傳導越強。';
const C_MULTI = '同時作用於多條曲線；a 改變各渠道權重，淨影響需重新求解。';
const C_POWER = '電力成本 e×epsilon×u 中，其餘乘項較高時，供給成本效果較大；e 另有硬體需求渠道。';
const C_KC = '其餘乘項與 A_C 越高，新增可用存量的算力供給效果越大；另減少新增硬體採購。';
const C_TSMC = '稼動率與良率的產出效果取決於產能及其他乘項；CapEx 只有在 2027 年前量產才影響當年結果。';
const C_HPERF = '效能改善同時降低單位成本 c/h 與耗電 power/h；記憶體容量另提高採購成本，須算淨效果。';
const C_COST_C = '零件用量越多，同一單價變動影響越大；經 c/h 傳導，h 越低成本效果越大。';
const C_VE = '工時、時薪、貨幣化及適用比例的其他乘項較高時，價值變動較大；不再次乘 s_E。';
const C_L = '經 L 同時改硬體需求與算力供給；並行程度不同會改變工期傳導係數。';
const C_A_SUB = '推理倍率與上下文較高、節省較低時，其他子項的絕對影響通常較大；a 也改均衡式分母。';

function f(id, label, player, category, unitLabel, low, base, high, opts = {}) {
  return {
    id, label, player, category, unitLabel, low, base, high,
    kind: 'level1',
    unit: opts.unit ?? null,
    availability: opts.availability ?? 3,
    source: opts.source ?? 'assumption',
    shared: opts.shared ?? null,
    note: opts.note ?? null,
    condition: opts.condition ?? C_NONE,
    sourceNote: opts.sourceNote ?? '研究者估計；無公開數值來源',
    domain: opts.domain ?? { min: 0 },
    pending: false,
  };
}

/** 41 個可計算的 Level 1 因素（直接進入供需式）。 */
export const FACTORS = [
  // ---- 硬體供應商 ----
  f('c', '系統製造成本', 'HW', 'cost', '美元／套', 160000, 200000, 240000,
    { unit: 'USD/set', condition: 'h 較低時，相同成本變動的影響較大；成本每增 1 美元／PFLOPS，硬體供給線上移 1 美元（係數＝b_H）。' }),
  f('h', '整套系統有效效能', 'HW', 'productivity', '實測 PFLOPS／套', 3, 4, 5,
    { unit: 'PFLOPS/set', availability: 2, domain: { min: 0, exclusiveMin: true },
      condition: 'c 較高時，相同效能變動的影響較大；c/h 使上下限效果不對稱。',
      note: '固定工作負載、BF16 dense 與軟體；官方峰值不可直接代替。' }),
  f('N', '合格系統年交付能力', 'HW', 'constraint', '套／年', 200000, 250000, 300000,
    { unit: 'set/yr', condition: '每套有效效能 h 越高，交付能力變動帶來的有效容量變化越大（k_HN＝h₀）。',
      note: '可直接設定，或由台積電投資、產能、稼動率與良率換算；兩種方式不重複加入。' }),
  f('t_H', '關稅率', 'HW', 'constraint', '%（關稅）', 0, 10, 30,
    { unit: 'pct', availability: 2, condition: '關稅提高買方實付 P_H(1+t_H)；同時經硬體需求與算力供給的資本成本渠道作用。',
      note: '只量化關稅，不含出口管制；管制覆蓋率另以 export_cov 經 N 進入。' }),
  f('g_H', '供應商預期訂單成長', 'HW', 'expectation', '%／年', 0, 25, 50, { unit: 'pct/yr', domain: {} }),
  f('r', '利率', 'HW', 'cost', '%／年', 2, 4, 6,
    { unit: 'pct/yr', availability: 1, source: 'observed', shared: ['H', 'C', 'A'], domain: {},
      condition: C_MULTI,
      sourceNote: '公開利率作參照；區間為研究者估計（FRED SOFR 2026-09-29 為 3.88%，僅作量級參照）',
      note: '四個 Player 共用同一份輸入。' }),
  // ---- 雲端算力商 ----
  f('e', '電價', 'CLOUD', 'cost', '美元／kWh', 0.06, 0.10, 0.14,
    { unit: 'USD/kWh', availability: 1, source: 'observed', shared: ['H', 'C'], condition: C_POWER,
      sourceNote: '公開電價作參照（EIA 美國 2026-07 工業電價約 0.0977）；區間為研究者估計' }),
  f('M', '可部署 IT 電力容量', 'CLOUD', 'constraint', 'MW', 15000, 20000, 25000, { unit: 'MW' }),
  f('L', '資料中心建置時間', 'CLOUD', 'constraint', '月', 12, 24, 36, { unit: 'month' }),
  f('K_C', '期初可用硬體存量', 'CLOUD', 'constraint', '有效 PFLOPS', 800000, 1000000, 1200000,
    { unit: 'PFLOPS', condition: 'A_C 越高，存量的算力供給效果越大；同時包含替代新增採購的渠道。' }),
  f('T_H', '有效設備使用年限', 'CLOUD', 'expectation', '年', 2, 4, 6,
    { unit: 'yr', availability: 2, sourceNote: '會計年限作參照（Microsoft 2025 年報 2–6 年）；非物理退役率' }),
  f('g_C', '未來一年預期使用量成長', 'CLOUD', 'expectation', '%／年', 0, 30, 60, { unit: 'pct/yr', domain: {} }),
  f('g_Y', '經濟活動成長預期', 'CLOUD', 'expectation', '%／年', -2, 2, 5,
    { unit: 'pct/yr', availability: 1, domain: {}, sourceNote: '研究者估計區間；公開成長預測需另指定地區與年份' }),
  f('epsilon', 'IT 單位算力耗電', 'CLOUD', 'productivity', 'kWh／PFLOP-hour', 1.5, 2.0, 2.5,
    { unit: 'kWh/(PFLOPS*h)', availability: 2, condition: C_POWER }),
  f('u', '機房 PUE', 'CLOUD', 'productivity', '倍', 1.09, 1.25, 1.54,
    { unit: 'ratio', availability: 2, source: 'observed', domain: { min: 1 }, condition: C_POWER,
      sourceNote: '不同設施的參考端點（Google 2025 平均 1.09、行業調查 1.54）；基準為估計' }),
  f('B', '機房建置成本', 'CLOUD', 'cost', '美元／IT MW', 7000000, 10000000, 13000000, { unit: 'USD/MW', availability: 2 }),
  f('O_C', '算力網路與儲存營運成本', 'CLOUD', 'cost', '美元／PFLOP-hour', 0.10, 0.25, 0.50,
    { unit: 'USD/(PFLOPS*h)', condition: '營運成本每上升 1 美元／PFLOP-hour，算力供給線上移 1 美元（係數＝b_C）。' }),
  f('A_C', '排程與故障後可提供時間', 'CLOUD', 'productivity', '小時／年／套', 7000, 8000, 8600,
    { unit: 'h/yr', condition: 'K_C 越高，相同服務時數變化的影響越大。',
      note: '全年最多 8,760 小時；非實際成交利用率。' }),
  // ---- 模型供應商 ----
  f('a', '每百萬服務 token 推論算力強度', 'MODEL', 'productivity', 'PFLOP-hour／百萬 token', 0.05, 0.10, 0.15,
    { unit: 'PFLOPS*h/Mtok', availability: 2, shared: ['C', 'A'],
      condition: '同時改變推論算力需求 aQ_A 與 AI 供給成本 aP_C，且改變均衡式分母（a² 項），需整式重算。',
      note: '2026-10-05 由 0.01／0.02／0.03 修訂為 0.05／0.1／0.15，使推論占基準算力 50%。' }),
  f('F', '每次訓練所需有效算力', 'MODEL', 'productivity', 'PFLOP-hour／次', 3000000, 5000000, 7000000,
    { unit: 'PFLOPS*h/run', availability: 2 }),
  f('p_D', '訓練資料價格', 'MODEL', 'cost', '美元／百萬資料 token', 1, 3, 5, { unit: 'USD/Mdtok', condition: C_A_CHAIN }),
  f('C_M', '年度模型研發薪資成本', 'MODEL', 'cost', '美元／年', 45000000, 75000000, 105000000,
    { unit: 'USD/yr', condition: '屬固定成本；只按每百萬 token 平均分攤（b_A／Q_A）傳導，影響很小。',
      note: 'C_M＝w×n_RD（年薪 × 研發人數）；w 與 n_RD 為子項，不再直接重加。' }),
  f('E_M', '模型評測與安全成本', 'MODEL', 'cost', '美元／百萬 token', 0.00, 0.02, 0.06,
    { unit: 'USD/Mtok', condition: '每百萬 token 成本，直接使 AI 供給線上移（係數＝b_A）。' }),
  f('D_R', '資料與隱私限制覆蓋率', 'MODEL', 'constraint', '受限制資料／所需資料 %', 0, 20, 40,
    { unit: 'pct', availability: 2, shared: ['C', 'A'], condition: C_MULTI,
      note: '同時進入算力需求、AI 供給、企業與政府需求。' }),
  f('g_M', '模型品質提升預期', 'MODEL', 'expectation', '% 同基準評測改善', 0, 5, 15, { unit: 'pct' }),
  // ---- 最終需求：企業 ----
  f('v_E', '企業任務使用價值', 'DEMAND', 'value', '美元／任務', 1, 3, 5, { unit: 'USD/task', condition: C_A_CHAIN }),
  f('I_E', '企業導入成本', 'DEMAND', 'cost', '美元／專案', 100000, 300000, 500000, { unit: 'USD/project', condition: C_A_CHAIN }),
  f('s_E', '企業任務成功率', 'DEMAND', 'productivity', '%', 70, 80, 90,
    { unit: 'pct', availability: 2, condition: C_A_CHAIN, domain: { min: 0, max: 100 } }),
  f('W_E', '企業年度 API 可用預算', 'DEMAND', 'constraint', '美元／年', 30000000000, 40000000000, 50000000000,
    { unit: 'USD/yr', condition: C_A_CHAIN }),
  f('R_E', '企業預期專案淨收益', 'DEMAND', 'expectation', '美元／專案', -100000, 100000, 500000,
    { unit: 'USD/project', domain: {}, condition: C_A_CHAIN }),
  // ---- 最終需求：政府 ----
  f('v_G', '政府每任務節省', 'DEMAND', 'value', '美元／任務', 0.5, 1.5, 2.5, { unit: 'USD/task', condition: C_A_CHAIN }),
  f('I_G', '政府導入成本', 'DEMAND', 'cost', '美元／專案', 200000, 600000, 1000000, { unit: 'USD/project', condition: C_A_CHAIN }),
  f('s_G', '政府任務成功率', 'DEMAND', 'productivity', '%', 70, 80, 90,
    { unit: 'pct', availability: 2, condition: C_A_CHAIN, domain: { min: 0, max: 100 } }),
  f('W_G', '政府年度 API 可用預算', 'DEMAND', 'constraint', '美元／年', 5000000000, 10000000000, 15000000000,
    { unit: 'USD/yr', condition: C_A_CHAIN }),
  // ---- 最終需求：個人 ----
  f('v_U', '個人每任務使用效益', 'DEMAND', 'value', '美元等價／任務', 0, 0.5, 2.0, { unit: 'USD/task', condition: C_A_CHAIN }),
  f('I_U', '個人非 API 使用成本', 'DEMAND', 'cost', '美元／人月', 0, 5, 15, { condition: C_A_CHAIN }),
  f('s_U', '個人任務成功率', 'DEMAND', 'productivity', '%', 50, 75, 90,
    { unit: 'pct', availability: 2, condition: C_A_CHAIN, domain: { min: 0, max: 100 } }),
  f('access_U', '可上網與可用裝置人口占比', 'DEMAND', 'constraint', '%', 60, 80, 95,
    { unit: 'pct', availability: 2, condition: C_A_CHAIN, domain: { min: 0, max: 100 } }),
  f('W_U', '個人可支配 AI 支出預算', 'DEMAND', 'constraint', '美元／人月', 0, 5, 20, { condition: C_A_CHAIN }),
  f('trust_U', '願意提供資料使用 AI 的比例', 'DEMAND', 'constraint', '%', 20, 50, 80,
    { unit: 'pct', condition: C_A_CHAIN, domain: { min: 0, max: 100 } }),
  f('L_D', '採購合規審核時間', 'DEMAND', 'constraint', '月', 1, 6, 18,
    { unit: 'month', shared: ['A'], condition: C_A_CHAIN, note: '企業與政府共用同一份輸入。' }),
];

/** 尚未定義區間或傳導式的 Level 1 候選：保持待估，不以 0 代替。 */
export const PENDING_FACTORS = [
  { id: 'y', label: '合格系統良率', player: 'HW', unitLabel: '%', reason: '良率目前只經合格產量影響 N（子項 y_F、y_P）；尚未另設獨立傳導式。' },
  { id: 'FX', label: '進口匯率', player: 'HW', unitLabel: '本幣／美元', reason: '尚未指定本幣與地區，區間留白。' },
  { id: 'V_G', label: '公共與戰略效益', player: 'DEMAND', unitLabel: '美元／任務或公共指標', reason: '任務與貨幣化尺度尚未定義。' },
  { id: 'g_G', label: '預期政策效益', player: 'DEMAND', unitLabel: '美元／專案', reason: '尚未與 v_G、公共效益區分。' },
  { id: 'g_U', label: '個人預期持續使用效益', player: 'DEMAND', unitLabel: '美元等價／任務', reason: '尚無可與當期 v_U 區分的未來效益衡量。' },
  { id: 'geo', label: '廣泛地緣政治不確定性', player: 'HW', unitLabel: '待界定', reason: '必須先定義具體事件與範圍；不建立自訂指數。' },
];

function s2(id, label, parents, unitLabel, low, base, high, opts = {}) {
  return {
    id, label, parents, unitLabel, low, base, high,
    kind: 'level2',
    unit: opts.unit ?? null,
    availability: opts.availability ?? 3,
    condition: opts.condition ?? C_NONE,
    note: opts.note ?? null,
    domain: opts.domain ?? { min: 0 },
    player: opts.player ?? null,
  };
}

/** 61 個可計算的 Level 2 子變數（先更新父層，再求均衡）。 */
export const LEVEL2 = [
  // c
  s2('p_die', '加速器晶圓與晶粒成本', ['c'], '美元／合格晶粒', 4500, 6000, 7500, { condition: C_COST_C, player: 'HW' }),
  s2('p_hbm', 'HBM 單位採購成本', ['c'], '美元／GB', 20, 30, 45, { condition: C_COST_C, player: 'HW' }),
  s2('c_pack', '先進封裝單套成本', ['c'], '美元／套', 30000, 40000, 55000, { condition: C_COST_C, player: 'HW' }),
  s2('c_net', '互聯、網通與機箱組件成本', ['c'], '美元／套', 45000, 60000, 80000, { condition: C_COST_C, player: 'HW' }),
  s2('c_asm', '組裝測試物流成本', ['c'], '美元／套', 25000, 32800, 45000, { condition: C_COST_C, player: 'HW' }),
  // h, epsilon
  s2('h_peak', '加速器同精度峰值', ['h', 'epsilon'], 'PFLOPS／套', 7, 80 / 9, 11, { availability: 2, condition: C_HPERF, player: 'HW' }),
  s2('eta_net', '系統互聯效率', ['h', 'epsilon'], '%', 55, 75, 90, { availability: 2, condition: C_HPERF, player: 'HW', domain: { min: 0, max: 100 } }),
  s2('eta_work', '工作負載吞吐達成率', ['h', 'epsilon'], '%', 40, 60, 80, { availability: 2, condition: C_HPERF, player: 'HW', domain: { min: 0, max: 100 } }),
  s2('m_hbm', 'HBM 容量', ['c', 'h', 'epsilon'], 'GB／加速器', 64, 80, 120, { availability: 1, condition: C_HPERF, player: 'HW' }),
  s2('b_hbm', 'HBM 頻寬', ['h', 'epsilon'], 'TB/s／加速器', 2.5, 3.35, 5, { availability: 1, condition: C_HPERF, player: 'HW' }),
  s2('power', '整套平均運轉功率', ['epsilon'], 'kW／套', 6, 8, 10,
    { availability: 2, player: 'CLOUD', condition: 'h 越低，固定功率變動帶來的單位耗電變化越大；電價與 PUE 越高成本影響越大。' }),
  // N（含台積電生產條件）
  s2('C_Fm', 'AI 專用晶圓月供應量', ['N'], '片／月', 8000, 10000, 12000, { condition: C_TSMC, player: 'HW' }),
  s2('C_Pm', 'CoWoS 等先進封裝月產能', ['N'], '300 mm 等效晶圓／月', 15000, 20000, 25000, { condition: C_TSMC, player: 'HW' }),
  s2('rho_F', '台積電 AI 製程稼動率', ['N'], '%', 70, 90, 100, { condition: C_TSMC, player: 'HW', domain: { min: 0, max: 100 } }),
  s2('rho_P', '台積電 AI 封裝稼動率', ['N'], '%', 70, 90, 100, { condition: C_TSMC, player: 'HW', domain: { min: 0, max: 100 } }),
  s2('y_F', '晶粒合格率', ['N'], '%', 65, 80, 90, { condition: C_TSMC, player: 'HW', domain: { min: 0, max: 100 } }),
  s2('y_P', '封裝合格率', ['N'], '%', 85, 95, 99, { condition: C_TSMC, player: 'HW', domain: { min: 0, max: 100 } }),
  s2('I_F', '台積電 AI 相關先進製程 CapEx', ['N'], '億美元／年', 70, 100, 130, { condition: C_TSMC, player: 'HW' }),
  s2('I_P', '台積電 AI 相關先進封裝 CapEx', ['N'], '億美元／年', 20, 30, 45, { condition: C_TSMC, player: 'HW' }),
  s2('lag_F', '台積電製程投資到量產時間', ['N'], '年', 2, 3, 4, { availability: 2, condition: C_TSMC, player: 'HW' }),
  s2('lag_P', '台積電封裝投資到量產時間', ['N'], '年', 1, 2, 4, { availability: 2, condition: C_TSMC, player: 'HW' }),
  s2('H_supply', 'HBM 供貨量', ['N'], 'GB／年', 128000000, 160000000, 208000000, { condition: C_TSMC, player: 'HW' }),
  s2('N_net', '互聯系統年交付能力', ['N'], '套／年', 200000, 250000, 325000, { condition: C_TSMC, player: 'HW' }),
  s2('export_cov', '管制覆蓋交易占比', ['N'], '%', 0, 20, 50, { condition: C_TSMC, player: 'HW', domain: { min: 0, max: 100 } }),
  // M
  s2('M_grid', '已簽約併網容量', ['M'], 'MW', 15000, 20000, 25000, { player: 'CLOUD', condition: '此處固定配套反應係數；實際配套改善時應重估係數。' }),
  s2('M_room', '已驗收機房 IT 容量', ['M'], 'MW', 15000, 20000, 25000, { player: 'CLOUD', condition: '此處固定配套反應係數；實際配套改善時應重估係數。' }),
  s2('M_cool', '可用冷卻容量', ['M'], 'MW 熱負荷', 15000, 20000, 25000, { player: 'CLOUD', condition: '此處固定配套反應係數；暫以 1 熱 MW 對應 1 IT MW。' }),
  // L
  s2('l_grid', '電網併網等待時間', ['L'], '月', 6, 18, 36, { condition: C_L, player: 'CLOUD' }),
  s2('l_build', '機房施工與驗收時間', ['L'], '月', 6, 12, 24, { condition: C_L, player: 'CLOUD' }),
  // K_C
  s2('n_stock', '期初在役系統數', ['K_C'], '套', 300000, 1000000 / 2.7, 450000, { condition: C_KC, player: 'CLOUD' }),
  s2('ready', '存量設備可用率', ['K_C'], '%', 80, 90, 98, { condition: C_KC, player: 'CLOUD', domain: { min: 0, max: 100 } }),
  s2('compat', '與現有工作負載相容率', ['K_C'], '%', 50, 75, 95, { condition: C_KC, player: 'CLOUD', domain: { min: 0, max: 100 } }),
  // T_H, g_C
  s2('resale', '預期殘值占原值比例', ['T_H'], '%', 0, 15, 30,
    { player: 'CLOUD', condition: '若殘值改變未影響換機決策，應調低或取消此係數；效果方向取決於這項行為假設。', domain: { min: 0, max: 100 } }),
  s2('g_signed', '事前已簽約需求預測成長', ['g_C'], '%／年', 0, 20, 40,
    { player: 'CLOUD', domain: {}, condition: '已簽約業務占比較高時，傳入整體需求預期的效果較大。' }),
  // B, O_C
  s2('premium', 'AI 機房建置溢價', ['B'], '%', 7, 8.5, 10,
    { availability: 2, player: 'CLOUD', condition: '受溢價影響的工程成本越高，同一百分點溢價影響越大。' }),
  s2('c_land', '土地與機電工程', ['B'], '美元／IT MW', 1000000, 2000000, 3000000,
    { availability: 2, player: 'CLOUD', condition: '受溢價影響的工程成本越高，同一百分點溢價影響越大。' }),
  s2('p_net', '機房網路費率', ['O_C'], '美元／Gbps年', 1000, 2000, 4000,
    { player: 'CLOUD', condition: '每單位算力所需頻寬／儲存越多，相同費率變動影響越大。' }),
  s2('p_store', '儲存費率', ['O_C'], '美元／TB年', 60, 100, 160,
    { player: 'CLOUD', condition: '每單位算力所需頻寬／儲存越多，相同費率變動影響越大。' }),
  // a
  s2('reasoning', '推理步數或額外 token 比', ['a'], '倍', 1, 2, 5, { condition: C_A_SUB, player: 'MODEL' }),
  s2('saving', '量化和批次處理節省比', ['a'], '%', 0, 20, 50, { condition: C_A_SUB, player: 'MODEL', domain: { min: 0, max: 100 } }),
  s2('context', '平均上下文長度', ['a'], 'tokens／請求', 1000, 5000, 20000, { availability: 2, condition: C_A_SUB, player: 'MODEL' }),
  // F
  s2('tokens_train', '每次訓練 token 數', ['F'], '十億 token／次', 5000, 10000, 20000,
    { availability: 2, player: 'MODEL', condition: 'token 與參數越大或效率越低，另一項變動帶來的資源需求變化越大。' }),
  s2('params', '有效參數規模', ['F'], '十億參數', 70, 200, 405,
    { availability: 2, player: 'MODEL', condition: 'token 與參數越大或效率越低，另一項變動帶來的資源需求變化越大。' }),
  s2('eta_train', '訓練效率（模型FLOPs／資源FLOPs）', ['F'], '%', 25, 40, 60,
    { availability: 2, player: 'MODEL', domain: { min: 0, max: 100, exclusiveMin: true },
      condition: 'token 與參數越大或效率越低，另一項變動帶來的資源需求變化越大。' }),
  // p_D, C_M
  s2('licensed', '授權可用資料比例', ['p_D'], '%', 50, 70, 90,
    { player: 'MODEL', domain: { min: 0, max: 100, exclusiveMin: true }, condition: '授權比例越低，同一百分點變動影響越大；取得單價越高也會放大。' }),
  s2('c_clean', '資料清洗標註成本', ['p_D'], '美元／百萬 token', 0.5, 2, 5,
    { player: 'MODEL', condition: '授權比例越低，同一百分點變動影響越大；取得單價越高也會放大。' }),
  s2('w', '模型人才年薪', ['C_M'], '美元／人年', 150000, 250000, 350000,
    { availability: 2, player: 'MODEL', condition: '人數越多，薪資變動影響越大；薪資越高，增減一人的成本效果越大。' }),
  s2('n_RD', '模型研發人數', ['C_M'], '人', 100, 300, 800,
    { player: 'MODEL', condition: '人數越多，薪資變動影響越大；薪資越高，增減一人的成本效果越大。' }),
  // v_E, I_E, W_E
  s2('tau_E', '任務可節省工時', ['v_E'], '小時／成功任務', 0, 0.25, 1, { availability: 2, condition: C_VE, player: 'DEMAND' }),
  s2('omega_E', '任務人工時薪', ['v_E'], '美元／小時', 15, 30, 60, { availability: 1, condition: C_VE, player: 'DEMAND' }),
  s2('mu_E', '可貨幣化節省比例', ['v_E'], '%', 0, 30, 70, { condition: C_VE, player: 'DEMAND', domain: { min: 0, max: 100 } }),
  s2('automatable', '可自動化任務比例', ['v_E'], '%', 10, 30, 60, { availability: 2, condition: C_VE, player: 'DEMAND', domain: { min: 0, max: 100 } }),
  s2('hours_data', '資料整合工時', ['I_E'], '人時／專案', 500, 2000, 5000,
    { player: 'DEMAND', condition: '人時單價越高，工時變動的影響越大；目前單價是固定係數。' }),
  s2('hours_train', '員工訓練時間', ['I_E'], '人時／專案', 200, 1000, 3000,
    { player: 'DEMAND', condition: '人時單價越高，工時變動的影響越大；目前單價是固定係數。' }),
  s2('c_sec', '資安與審查費用', ['I_E'], '美元／專案', 10000, 50000, 150000,
    { player: 'DEMAND', condition: '人時單價越高，工時變動的影響越大；目前單價是固定係數。' }),
  s2('share_AI', '事前 IT 總預算中 AI 可用份額', ['W_E'], '%', 2, 5, 10,
    { player: 'DEMAND', domain: { min: 0, max: 100 }, condition: '總 IT 預算越大，同一百分點 API 預算份額影響越大。' }),
  // L_D, v_U, trust_U, W_G
  s2('l_proc', '採購流程週期', ['L_D'], '月', 3, 9, 18,
    { player: 'DEMAND', condition: '審核占流程比重越高，傳導越強；模型中同時作用於企業與政府。' }),
  s2('minutes_U', '節省個人時間', ['v_U'], '分鐘／成功任務', 0, 5, 20,
    { player: 'DEMAND', condition: '時間單價或每任務 token 數較高時，相應子項的價值換算較大。' }),
  s2('wtp', '願付價格', ['v_U'], '美元／百萬 token', 0, 2, 8,
    { player: 'DEMAND', condition: '時間單價或每任務 token 數較高時，相應子項的價值換算較大。' }),
  s2('privacy', '隱私疑慮者占比', ['trust_U'], '%', 20, 45, 70,
    { player: 'DEMAND', domain: { min: 0, max: 100 }, condition: '疑慮轉為拒絕的比例越高，影響越大。' }),
  s2('budget_G', '已核准 AI 採購預算', ['W_G'], '美元／年', 5000000000, 10000000000, 15000000000,
    { availability: 2, player: 'DEMAND', condition: 'a 決定服務需求向算力需求的傳導強度。' }),
];

/** 同量換算／參照紀錄：不獨立排名（Appendix §5）。 */
export const REFERENCE_ROWS = [
  { id: 'h_ref', label: '有效效能 h（耗電換算用）', note: '與 h 同口徑時共用其數值，不另估上下限。' },
  { id: 'PUE_extra', label: '冷卻與供配電額外用電', note: 'PUE−1 的同量替代表示。' },
  { id: 'FLOPs_token', label: '每服務 token 的平均 FLOPs', note: 'a×3.6×10¹² 的單位換算。' },
  { id: 'w_reference', label: '相關職類公開年薪', note: '公開職類薪資參照，不是 w 的機械決定式。' },
];

/**
 * Level 2 → Level 1 的父層換算式（Notion 03／Appendix §5.1、試算表「Level2換算」）。
 * C_F、C_P、G_F、G_P、J_F、J_P 為中間量，不是可排名的因素。
 */
export const DERIVATIONS = [
  { id: 'c', target: 'c', expr: '8*p_die + 8*m_hbm*p_hbm + c_pack + c_net + c_asm',
    note: '每套 8 個晶粒／加速器；合格晶粒買價已含供應商良率，不再乘良率。' },
  { id: 'h', target: 'h', expr: 'h_peak*(eta_net/100)*(eta_work/100)*(m_hbm/80)^0.2*(b_hbm/3.35)^0.3',
    note: '互聯與工作負載效率互不重複；記憶體 0.2／0.3 為小幅遞減反應假設。' },
  { id: 'epsilon', target: 'epsilon', expr: 'power/h', note: 'kW／套 ÷ PFLOPS／套；須先算 h。' },
  { id: 'J_F', target: null, expr: 'step(3 - lag_F)', note: '2024＋ℓ_F ≤ 2027 時為 1，否則 0。' },
  { id: 'J_P', target: null, expr: 'step(3 - lag_P)', note: '2024＋ℓ_P ≤ 2027 時為 1，否則 0。' },
  { id: 'C_F', target: null, expr: '12*(C_Fm + 20*(I_F*J_F - 100))', note: '晶圓投入片／年；每億美元形成月產能 20 片。' },
  { id: 'C_P', target: null, expr: '12*20*(C_Pm + 100*(I_P*J_P - 30))', note: '封裝投入件／年；每等效晶圓 20 件、每億美元 100 等效晶圓。' },
  { id: 'G_F', target: null, expr: 'C_F*(rho_F/100)*80*(y_F/100)', note: '合格晶粒／年；每片晶圓暫有 80 個可切割晶粒。' },
  { id: 'G_P', target: null, expr: 'C_P*(rho_P/100)*(y_P/100)', note: '合格封裝件／年。' },
  { id: 'N', target: 'N',
    expr: '250000*(G_F/6912000)^0.25*(G_P/4104000)^0.35*(H_supply/160000000)^0.2*(N_net/250000)^0.2*(1 - export_cov/100)/0.8',
    note: '固定反應彈性 0.25／0.35／0.2／0.2；不相加、不設硬性上限。' },
  { id: 'M', target: 'M', expr: '20000 + 0.4*(M_grid - 20000) + 0.35*(M_room - 20000) + 0.25*(M_cool - 20000)',
    note: '局部移線反應，非三種容量相加。' },
  { id: 'L', target: 'L', expr: '24 + 0.5*(l_grid - 18) + 0.5*(l_build - 12)', note: '併網與施工可並行，各以一半延誤傳入。' },
  { id: 'K_C', target: 'K_C', expr: 'n_stock*4*(ready/100)*(compat/100)', note: '4 為期初設備每套有效 PFLOPS，不與當期新硬體 h 共用。' },
  { id: 'T_H', target: 'T_H', expr: '4 - (resale - 15)/15', note: '殘值提高 15 個百分點使換機提早 1 年（行為假設）。' },
  { id: 'g_C', target: 'g_C', expr: '30 + 0.6*(g_signed - 20)', note: '已簽約需求對整體預期的反應權重暫設 60%。' },
  { id: 'B', target: 'B', expr: '(8000000/1.085)*(1 + premium/100) + c_land', note: '溢價只施於土地機電以外的工程成本。' },
  { id: 'O_C', target: 'O_C', expr: '0.000075*p_net + 0.001*p_store', note: '單位算力分攤 0.000075 Gbps年 與 0.001 TB年。' },
  { id: 'a', target: 'a', expr: '0.1*(reasoning/2)*((1 - saving/100)/0.8)*(0.75 + 0.25*context/5000)',
    note: '上下文相關成本占基準 25%，其餘 75% 固定。' },
  { id: 'F', target: 'F', expr: '5000000*(tokens_train/10000)*(params/200)*(0.4/(eta_train/100))',
    note: '對 token、參數成比例，對效率成反比。' },
  { id: 'p_D', target: 'p_D', expr: '0.7/(licensed/100) + c_clean', note: '每百萬候選 token 取得成本 0.7 美元，除授權可用率後加清洗費。' },
  { id: 'C_M', target: 'C_M', expr: 'w*n_RD', note: '年度人力成本＝年薪 × 人數。' },
  { id: 'v_E', target: 'v_E', expr: '0.75 + tau_E*omega_E*(mu_E/100)*(automatable/30)',
    note: '0.75 為固定其他收益；任務適用範圍相對 30% 調整，不再乘 s_E。' },
  { id: 'I_E', target: 'I_E', expr: '100000 + 50*hours_data + 50*hours_train + c_sec', note: '兩類工時暫用 50 美元／人時。' },
  { id: 'W_E', target: 'W_E', expr: '800000000000*(share_AI/100)', note: '研究範圍 IT 預算固定 8,000 億美元。' },
  { id: 'L_D', target: 'L_D', expr: '6 + 0.5*(l_proc - 9)', note: '總採購流程延誤的一半反映於合規審核時間。' },
  { id: 'v_U', target: 'v_U', expr: '0.5*(0.1*minutes_U) + 0.5*(0.25*wtp)', note: '時間價值與願付價各半，避免同一效益加兩次。' },
  { id: 'trust_U', target: 'trust_U', expr: '50 - 0.6*(privacy - 45)', note: '疑慮每增 1 個百分點，願意提供資料者減少 0.6 個百分點。' },
  { id: 'W_G', target: 'W_G', expr: 'budget_G', note: '父層的資料輸入口，同值時敏感度相同。' },
];

export const INTERMEDIATE_IDS = DERIVATIONS.filter((d) => !d.target).map((d) => d.id);
export const DERIVABLE_PARENTS = DERIVATIONS.filter((d) => d.target).map((d) => d.target);

// ---------- 係數（Notion 04 §4）----------

function coef(id, label, value, group, unitLabel, purpose, origin = 'behavior') {
  return { id, label, value, group, unitLabel, purpose, origin, kind: 'coefficient' };
}

export const COEFFICIENT_GROUPS = [
  { id: 'slope', label: '本市場價格斜率與跨市場係數' },
  { id: 'H_s', label: '硬體供給 Q_H^S 的非價格項' },
  { id: 'H_d', label: '硬體需求 Q_H^D 的非價格項' },
  { id: 'C_s', label: '算力供給 Q_C^S 的非價格項' },
  { id: 'C_d', label: '其他算力需求 Q_C^D 的非價格項' },
  { id: 'A_s', label: 'AI 供給 Q_A^S 的非價格項' },
  { id: 'E_d', label: '企業需求 Q_E^D 的非價格項' },
  { id: 'G_d', label: '政府需求 Q_G^D 的非價格項' },
  { id: 'U_d', label: '個人需求 Q_U^D 的非價格項' },
];

export const COEFFICIENTS = [
  // 價格斜率與跨市場（第 4.1 節推導）
  coef('b_H', '硬體供給價格斜率', 5, 'slope', '有效 PFLOPS／年 ÷（美元／PFLOPS）', '彈性 0.5：P_H 增 10%，供給增 5%', 'derived'),
  coef('d_H', '硬體需求價格斜率', 5, 'slope', '有效 PFLOPS／年 ÷（美元／PFLOPS）', '彈性 0.5：P_H 增 10%，需求減 5%', 'derived'),
  coef('k_HC', '算力價格對硬體需求（＝d_H×m）', 100000, 'slope', '有效 PFLOPS／年 ÷（美元／PFLOP-hour）',
    '硬體需求取決於 P_H−mP_C；m＝20,000 PFLOP-hour／有效 PFLOPS', 'derived'),
  coef('b_C', '算力供給價格斜率', 400000000, 'slope', 'PFLOP-hour／年 ÷（美元／PFLOP-hour）', '彈性 0.25', 'derived'),
  coef('d_C', '其他算力需求價格斜率', 200000000, 'slope', 'PFLOP-hour／年 ÷（美元／PFLOP-hour）', '訓練等其他算力的價格反應', 'derived'),
  coef('k_CH', '硬體價格對算力供給（＝d_H×h_new）', 40000 / 3, 'slope', 'PFLOP-hour／年 ÷（美元／PFLOPS）',
    'h_new＝A_C/2×2/3≈2,667 PFLOP-hour，為每單位新硬體 2027 年提供的服務量', 'derived'),
  coef('b_A', 'AI 供給價格斜率', 20000000000, 'slope', '百萬 token／年 ÷（美元／百萬 token）', '彈性 0.5', 'derived'),
  coef('k_AC', '算力成本對 AI 供給（＝b_A）', 20000000000, 'slope', '百萬 token／年 ÷（美元／百萬 token）',
    'AI 供給取決於毛利 P_A−aP_C', 'derived'),
  coef('d_E', '企業需求價格斜率', 12000000000, 'slope', '百萬 token／年 ÷（美元／百萬 token）', '三群合計 2×10¹⁰', 'derived'),
  coef('d_U', '個人需求價格斜率', 4000000000, 'slope', '百萬 token／年 ÷（美元／百萬 token）', '三群合計 2×10¹⁰', 'derived'),
  coef('d_G', '政府需求價格斜率', 4000000000, 'slope', '百萬 token／年 ÷（美元／百萬 token）', '三群合計 2×10¹⁰', 'derived'),
  // 硬體供給
  coef('H_s0', '硬體供給基準常數', 500000, 'H_s', '有效 PFLOPS／年', '基準點通過條件'),
  coef('k_Hc', '單位容量成本 c/h（＝b_H）', 5, 'H_s', '有效 PFLOPS／年 ÷（美元／PFLOPS）', '成本上升 Δ，供給線垂直上移 Δ', 'derived'),
  coef('k_Hr_S', '利率對硬體供給', 10000, 'H_s', '有效 PFLOPS／年 ÷ %', '利率每升 1 個百分點的長期供給反應'),
  coef('k_HN', '交付能力對硬體供給（＝h₀）', 4, 'H_s', '有效 PFLOPS／套', '多交付一套即多供給 4 有效 PFLOPS', 'derived'),
  coef('k_HgH', '供應商預期對硬體供給', 5000, 'H_s', '有效 PFLOPS／年 ÷ %', 'g_H 增 10 個百分點 → 供給增 50,000（5%）'),
  // 硬體需求
  coef('H_d0', '硬體需求基準常數', 1000000, 'H_d', '有效 PFLOPS／年', '基準點通過條件'),
  coef('k_Hr_D', '利率對硬體需求', 20000, 'H_d', '有效 PFLOPS／年 ÷ %', '資本成本渠道'),
  coef('k_He', '電價對硬體需求', 500000, 'H_d', '有效 PFLOPS／年 ÷（美元／kWh）', '營運成本預期'),
  coef('k_HL', '建置時間對硬體需求', 5000, 'H_d', '有效 PFLOPS／年 ÷ 月', 'L 增 1 月 → 當年需求減 5,000'),
  coef('k_HM', '電力容量對硬體需求', 10, 'H_d', '有效 PFLOPS／年 ÷ MW', '可部署容量的移線幅度'),
  coef('k_HK', '既有存量對硬體需求', 0.2, 'H_d', '有效 PFLOPS／年 ÷ 有效 PFLOPS', 'K_C 增加替代部分新購'),
  coef('k_HgC', '使用量成長預期對硬體需求', 5000, 'H_d', '有效 PFLOPS／年 ÷ %', 'g_C 增 10 個百分點 → 需求增 50,000'),
  coef('k_Ht', '關稅對硬體需求（＝d_H×P_H/100）', 5000, 'H_d', '有效 PFLOPS／年 ÷ %', '關稅每增 1 個百分點，買方實付增 P_H/100', 'derived'),
  coef('k_HT', '使用年限對硬體需求', 50000, 'H_d', '有效 PFLOPS／年 ÷ 年', 'T_H 延長 1 年 → 替換採購減 50,000'),
  coef('k_HY', '經濟成長對硬體需求', 20000, 'H_d', '有效 PFLOPS／年 ÷ %', 'g_Y 增 1 個百分點 → 需求增 20,000'),
  // 算力供給
  coef('C_s0', '算力供給基準常數', 22000000000 / 3, 'C_s', 'PFLOP-hour／年', '基準點通過條件'),
  coef('k_Cr_S', '利率對算力供給', 40000000, 'C_s', 'PFLOP-hour／年 ÷ %', '資本成本渠道'),
  coef('k_Ce', '單位電力與營運成本（＝b_C）', 400000000, 'C_s', 'PFLOP-hour／年 ÷（美元／PFLOP-hour）',
    '成本上升 1 美元 → 供給線上移 1 美元', 'derived'),
  coef('k_CB', '機房建置成本對算力供給', 20, 'C_s', 'PFLOP-hour／年 ÷（美元／MW）', '長期資本成本'),
  coef('k_CM', '電力容量對算力供給', 20000, 'C_s', 'PFLOP-hour／年 ÷ MW', '可部署容量的移線幅度'),
  coef('k_CKA', '存量服務時數對算力供給', 0.25, 'C_s', 'PFLOP-hour／年 ÷（PFLOPS×小時）', '邊際售出比例，低於平均利用率 2/3'),
  coef('k_CgC', '使用量成長預期對算力供給', 8000000, 'C_s', 'PFLOP-hour／年 ÷ %', 'g_C 增 10 個百分點 → 供給增 8,000 萬（1%）'),
  coef('k_CY', '經濟成長對算力供給', 80000000, 'C_s', 'PFLOP-hour／年 ÷ %', 'g_Y 增 1 個百分點 → 供給增 8,000 萬（1%）'),
  coef('k_CL', '建置時間對算力供給', 40000000, 'C_s', 'PFLOP-hour／年 ÷ 月', 'L 增 1 月 → 當年供給減 4,000 萬（0.5%）'),
  coef('k_Ct', '關稅對算力供給（＝k_CH×P_H/100）', 40000000 / 3, 'C_s', 'PFLOP-hour／年 ÷ %', '與 P_H 同一資本成本渠道', 'derived'),
  // 其他算力需求
  coef('C_d0', '其他算力需求基準常數', 5000000000, 'C_d', 'PFLOP-hour／年', '訓練與其他非本期服務用途'),
  coef('k_Cr_D', '利率對其他算力需求', 20000000, 'C_d', 'PFLOP-hour／年 ÷ %', '研發／訓練投資渠道'),
  coef('k_CF', '單次訓練算力對需求', 20, 'C_d', 'PFLOP-hour／年 ÷（PFLOP-hour／次）', '對應年度 20 次訓練的情境設定'),
  coef('k_CgM', '品質提升預期對算力需求', 10000000, 'C_d', 'PFLOP-hour／年 ÷ %', 'g_M 增 5 個百分點 → 需求增 5,000 萬'),
  coef('k_CDR', '資料限制對算力需求', 4000000, 'C_d', 'PFLOP-hour／年 ÷ %', 'D_R 增 10 個百分點 → 需求減 4,000 萬'),
  // AI 供給
  coef('A_s0', 'AI 供給基準常數', 30000000000, 'A_s', '百萬 token／年', '基準點通過條件'),
  coef('k_AD', '資料價格對 AI 供給', 100000000, 'A_s', '百萬 token／年 ÷（美元／百萬資料 token）', 'b_A×20 次×10⁷ 百萬 token／Q_A', 'derived'),
  coef('k_ACM', '研發薪資對 AI 供給（＝b_A/Q_A）', 0.5, 'A_s', '百萬 token／年 ÷（美元／年）', '固定成本按每百萬 token 平均分攤', 'derived'),
  coef('k_Ar_S', '利率對 AI 供給', 200000000, 'A_s', '百萬 token／年 ÷ %', '研發與部署投資渠道'),
  coef('k_AE', '評測安全成本（＝b_A）', 20000000000, 'A_s', '百萬 token／年 ÷（美元／百萬 token）', '單位成本上升使供給線上移', 'derived'),
  coef('k_ADR', '資料限制對 AI 供給', 80000000, 'A_s', '百萬 token／年 ÷ %', 'D_R 增 10 個百分點 → 供給減 8 億（2%）'),
  // 企業需求
  coef('E_d0', '企業需求基準常數', 36000000000, 'E_d', '百萬 token／年', '基準點通過條件'),
  coef('k_Ev', '使用價值對企業需求', 800000000, 'E_d', '百萬 token／年 ÷（美元／任務）', ''),
  coef('k_EI', '導入成本對企業需求', 4000, 'E_d', '百萬 token／年 ÷（美元／專案）', ''),
  coef('k_Es', '成功率對企業需求', 40000000, 'E_d', '百萬 token／年 ÷ %', ''),
  coef('k_Er', '利率對企業需求', 200000000, 'E_d', '百萬 token／年 ÷ %', '需前期投資的導入需求'),
  coef('k_EW', '預算對企業需求', 0.08, 'E_d', '百萬 token／年 ÷（美元／年）', '不使用 W/P_A 作支出上限'),
  coef('k_ER', '預期淨收益對企業需求', 12000, 'E_d', '百萬 token／年 ÷（美元／專案）', 'R_E 增 10 萬美元 → 需求增 12 億（5%）'),
  coef('k_ELD', '合規時間對企業需求', 200000000, 'E_d', '百萬 token／年 ÷ 月', 'L_D 延長 6 月 → 需求減 12 億（5%）'),
  coef('k_EDR', '資料限制對企業需求', 40000000, 'E_d', '百萬 token／年 ÷ %', ''),
  // 政府需求
  coef('G_d0', '政府需求基準常數', 12000000000, 'G_d', '百萬 token／年', '基準點通過條件'),
  coef('k_Gv', '使用價值對政府需求', 400000000, 'G_d', '百萬 token／年 ÷（美元／任務）', ''),
  coef('k_GI', '導入成本對政府需求', 800, 'G_d', '百萬 token／年 ÷（美元／專案）', ''),
  coef('k_Gs', '成功率對政府需求', 20000000, 'G_d', '百萬 token／年 ÷ %', ''),
  coef('k_Gr', '利率對政府需求', 40000000, 'G_d', '百萬 token／年 ÷ %', ''),
  coef('k_GW', '預算對政府需求', 0.08, 'G_d', '百萬 token／年 ÷（美元／年）', ''),
  coef('k_GLD', '合規時間對政府需求', 80000000, 'G_d', '百萬 token／年 ÷ 月', ''),
  coef('k_GDR', '資料限制對政府需求', 20000000, 'G_d', '百萬 token／年 ÷ %', ''),
  // 個人需求
  coef('U_d0', '個人需求基準常數', 12000000000, 'U_d', '百萬 token／年', '基準點通過條件'),
  coef('k_Uv', '使用效益對個人需求', 800000000, 'U_d', '百萬 token／年 ÷（美元等價／任務）', ''),
  coef('k_UI', '使用成本對個人需求', 80000000, 'U_d', '百萬 token／年 ÷（美元／人月）', ''),
  coef('k_Us', '成功率對個人需求', 40000000, 'U_d', '百萬 token／年 ÷ %', ''),
  coef('k_Uaccess', '上網裝置占比對個人需求', 40000000, 'U_d', '百萬 token／年 ÷ %', ''),
  coef('k_UW', '可支配預算對個人需求', 160000000, 'U_d', '百萬 token／年 ÷（美元／人月）', ''),
  coef('k_Utrust', '信任比例對個人需求', 40000000, 'U_d', '百萬 token／年 ÷ %', ''),
];

// ---------- 供需方程式（Notion 04 §2，Δ 相對基準）----------

export const FORMULA_META = {
  H_s: { label: '硬體供給非價格項', unitLabel: '有效 PFLOPS／年', unit: 'PFLOPS/yr', role: 'intercept', market: 'H' },
  H_d: { label: '硬體需求非價格項', unitLabel: '有效 PFLOPS／年', unit: 'PFLOPS/yr', role: 'intercept', market: 'H' },
  C_s: { label: '算力供給非價格項', unitLabel: 'PFLOP-hour／年', unit: 'PFLOPS*h/yr', role: 'intercept', market: 'C' },
  C_d: { label: '其他算力需求非價格項', unitLabel: 'PFLOP-hour／年', unit: 'PFLOPS*h/yr', role: 'intercept', market: 'C' },
  A_s: { label: 'AI 供給非價格項', unitLabel: '百萬 token／年', unit: 'Mtok/yr', role: 'intercept', market: 'A' },
  E_d: { label: '企業需求非價格項', unitLabel: '百萬 token／年', unit: 'Mtok/yr', role: 'intercept', market: 'A' },
  G_d: { label: '政府需求非價格項', unitLabel: '百萬 token／年', unit: 'Mtok/yr', role: 'intercept', market: 'A' },
  U_d: { label: '個人需求非價格項', unitLabel: '百萬 token／年', unit: 'Mtok/yr', role: 'intercept', market: 'A' },
  A_d: { label: 'AI 需求非價格項（三群合計）', unitLabel: '百萬 token／年', unit: 'Mtok/yr', role: 'intercept', market: 'A' },
  Q_H_S: { label: '硬體供給量', unitLabel: '有效 PFLOPS／年', unit: 'PFLOPS/yr', role: 'supply', market: 'H' },
  Q_H_D: { label: '硬體需求量', unitLabel: '有效 PFLOPS／年', unit: 'PFLOPS/yr', role: 'demand', market: 'H' },
  Q_C_S: { label: '算力供給量', unitLabel: 'PFLOP-hour／年', unit: 'PFLOPS*h/yr', role: 'supply', market: 'C' },
  Q_C_D: { label: '算力需求量（其他＋推論）', unitLabel: 'PFLOP-hour／年', unit: 'PFLOPS*h/yr', role: 'demand', market: 'C' },
  Q_A_S: { label: 'AI 服務供給量', unitLabel: '百萬 token／年', unit: 'Mtok/yr', role: 'supply', market: 'A' },
  Q_E_D: { label: '企業 AI 需求量', unitLabel: '百萬 token／年', unit: 'Mtok/yr', role: 'segment', market: 'A' },
  Q_U_D: { label: '個人 AI 需求量', unitLabel: '百萬 token／年', unit: 'Mtok/yr', role: 'segment', market: 'A' },
  Q_G_D: { label: '政府 AI 需求量', unitLabel: '百萬 token／年', unit: 'Mtok/yr', role: 'segment', market: 'A' },
  Q_A_D: { label: 'AI 服務總需求量', unitLabel: '百萬 token／年', unit: 'Mtok/yr', role: 'demand', market: 'A' },
};

export const MARKET_FORMULAS = [
  { id: 'H_s', expr: 'H_s0 - k_Hc*(c/h - 50000) - k_Hr_S*(r - 4) + k_HN*(N - 250000) + k_HgH*(g_H - 25)' },
  { id: 'H_d', expr: 'H_d0 - k_Hr_D*(r - 4) - k_He*(e - 0.10) - k_HL*(L - 24) + k_HM*(M - 20000) - k_HK*(K_C - 1000000) + k_HgC*(g_C - 30) - k_Ht*(t_H - 10) - k_HT*(T_H - 4) + k_HY*(g_Y - 2)' },
  { id: 'C_s', expr: 'C_s0 - k_Cr_S*(r - 4) - k_Ce*(e*epsilon*u + O_C - 0.50) - k_CB*(B - 10000000) + k_CM*(M - 20000) + k_CKA*(K_C*A_C - 8000000000) + k_CgC*(g_C - 30) + k_CY*(g_Y - 2) - k_CL*(L - 24) - k_Ct*(t_H - 10)' },
  { id: 'C_d', expr: 'C_d0 - k_Cr_D*(r - 4) + k_CF*(F - 5000000) + k_CgM*(g_M - 5) - k_CDR*(D_R - 20)' },
  { id: 'A_s', expr: 'A_s0 - k_AD*(p_D - 3) - k_ACM*(C_M - 75000000) - k_Ar_S*(r - 4) - k_AE*(E_M - 0.02) - k_ADR*(D_R - 20)' },
  { id: 'E_d', expr: 'E_d0 + k_Ev*(v_E - 3) - k_EI*(I_E - 300000) + k_Es*(s_E - 80) - k_Er*(r - 4) + k_EW*(W_E - 40000000000) + k_ER*(R_E - 100000) - k_ELD*(L_D - 6) - k_EDR*(D_R - 20)' },
  { id: 'G_d', expr: 'G_d0 + k_Gv*(v_G - 1.5) - k_GI*(I_G - 600000) + k_Gs*(s_G - 80) - k_Gr*(r - 4) + k_GW*(W_G - 10000000000) - k_GLD*(L_D - 6) - k_GDR*(D_R - 20)' },
  { id: 'U_d', expr: 'U_d0 + k_Uv*(v_U - 0.5) - k_UI*(I_U - 5) + k_Us*(s_U - 75) + k_Uaccess*(access_U - 80) + k_UW*(W_U - 5) + k_Utrust*(trust_U - 50)' },
  { id: 'A_d', expr: 'E_d + U_d + G_d' },
  { id: 'Q_H_S', expr: 'H_s + b_H*P_H' },
  { id: 'Q_H_D', expr: 'H_d - d_H*P_H + k_HC*P_C' },
  { id: 'Q_C_S', expr: 'C_s + b_C*P_C - k_CH*P_H' },
  { id: 'Q_C_D', expr: 'C_d - d_C*P_C + a*Q_A_D' },
  { id: 'Q_A_S', expr: 'A_s + b_A*P_A - k_AC*a*P_C' },
  { id: 'Q_E_D', expr: 'E_d - d_E*P_A' },
  { id: 'Q_U_D', expr: 'U_d - d_U*P_A' },
  { id: 'Q_G_D', expr: 'G_d - d_G*P_A' },
  { id: 'Q_A_D', expr: 'Q_E_D + Q_U_D + Q_G_D' },
];

export const DEFAULT_EXPR = Object.fromEntries([...MARKET_FORMULAS, ...DERIVATIONS].map((x) => [x.id, x.expr]));
export const REQUIRED_FORMULAS = ['Q_H_S', 'Q_H_D', 'Q_C_S', 'Q_C_D', 'Q_A_S', 'Q_A_D'];
export const SEGMENT_FORMULAS = ['Q_E_D', 'Q_U_D', 'Q_G_D'];

// ---------- 彙整 ----------

export const FACTOR_BY_ID = Object.fromEntries(FACTORS.map((x) => [x.id, x]));
export const LEVEL2_BY_ID = Object.fromEntries(LEVEL2.map((x) => [x.id, x]));
export const COEFFICIENT_BY_ID = Object.fromEntries(COEFFICIENTS.map((x) => [x.id, x]));

export const SYMBOLS = Object.fromEntries(
  [...FACTORS, ...LEVEL2, ...COEFFICIENTS, ...PRICES].map((s) => [s.id, s]),
);
export const SYMBOL_IDS = new Set(Object.keys(SYMBOLS));
/** 可被使用者輸入的數值：Level 1、Level 2 與係數。 */
export const VALUE_IDS = [...FACTORS, ...LEVEL2, ...COEFFICIENTS].map((s) => s.id);
/** 子層 → 父層索引。 */
export const CHILDREN_OF = (() => {
  const out = {};
  for (const s of LEVEL2) for (const p of s.parents) (out[p] ??= []).push(s.id);
  return out;
})();

export function unitOfSymbol(name) {
  return SYMBOLS[name]?.unit ?? FORMULA_META[name]?.unit ?? null;
}

export function labelOf(id) {
  return SYMBOLS[id]?.label ?? FORMULA_META[id]?.label ?? id;
}
