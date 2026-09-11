# 部署與更新說明

## 1. 為何選 GitHub Pages

| 需求（spec R01／R06／R10） | GitHub Pages |
|---|---|
| 公開 HTTPS、陌生訪客免登入 | ✅ 公開儲存庫的 Pages 網址任何人可開啟 |
| 核心計算在瀏覽器執行、無後端 | ✅ 靜態檔案即可 |
| 個人情境互不影響 | ✅ 情境只存在各自瀏覽器的 localStorage |
| 版本與原始碼可追溯 | ✅ 網站內容即儲存庫的 commit |
| 費用 | 公開儲存庫免費 |

**不採用**：claude.ai Artifact 預設為私人分享，不符合「陌生訪客免登入」，不能當作正式交付。其他可行替代：Cloudflare Pages、Netlify（同樣部署靜態檔即可）。

## 2. 首次部署（GitHub CLI）

前置：已安裝 `git`、`gh` 並完成 `gh auth login`。

```bash
git init -b main
git add .
git commit -m "AI 三市場供需模擬器 v1.0.0"
gh repo create ai-three-market-simulator --public --source=. --push
gh api -X POST repos/{owner}/ai-three-market-simulator/pages -f "source[branch]=main" -f "source[path]=/"
```

儲存庫根目錄有 `.nojekyll`，避免 Jekyll 處理檔案。部署約 1–2 分鐘後網址為：

```
https://<帳號>.github.io/ai-three-market-simulator/
```

查詢部署狀態：

```bash
gh api repos/{owner}/ai-three-market-simulator/pages
```

## 3. 更新網站

1. 修改程式或模型，先更新 `specs/` 中對應的規格／設計／任務（SDD）。
2. 執行 `npm test`，全部通過。
3. 更新 `package.json` 版本與 `docs/test-report.md`。
4. commit 並推送：`git push`。GitHub Pages 會自動重新部署。
5. 依第 4 節重做部署驗證。

使用者本機儲存的情境不受網站更新影響；若 JSON 格式版本（`schema version`）改變，須在 `scenario.js` 提供轉換並更新測試。

## 4. 部署驗證清單

以**未登入的無痕視窗**開正式網址：

- [ ] 載入：三張圖與「有效均衡」狀態出現。
- [ ] 重新整理：先修改 r，重新整理後值仍保留。
- [ ] 調整利率：三個市場價格同時變動，狀態維持有效均衡。
- [ ] 修改公式：在 Q_H^D 加上 `+ 2e7` → 價格上升；輸入未知符號 → 顯示錯誤位置、圖表標示最後有效結果。
- [ ] 重設：回到基準值。
- [ ] JSON 匯出後匯入：顯示「重新求解的結果與檔案內結果一致」。
- [ ] 兩個獨立工作階段：一般視窗與無痕視窗（或兩個不同瀏覽器）各自修改 r，互不影響。
- [ ] 手機寬度：圖表與面板堆疊可讀、可操作。
