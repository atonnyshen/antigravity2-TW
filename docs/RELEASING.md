# Antigravity 繁體中文套件維護與發布指南 (Release Guide)

本文件規範 `antigravity2-TW` 專案的版本發布流程、純翻譯資料包建置標準及安全發布前檢查（Release Preflight）。所有維護者在建立新發布時均須遵循本規範。

---

## 一、發布架構核心原則

1. **純翻譯更新與完整套件隔離**：
   - 每次 Release 的 **Assets 有且僅能上傳單一純翻譯包**：`antigravity2-TW-translations-vX.Y.Z.zip`（僅包含 `dicts/`、`dicts_tw/` 及純資料 manifest）。
   - **嚴禁將完整程式或可執行檔上傳至 Release Assets**。完整程式手動安裝一律使用 GitHub 自動產生的 **Source code (zip)**（即 GitHub 原生 `zipball_url`）或由 Git 標籤取得。
   - 此架構可確保舊版守護程序不會因任意 ZIP 規則誤下載並執行可執行代碼，徹底落實「純翻譯自動更新，程式引擎手動安裝」的產品政策。
2. **原子性替換與異常復原**：
   - 背景守護進行 ASAR 替換時，一律採用平台原生原子交換（macOS `renamex_np`、Windows `ReplaceFileW`、Linux `renameat2`）。
   - 備份檔（`app.asar.bak`）必須通過原子寫入與落盤（`fsync`）校驗；若遭遇官方更新衝突或權限受阻，一律保留原檔並記錄復原副本，不得盲目覆寫。
3. **發布前草稿驗證（Preflight Guard）**：
   - 正式發布前，必須先建立 **Draft Release**，透過 GitHub Actions 手動觸發 `release-preflight.yml` 或本機 `scripts/check_release_assets.js` 完成自動化驗證。
   - 經人工審核確認後，方可將 Draft 標記為正式發布。

---

## 二、維護者標準發布流程

### 步驟 1：本機準備與全套回歸驗證
在發布前，確認工作樹乾淨且全套測試通過：
```bash
# 1. 字典對齊檢查
node scripts/compare_dicts.js

# 2. 語法檢查
node --check localization_engine.js
node --check auto_localize_watcher.js

# 3. 執行全套回歸測試（89 項測試）
npm test
```

### 步驟 2：打包純翻譯資料包
使用建置腳本產生純翻譯 ZIP（需指定明確相容之引擎版本）：
```bash
node scripts/build_translation_pack.js \
  --version X.Y.Z \
  --min-engine X.Y.Z \
  --max-engine X.Y.Z \
  --output dist/antigravity2-TW-translations-vX.Y.Z.zip
```

### 步驟 3：建立 Git 標籤與 Release 草稿 (Draft)
```bash
# 建立帶簽署或註釋的 Git 標籤
git tag -fa vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z

# 建立未公開草稿並上傳唯一純翻譯包
gh release create vX.Y.Z \
  --draft \
  --title "antigravity2-TW vX.Y.Z" \
  --notes-file dist/release_notes_vX.Y.Z.md \
  dist/antigravity2-TW-translations-vX.Y.Z.zip
```

### 步驟 4：執行發布前稽核 (Preflight Check)
透過 GitHub Actions 觸發 `Draft release preflight (never publishes)` 工作流程，或於本機執行稽核腳本：
```bash
gh api --paginate 'repos/atonnyshen/antigravity2-TW/releases?per_page=100' \
  --jq '.[] | select(.tag_name == "vX.Y.Z")' | \
  node scripts/check_release_assets.js vX.Y.Z \
    --file dist/antigravity2-TW-translations-vX.Y.Z.zip \
    --engine-version X.Y.Z
```

稽核器會強制拒絕以下異常：
- Release 非 Draft 狀態。
- 版本號與標籤不符。
- Assets 包含多個檔案或非純翻譯 ZIP。
- 缺少 GitHub SHA-256 digest 或本機雜湊不符。
- ZIP 內混入 JavaScript、二進位檔或目錄遍歷路徑（ZIP Slip）。
- 字典格式錯誤或宣告的引擎相容範圍不符。

### 步驟 5：人工審查與正式公開
確認 Preflight 全數通過、核對 GitHub 網頁端生成的 Source code (zip) 完整性與 Release Notes 後，執行發布：
```bash
gh release edit vX.Y.Z --draft=false
```
公開後，重新執行一次唯讀查詢以確保發布狀態與資產清單正確無誤。

---

## 三、停止發布硬閘門（Stop-the-Line Conditions）

若遇下列任一情況，必須立即終止發布：
1. 發現 Release Assets 包含多個檔案或任何可執行程式碼 ZIP。
2. GitHub SHA-256 digest 缺失或與打包產物雜湊不符。
3. 未能通過三平台（Ubuntu / macOS / Windows）GitHub Actions 回歸測試。
4. Git 標籤對應的 commit 與受測 commit 不一致。
5. 說明文件仍引導使用者手動下載純翻譯包作為完整安裝器。
6. Markdown 文件存在 GFM 語法解析破版（例如全形標點緊貼粗體標記導致 GitHub 網頁端裸露 `**` 星號）。
