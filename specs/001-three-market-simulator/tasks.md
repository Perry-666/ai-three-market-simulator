# 任務（Tasks）：AI 三市場供需模擬器

對應：`spec.md`、`design.md`。每項任務標註需求與驗收條件；完成後勾選並記錄驗證方式。

## 階段 0：規格與設計
- [x] T00 撰寫 spec.md（R01–R10、AC-01–AC-12）
- [x] T01 撰寫 design.md（架構、演算法、JSON、部署）
- [x] T02 撰寫 tasks.md（本文件）

## 階段 1：運算引擎
- [x] T10 parser.js：詞法、Pratt 語法、白名單函數、位置錯誤 — FR-3.4/3.5，AC-03
- [x] T11 units.js：單位解析／格式化、AST 量綱檢查三態 — FR-3.6，AC-08
- [x] T12 model.js：第 03 頁因素表、第 04 頁係數（單位＋用途）、05 §4 預設式、預期移線方向、示範值與來源標記 — FR-1、FR-2、FR-8，AC-07/08
- [x] T13 compile.js：依賴圖、循環偵測、未知符號、除以零、非有限 — FR-3.5，AC-03
- [x] T14 calibrate.js：示範校準反推截距 — FR-8.2
- [x] T15 solver.js：線性判定、尺度化消去、秩判定、條件數、Newton、單市場、殘差、適用範圍 — FR-4，AC-04
- [x] T16 analysis.js：曲線取樣、局部移線方向 — FR-5.4、FR-7.2，AC-05/11
- [x] T17 scenario.js：輸入驗證、JSON 匯出匯入、比較與百分比 — FR-1.6、FR-6.4/6.5，AC-06/12
- [x] T18 session.js：編輯公式／數值、重設、儲存基準、保留最後有效結果 — FR-3.5、FR-6，AC-02/03

## 階段 2：測試（55 項全數通過，見 docs/test-report.md）
- [x] T20 tests/parser.test.js
- [x] T21 tests/units.test.js
- [x] T22 tests/compile.test.js
- [x] T23 tests/solver.test.js
- [x] T24 tests/model.test.js
- [x] T25 tests/scenario.test.js
- [x] T26 tests/session.test.js
- [x] T27 tests/charts-consistency.test.js

## 階段 3：介面
- [x] T30 index.html＋styles.css：版面、深淺色、響應式 — NFR-4/5，AC-09
- [x] T31 panels.js：因素面板 — FR-1
- [x] T32 panels.js：係數面板 — FR-2
- [x] T33 editor.js：方程式編輯器 — FR-3
- [x] T34 charts.js：三圖 — FR-5
- [x] T35 app.js：模式切換、單市場固定價、狀態列、結果表、限制說明 — FR-4.2、FR-4.6
- [x] T36 情境工具列與情境面板 — FR-6
- [x] T37 教學提示 — FR-7

## 階段 4：驗證與交付
- [x] T40 瀏覽器實測：桌面、手機尺寸、錯誤狀態、重新整理恢復、重設、單市場 — AC-02/03/06/09（紀錄於 test-report §2）
- [x] T41 docs/test-report.md — R10
- [x] T42 docs/deploy.md — R10
- [ ] T43 建立公開儲存庫、部署到 GitHub Pages（需使用者同意公開發佈） — R01、R10
- [ ] T44 部署驗證：無痕視窗清單、雙工作階段隔離 — AC-01/06

## 需求追溯矩陣

| 需求 | 任務 | 測試／驗證 | 狀態 |
|---|---|---|---|
| R01 公開網站 | T43, T44 | 部署驗證 | 待部署 |
| R02 因素與係數 | T12, T18, T31, T32 | T24, T26, B2, B5 | ✅ |
| R03 編輯方程式 | T10, T13, T18, T33 | T20, T22, T26, B3, B6 | ✅ |
| R04 求解 | T15 | T23, B7 | ✅ |
| R05 比較圖 | T16, T34 | T27, B1 | ✅ |
| R06 情境保存 | T17, T36 | T25, B4；雙工作階段待 T44 | 部分（待部署驗證） |
| R07 簡化模型 | T12 | T24 | ✅ |
| R08 資料與公式一致 | T11, T12, T14, T33 | T21, T23 | ✅ |
| R09 可用介面 | T30–T37 | B1, B8 | ✅ |
| R10 完整交付 | T41–T44 | 交付清單 | 待部署 URL |
