# 設計（Design）：AI 三市場供需模擬器

- 對應規格：`spec.md`（001-three-market-simulator）
- 狀態：已核定，進入實作

---

## 1. 架構總覽

純前端靜態網站，無後端、無建置步驟、無外部執行期依賴。

```
index.html ─┬─ src/ui/app.js         狀態管理、事件、渲染協調
            ├─ src/ui/panels.js      因素／係數／情境面板
            ├─ src/ui/editor.js      方程式編輯器與公式預覽
            ├─ src/ui/charts.js      SVG 供需圖（自製，不依賴圖表庫）
            ├─ src/ui/format.js      數字與單位格式化
            └─ src/ui/storage.js     localStorage 包裝（try/catch）

src/engine/  （純函式，瀏覽器與 Node 共用，可單元測試）
  parser.js    受限數學運算解析器 → AST（含字元位置）
  units.js     單位代數與 AST 量綱檢查
  model.js     第 03／04／05 頁的符號表、預設公式、預期移線方向、示範數值
  compile.js   公式編譯：依賴圖、拓撲排序、循環偵測、未知符號、閉包求值
  solver.js    線性判定、尺度化高斯消去、秩判定、Newton 法、單市場求解、適用範圍檢查
  calibrate.js 示範校準：反推截距使各式通過基準點
  scenario.js  情境結構、驗證、JSON 匯出匯入、比較與百分比變化
  analysis.js  局部移線方向（數值差分）、曲線取樣
  session.js   與 UI 無關的工作階段狀態轉換（編輯公式、重設、儲存基準），保留最後有效結果

tests/        node:test 單元測試（`npm test`）
```

**為何不需要後端**：規格 R01–R10 全部可在瀏覽器完成（計算、儲存、匯出匯入）；個人情境依規格使用本機儲存。新增後端不解決任何已列需求，故不採用。

---

## 2. 資料模型

### 2.1 符號（Symbol）

```js
{
  id: 'r',                    // 引擎識別名
  kind: 'factor' | 'coefficient' | 'price',
  label: '利率',               // 中文名稱
  unit: 'pct/yr',             // 單位表達式（見 §4）
  market: ['H','C','A'],      // 使用此符號的市場（共用因素多個）
  value: 3.64,
  source: 'observed' | 'assumption' | 'calibrated' | 'user',
  pending: false,             // 第 03 頁是否為「待填」
  ref: 'FRED：SOFR，2026/09/09',
  domain: { min: null, max: null, exclusiveMin: false }, // 驗證
  slider: { min: -2, max: 15 },
  expect: { H_S: 'left', H_D: 'left', C_S: 'left', C_D: 'left', A_S: 'left', A_D: 'left' },
  absorbedBy: null,           // 例如 y：{ coef: 'k_Hy', note: '已由成本 c 反映' }
  purpose: '…'                // 係數用途說明
}
```

### 2.2 公式（Formula）

```js
{ id: 'Q_H_S', expr: 'A_H_S + b_H*P_H - …', unit: 'PFLOPS/yr',
  role: 'supply' | 'demand' | 'aux', market: 'H' | 'C' | 'A' | null, label: '硬體供給' }
```

必要公式：`Q_H_S Q_H_D Q_C_S Q_C_D Q_A_S Q_A_D`；輔助：`c_elec Q_E_D Q_U_D Q_G_D`。

### 2.3 情境（Scenario）

```js
{ name, formulas: Formula[], values: { [symbolId]: { value, source } } }
```

中文名稱、單位、說明等不隨情境變動的中繼資料放在 `model.js`；JSON 匯出時一併寫出單位與標籤以利閱讀與核對。

### 2.4 工作階段（Session）

```js
{
  current: Scenario, baseline: Scenario,
  solver: { mode: 'joint' | 'single', market: 'H', fixed: { P_H, P_C, P_A }, fixedFrom: 'baseline' | 'user',
            tolLinear: 1e-9, tolNonlinear: 1e-8, maxIter: 100 },
  saved: [{ name, scenario, savedAt }],
  view: { H: { pMax: null, qMax: null, nonNegative: true }, … }
}
```

---

## 3. 解析器（parser.js）

- 詞法：數字（含科學記號）、識別字 `[A-Za-z_][A-Za-z0-9_]*`、運算子 `+ - * / ^ ( ) ,`。其他字元 → `SyntaxError(pos)`。
- 語法（Pratt）：優先序 `+ -` < `* /` < 一元 `+ -` < `^`（右結合）。
- AST 節點：`num`、`sym`、`unary`、`binary`、`call`，皆帶 `start`／`end`。
- 函數白名單：`abs sqrt exp ln log min max pow`（min／max 可變參數 ≥ 2，其餘固定）；其他名稱 → `未知函數`。
- 求值不經 `eval`／`Function`；閉包直接呼叫 `Math.*`。
- 錯誤類別 `FormulaError { code, message, formulaId, start, end }`；`code ∈ syntax | unknown_symbol | unknown_function | arity | cycle | div_zero | non_finite | domain`。

## 4. 單位（units.js）

- 基本量綱：`USD PFLOPS h yr month set kWh MW pct Mtok Mdtok task project personyr run`；`ratio` 表無因次。
- 單位表達式如 `USD/(PFLOPS*h)`，解析為指數表 `{USD:1, PFLOPS:-1, h:-1}`。
- 顯示：`USD→美元 yr→年 set→套 pct→% Mtok→百萬 token Mdtok→百萬資料 token personyr→人年 run→次訓練 task→任務 project→專案`；`PFLOPS*h` 顯示為 `PFLOP-hour`。
- 係數單位：`式數量單位 ÷ 所乘項單位`，在 `model.js` 明確宣告（不由公式反推，避免檢查變成恆真）。
- AST 量綱檢查規則：
  - `sym` → 宣告單位；`num` → 無因次，但若與有因次量相加減 → 狀態「未驗證：常數項無單位」。
  - `+ -` 兩側須相同，否則「不一致」並回報兩側單位與位置。
  - `* /` 指數相加減；`^` 指數須為數字常數，底數指數乘上該值；指數非常數且底數有因次 → 未驗證。
  - `sqrt` 指數減半；`exp ln log` 參數須無因次；`abs min max` 參數須同單位；`pow` 同 `^`。
  - 結果須等於公式宣告單位。
- 預設式與使用者修改式使用同一檢查器；任何未涵蓋情形回傳「未驗證」而非「一致」。

## 5. 編譯（compile.js）

1. 解析所有公式 → AST；收集每式引用符號。
2. 允許的符號＝model 宣告的因素、係數、價格＋公式定義的符號。其餘 → `unknown_symbol`（附位置）。
3. 公式之間建立依賴圖，DFS 拓撲排序；有環 → `cycle`，訊息列出環路（如 `Q_A_D → Q_E_D → Q_A_D`）並指向首次引用位置。
4. 輸出 `evaluate(prices, values) → { c_elec, Q_H_S, …, Q_A_D }`。求值中：除數為 0 → `div_zero`（附位置）；任何節點非有限 → `non_finite`（附位置）；`sqrt`／`ln` 定義域錯誤 → `domain`。

## 6. 求解（solver.js）

### 6.1 聯立模式

令 `Z(P) = [Q_H_S−Q_H_D, Q_C_S−Q_C_D, Q_A_S−Q_A_D]`，`P = [P_H, P_C, P_A]`。

1. **尺度**：價格尺度 `s_i = max(|基準價格_i|, 1e-12)`（無基準時用 1）。
2. **線性判定**：`Z0 = Z(0)`；`J_i = (Z(s_i e_i) − Z0)/s_i`；在兩個測試點 `p = s ⊙ [1.7,0.6,1.3]`、`s ⊙ [0.4,2.1,0.9]` 驗證 `|Z(p) − (Z0 + Jp)| ≤ 1e-9·max(|Z(p)|, |Z0|, |Jp|, 1)`（逐分量）。若求值拋錯（如 `/P_H` 在 0 除零）→ 視為非線性。
3. **線性求解**：解 `J P = −Z0`。
   - 欄尺度 `x = P/s`、列尺度以列最大絕對值正規化，得矩陣 `Ã`。
   - 完全樞紐高斯消去求秩（容許值 `1e-12·‖Ã‖∞`）。秩＝3 → 解；秩 < 3 時比較擴增矩陣秩：大於 → `no_solution`（無解），相等 → `non_unique`（無唯一解）。
   - 條件數估計 `κ = ‖Ã‖₁‖Ã⁻¹‖₁`；`κ > 1e10` → `ill_conditioned`（仍回報數值但不標有效）。
4. **非線性求解**：Newton 法，數值 Jacobian（相對步長 1e-6），回溯線搜尋；初值依序嘗試基準均衡、目前線性化解、尺度向量；`maxIter` 內未收斂 → `not_found`。
5. **代回核對**：以求得價格重算所有式，逐市場相對殘差 `|S−D|/max(|S|,|D|, tiny)` ≤ 容許值；否則 `residual_fail`。
6. **適用範圍**：價格 `P_i < 0`、`Q_i < 0`（取供給量）、分群需求 `Q_E_D、Q_U_D、Q_G_D < 0` → `out_of_range`，列出違反項目。
7. **狀態**：`valid | out_of_range | no_solution | non_unique | ill_conditioned | not_found | residual_fail | formula_error | input_error`。只有 `valid` 顯示為有效均衡。

### 6.2 單市場模式

其他兩價固定；對一維 `z(P_i)`：同樣做線性判定（`z(0)`、`z(s)`、驗證點），線性且斜率非零 → 直接求根；斜率為零 → 無解／無唯一解；非線性 → Newton＋二分法保護（先向外搜尋變號區間）。

## 7. 示範校準（calibrate.js）

1. 基準點（假設）：`P_H*=9000 美元/PFLOPS, Q_H*=2.0e8 PFLOPS/年; P_C*=0.40 美元/PFLOP-hour, Q_C*=4.0e12 PFLOP-hour/年; P_A*=2.0 美元/百萬 token, Q_A*=1.0e11 百萬 token/年`；分群占比 `share_E=55, share_U=30, share_G=15`（%）。
2. 對每條含截距的式子，令截距為 0 求值（價格代入基準點），`A = 目標數量 − f|_{A=0}`。AI 分群目標 `Q_j* = share_j/100 × Q_A*`（此處 ÷100 為百分數轉占比，僅用於校準、明示於程式註解）。
3. 截距 source 標為 `calibrated`。求解器不讀基準點，測試驗證其找回。

示範係數以基準點彈性設定（`k = 彈性 × Q*/X*`，取 4 位有效數字）；`k_Ca`、`k_CF` 依第 04 頁說明分別取「年度百萬 token 工作量」與「年度訓練次數」的假設值。

## 8. 圖表（charts.js）

- 每市場一個 SVG（viewBox 自適應寬度）。價格範圍預設 `[0, 2×max(P*_base, P*_new)]`，數量範圍由曲線取樣在範圍內的最大值決定；可手動設上限、切換「只顯示非負區域」。
- 取樣 160 個價格點，計算 `Q_S(P)`、`Q_D(P)`，繪 `(Q,P)` 折線；clipPath 裁切到繪圖區（僅視覺裁切，不改資料）。
- 新情境曲線：新情境公式、數值，其他兩價＝新情境均衡價（單市場模式＝固定價）。基準曲線：基準公式、數值、基準均衡價。
- 均衡點：有效 → 實心點＋虛線引導；不適用 → 空心點並標「不適用」。
- 提示：指標在繪圖區移動時以 y 反推 P，顯示 P、Q_S、Q_D（新／基準）。鍵盤：圖表可聚焦，上下鍵移動提示價格。
- 顏色：供給藍、需求橘；基準同色淡化虛線；支援深色模式。

## 9. 介面佈局

- 頁首：標題、模式切換（聯立／單市場）、情境工具列（儲存為基準、重設、還原預設、複製、匯出、匯入）。
- 狀態列（`aria-live`）：求解狀態、殘差、單位檢查摘要、「投入產出數量一致性尚未施加」說明。
- 主區：
  - 寬螢幕（≥1200px）：左側面板 400px（分頁：因素／係數／情境），右側三圖並排＋結果表＋方程式編輯器（折疊）。
  - 窄螢幕：單欄堆疊：狀態 → 圖表 → 結果 → 面板 → 編輯器。
- 教學提示：因素列展開顯示「第 03 頁預期」與「引擎局部移線」。

## 10. JSON 格式

```json
{
  "schema": "ai-three-market-simulator/session",
  "version": 1,
  "exportedAt": "2026-09-11T00:00:00.000Z",
  "solver": { "mode": "joint", "market": "H", "fixed": {"P_H": 9000, "P_C": 0.4, "P_A": 2}, "fixedFrom": "baseline",
              "tolLinear": 1e-9, "tolNonlinear": 1e-8, "maxIter": 100 },
  "current":  { "name": "…", "formulas": [{"id":"Q_H_S","expr":"…","unit":"PFLOPS/yr"}],
                "values": { "r": {"value": 3.64, "source": "observed", "unit": "pct/yr", "label": "利率"} } },
  "baseline": { "…": "同上" },
  "results":  { "current": {"status":"valid","P":{…},"Q":{…}}, "baseline": {…} }
}
```

匯入驗證：schema／version 相符；所有必要公式存在；所有模型符號有有限數值（null、字串「待填」→ 報錯，不補 0）；source 屬於允許集合。匯入後重新求解並與 `results` 比對（相對差 ≤ 1e-6），不一致時提示。

## 11. 部署

- 靜態主機：GitHub Pages（公開 HTTPS、免登入瀏覽）。替代：Cloudflare Pages、Netlify。
- claude.ai Artifact 預設為私人分享，不符合 R01「陌生訪客免登入」，不作為正式交付。
- 驗證：無痕視窗開正式網址，測試載入、重新整理、調整利率、修改公式、重設、JSON 匯出匯入；兩個獨立工作階段互不干擾。

## 12. 測試策略

| 層級 | 工具 | 涵蓋 |
|---|---|---|
| 單元 | `node --test` | parser、units、compile、solver、calibrate、scenario、analysis、session |
| 整合 | `node --test` | 示範情境端到端：校準 → 求解 → 曲線交點 → JSON 往返 |
| 介面 | 瀏覽器實測 | 桌面／手機版面、鍵盤操作、錯誤狀態、本機儲存恢復 |
| 部署 | 無痕視窗 | §11 驗證清單 |
