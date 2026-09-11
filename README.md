# AI 三市場供需模擬器

硬體（H）× 算力（C）× AI 服務（A）三市場的**比較靜態教學原型**。調整外生因素、影響係數與方程式，瀏覽器即時求出三市場均衡價格與數量，並在供需圖上比較基準與新情境。

> 示範數值為假設，係數尚未實證估計；投入產出數量一致性尚未施加。詳見網站「此版模型的解讀範圍」。

## 功能

- **因素面板**：第 03 頁因素的中文名稱、符號、單位、數值與來源標記；滑桿＋數字框；r、e、M、a 跨市場共用一份狀態。
- **係數面板**：截距 A、價格反應 b／d、因素係數 k，附單位與用途，可重設。
- **方程式編輯器**：受限數學運算解析器（不使用 eval），公式預覽、錯誤位置、單位檢查（一致／不一致／未驗證）。
- **求解**：三市場聯立（線性代數直接求解＋代回核對；非線性時 Newton 法）、單市場觀察（其他價格固定）。區分無解、無唯一解、病態、找不到解、不在適用範圍。
- **圖表**：三張供需圖，基準虛線、新情境實線、均衡點、價格／數量絕對與百分比變化、提示框、顯示範圍調整。
- **情境**：儲存為基準、重設、複製、JSON 匯出匯入、本機儲存自動恢復。

## SDD 文件

| 文件 | 內容 |
|---|---|
| [specs/001-three-market-simulator/spec.md](specs/001-three-market-simulator/spec.md) | 規格：範圍、功能需求、驗收條件（R01–R10） |
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
src/engine/                   運算引擎（純函式，瀏覽器與 Node 共用）
  parser.js  units.js  model.js  compile.js  solver.js  calibrate.js  analysis.js  scenario.js  session.js
src/ui/                       介面（app、panels、editor、charts、storage、format）
tests/                        node:test 單元與整合測試
specs/                        SDD 規格、設計、任務
docs/                         測試報告、部署說明
```

## 資料來源

- 需求與模型：Notion「03｜Main Factor 量化：簡化版」、「04｜由量化因素建立三市場供需曲線」、「05｜Codex 交接：三市場互動供需模擬器」。
- 參考數值：[1] FRED SOFR 2026/09/09：3.64%／年；[2] EIA 美國工業平均電價 2026/06：0.0917 美元／kWh。均非全球統一值；其他因素在來源頁為「待填」，網站中補入的是標明為假設的示範值。
