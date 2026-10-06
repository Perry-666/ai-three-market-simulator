# 任務（Tasks）：AI 三市場供需模擬器

模型版本 2026-10-05。對應 `spec.md`、`design.md`；測試結果見 `../../docs/test-report.md`。

## 階段 A：依修訂後的來源重建模型（2026-10-06）
- [x] A01 讀取 Notion 03／04／05／06／Appendix 與試算表四個分頁，確認 2026-10-05 修訂內容
- [x] A02 model.js 改寫：41 個 Level 1、61 個 Level 2、22 條父層換算＋6 個中間量、具名係數、六條供需式、2027 基準均衡
- [x] A03 parser.js 新增 `step()`（投資量產時間判斷）
- [x] A04 scenario.js：輸入模式（direct／derived）、研究區間、JSON v2、驗證規則
- [x] A05 session.js：編譯快取、換算模式下的符號解析、狀態轉換
- [x] A06 sensitivity.js：端點敏感度、分開排名、區間掃描
- [x] A07 移除舊版示範校準（calibrate.js）：新模型截距由 Notion 04 直接給定

## 階段 B：測試（72 項全數通過）
- [x] B01 model.test.js：R11 基準、R12 結構與跨市場係數推導、R07、R02、單調性、傳導方向
- [x] B02 derivations.test.js：22 條換算重現父層基準、R14 不截回區間、R19 台積電投資時點、多父層更新
- [x] B03 sensitivity.test.js：R13 分數、並列名次、R15 評分與例外、區間掃描
- [x] B04 solver.test.js：閉式解交叉驗證、奇異／病態、負值不適用、非線性、單市場
- [x] B05 scenario.test.js：R16 JSON 往返、缺值與舊版本拒絕、區間檢查、輸入驗證
- [x] B06 session.test.js：公式與換算式編輯、錯誤保留最後有效結果、模式切換
- [x] B07 parser／units／compile／charts-consistency 更新至新模型

## 階段 C：介面
- [x] C01 因素面板：Player × 五大項、來源與資料可得性、研究區間、輸入方式切換
- [x] C02 子變數面板：依父層分組，編輯時自動切換換算模式並提示
- [x] C03 係數面板：推導／設定標示、單位與用途
- [x] C04 敏感度分頁：龍捲風圖、排名表、旁註、21 點區間掃描、CSV 匯出
- [x] C05 方程式編輯器：市場式與父層換算式分區，錯誤位置與預覽
- [x] C06 結果表：推論／其他算力拆分、換算後的 Level 1、浮點雜訊歸零
- [x] C07 模型範圍說明改寫；敏感度結果在輸入變更後自動失效

## 階段 D：交付
- [x] D01 spec／design／tasks 改版
- [x] D02 README 與測試報告更新
- [x] D03 commit 與部署到既有公開網址
- [ ] D04 部署驗證（無痕視窗：載入、調整因素、敏感度、JSON 往返、兩個獨立工作階段）

## 後續工作（Notion 06 §2.1、§9，本版未實作）
- [ ] E01 R17：Level 2 → 父層 → 供需線 → 均衡差額的傳導視覺化
- [ ] E02 R18：年度情境路徑（逐年求解、折線比較、跨期規則）
- [ ] E03 R20：台積電生產資料 CSV 匯入、欄位對應預覽與校準介面

## 需求追溯

| 需求 | 實作 | 驗證 |
|---|---|---|
| R01 公開網站 | GitHub Pages | D04 |
| R02 因素與係數 | panels.js、session.js | model.test、session.test |
| R03 編輯方程式 | editor.js、compile.js | session.test |
| R04 求解 | solver.js | solver.test |
| R05 均衡圖 | charts.js | charts-consistency.test |
| R06 情境保存 | scenario.js、storage.js | scenario.test、D04 |
| R07 簡化模型 | model.js | model.test |
| R08 資料與公式一致 | model.js、units.js | model.test、units.test |
| R09 可用介面 | index.html、styles.css | 瀏覽器驗證 |
| R10 完整交付 | specs／docs | 交付清單 |
| R11 基準一致 | model.js | model.test |
| R12 模型完整 | model.js | model.test |
| R13 敏感度一致 | sensitivity.js | sensitivity.test |
| R14 父層連接與固定規則 | scenario.js、session.js | derivations.test |
| R15 評分與例外 | sensitivity.js | sensitivity.test |
| R16 可重現 | scenario.js | scenario.test、solver.test |
| R19 台積電生產連結 | model.js（DERIVATIONS） | derivations.test |
| R17／R18／R20 | 後續工作 | — |
