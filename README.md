# AI 三市場供需模擬器

硬體（H）× 算力（C）× AI 服務（A）三市場的均衡模型介面（**模型版本 2026-10-05**）。調整外生因素、父層換算、係數與方程式，瀏覽器即時求出三市場均衡，核心產出為**年度均衡算力 Q_C＊（PFLOP-hour／年）**，並提供單因素敏感度排名。

> 2027 單期研究情境。除少數公開參照值（利率、電價、PUE）外，因素區間與係數都是研究者設定的假設，尚未由公司或市場資料估計；敏感度分數不是因果效果或機率。詳見網站「模型範圍與解讀方式」。

## 功能

- **兩層因素**：41 個 Level 1（直接進入供需式，依四個 Player × 五大項分組）與 61 個 Level 2（先更新父層再求均衡）；每項附符號、單位、資料可得性、來源性質與研究區間。
- **兩種輸入方式**：直接設定 Level 1，或由 Level 2 換算（22 條父層決定式＋6 個中間量，含台積電 CapEx → 產能 → 合格產出 → N 的傳導鏈）；換算模式鎖定直接輸入並顯示結果。
- **係數面板**：價格斜率、跨市場係數（k_AC＝b_A、k_HC＝d_H·m、k_CH＝d_H·h_new）、各式非價格項係數，標示「推導」或「設定」。
- **方程式編輯器**：供需式與父層換算式皆可編輯；受限數學解析器（不使用 eval），預覽與引擎共用同一語法樹，錯誤指出位置。
- **求解**：三市場聯立（線性直接求解＋代回核對；非線性 Newton）、單市場觀察；區分無解、無唯一解、病態、找不到解、不適用。
- **圖表**：三張供需圖，基準虛線、新情境實線、均衡點與絕對／百分比變化。
- **單因素敏感度**：205 次求解（1＋2×102），Level 1／Level 2 分開排名、龍捲風圖、21 點區間掃描與非單調提示、CSV 匯出。
- **情境**：儲存為基準、重設、複製、JSON／CSV 匯出匯入、本機儲存自動恢復。

## SDD 文件

| 文件 | 內容 |
|---|---|
| [specs/001-three-market-simulator/spec.md](specs/001-three-market-simulator/spec.md) | 規格：模型、功能需求、驗收條件（R01–R19） |
| [specs/001-three-market-simulator/design.md](specs/001-three-market-simulator/design.md) | 設計：架構、演算法、JSON 格式、部署 |
| [specs/001-three-market-simulator/tasks.md](specs/001-three-market-simulator/tasks.md) | 任務與需求追溯矩陣 |
| [docs/test-report.md](docs/test-report.md) | 測試結果與瀏覽器驗證紀錄 |
| [docs/deploy.md](docs/deploy.md) | 部署與更新說明 |

## 本機執行

純靜態網站，無建置步驟、無執行期依賴。ES modules 需透過 HTTP 伺服器開啟：

```bash
npm start
```

開啟 http://localhost:8123 。

## 測試

需要 Node.js 20 以上：

```bash
npm test
```

## 專案結構

```
index.html, styles.css        頁面與樣式
src/engine/                   運算核心（純函式，瀏覽器與 Node 共用）
  parser.js  units.js  model.js  compile.js  solver.js  sensitivity.js  analysis.js  scenario.js  session.js
src/ui/                       介面（app、panels、sensitivity-ui、editor、charts、storage、format）
tests/                        node:test 單元與整合測試
specs/                        SDD 規格、設計、任務
docs/                         測試報告、部署說明
```

## 資料來源

- 需求與模型：Notion「01｜研究架構」「02｜因素窮舉與 Factor Matrix」「03｜因素量化：區間、符號與層級連結」「04｜三市場供需模型與係數設定」「05｜均衡解與單因素敏感度分析」「06｜互動網站規格與 SDD 實作」「Appendix｜計算定義與模型檢核」。
- 因素區間、父層換算與敏感度對照：Google 試算表「均衡算力研究｜四個 Player 變數盤點與三項排名」（因子總表、Level2換算、敏感度計算、模型方程與版本）。
- 公開參照值：FRED SOFR（利率量級）、EIA 美國工業電價、Google 資料中心 PUE、Microsoft 年報設備年限、BLS 職類薪資。區間多為研究者估計，非統計信賴區間。
