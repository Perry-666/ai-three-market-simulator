# 設計（Design）：AI 三市場供需模擬器

- 對應規格：`spec.md`（模型版本 2026-10-05）
- 狀態：已實作，運算核心與介面皆通過測試

---

## 1. 架構

純前端靜態網站，無後端、無建置步驟、無外部執行期依賴。

```
index.html / styles.css
src/engine/            運算核心（純函式，瀏覽器與 Node 共用）
  parser.js            受限數學解析器（含 step()）、AST 編譯、公式預覽
  units.js             單位代數與量綱檢查（宣告單位者）
  model.js             41 個 Level 1、61 個 Level 2、22 條父層換算＋6 個中間量、
                       ~80 個具名係數、六條供需式、2027 基準均衡
  compile.js           依賴圖、循環偵測、未知符號、拓撲排序、求值
  solver.js            線性判定 → 尺度化完全樞紐消去（秩、條件數）；非線性 Newton；單市場一維求根
  sensitivity.js       單因素端點敏感度、排名、區間掃描
  analysis.js          曲線取樣、局部移線方向
  scenario.js          情境結構、輸入模式、區間、驗證、JSON v2
  session.js           狀態轉換、編譯快取、計算協調
src/ui/                app / panels / sensitivity-ui / charts / editor / storage / format
tests/                 node:test（72 項）
```

**為何不需要後端**：Notion 06 列出的需求（計算、保存、匯出匯入、敏感度）都能在瀏覽器完成；敏感度 205 次求解約 120 ms。新增後端不解決任何已列需求。

---

## 2. 兩層因素與輸入模式

```js
scenario = {
  values: { [id]: { value, source } },        // Level 1、Level 2、係數
  ranges: { [id]: { low, high } },            // 敏感度端點
  modes:  { [parentId]: 'direct' | 'derived' },
  formulas: [{ id, expr }],                   // 18 條市場式（含非價格項與分群）
  derivations: [{ id, target, expr }],        // 22 條父層換算＋6 個中間量
}
```

- `activeFormulas(scenario)` 回傳：中間量 ＋ 換算模式父層的決定式 ＋ 全部市場式。
- 編譯時 `knownSymbols = 全部符號 − 換算模式父層`，因此同一個符號不會同時是輸入與公式輸出；若使用者把直接輸入的父層又寫成公式，compile 會回報 `redefine`。
- 編輯 Level 2 時自動把其父層切換為 `derived` 並提示，避免「改了子項卻沒反應」。
- 換算出的父層值**不截回**父層區間（R14）。

**依賴順序**由拓撲排序決定，不手寫順序：c、h → epsilon；J_F、C_F、G_F → N；w、n_RD → C_M。

---

## 3. 求解

與上一版相同的求解器即可處理新模型：`Q_C^D` 中的 `a·Q_A^D` 對 P_A 仍是線性，因此預設模型對三個價格是線性的。

1. **線性判定**：以基準價格為尺度，取 `Z(0)`、`Z(s·e_j)` 建 Jacobian，再於兩個測試點驗證線性。
2. **線性求解**：列尺度化＋完全樞紐消去；秩不足時區分無解／無唯一解；1-範數條件數 > 10¹⁰ 標為病態。
3. **非線性**：Newton＋回溯線搜尋，收斂同時以目前量級與起點量級檢查殘差。
4. **代回核對**：各市場相對殘差 ≤ 10⁻⁸（Appendix §3）。
5. **適用範圍**：價格、市場數量、分群需求任一為負 → `out_of_range`，列出違反項目，不截斷。
6. 交叉驗證：測試以 Appendix §2 的閉式解比對三元聯立解。

---

## 4. 敏感度（sensitivity.js）

```
Q₀ ← 基準快照求解
for 每個因素 i（41 + 61）:
    下限：複製基準 → 設 x_i = low →（Level 2 時父層改 derived）→ 求均衡 → Q_i,下
    上限：同上
    δ = 100×(Q − Q₀)/Q₀，S_i = max(|δ下|,|δ上|)
Level 1 與 Level 2 分開排序（未四捨五入、容差 10⁻¹² 並列）
```
- 每個因素都從同一基準出發，不累積前一次變動；係數、截距與換算式在同一輪固定。
- 端點求解失敗、缺區間或 Q₀＝0 → 該列標不適用，不補零、不排名。
- `scanRange()` 以 21 個等距點檢查區間內有效性與非單調性，提示「上下限結果不代表整段區間最大偏離」。
- **效能**：`compileScenario()` 以「公式集合＋換算模式」為鍵快取編譯結果，205 次求解只需少量解析（Node 約 170 ms、瀏覽器約 120 ms）。

---

## 5. 介面

- 左側面板分頁：**因素**（Level 1，依 Player × 五大項）、**子變數**（Level 2，依父層）、**係數**、**情境**。
- 每列：符號、名稱、單位、資料可得性、來源徽章、滑桿＋數字框、研究區間（下限／上限）、輸入方式、傳導與影響條件。
- 右側：三張供需圖 → 結果表（含推論／其他算力拆分與換算後的 Level 1）→ **敏感度**（龍捲風圖＋排名表＋區間掃描）→ 方程式編輯器 → 模型範圍說明。
- 敏感度結果在任何輸入或公式變更後自動失效，並提示重新計算（避免顯示過期排名）。

---

## 6. JSON v2

```json
{
  "schema": "ai-three-market-simulator/session",
  "version": 2,
  "modelVersion": "2026-10-05",
  "method": "oat_baseline_pct_max_abs",
  "solver": { "mode": "joint", "relTol": 1e-8, "absTol": 1e-6, "maxIter": 100 },
  "current":  { "formulas": [...], "derivations": [...], "modes": {...},
                "values": { "r": { "value": 4, "source": "observed", "unit": "%／年" } },
                "ranges": { "r": { "low": 2, "high": 6 } } },
  "baseline": { "…": "同上" },
  "results": { "current": { "status": "valid", "P": {...}, "Q": {...}, "segments": {...}, "derivedLevel1": {...} } },
  "sensitivity": { "method": "...", "Q0": 8000000000, "level1": [...], "level2": [...] }
}
```
匯入時版本不符會明確拒絕（舊版 v1 模型不相容，需重建情境）；缺值、無效來源或下限大於上限皆報錯，不自動補 0。

---

## 7. 部署

GitHub Pages（公開 HTTPS、免登入）。更新流程與驗證清單見 `../../docs/deploy.md`。
