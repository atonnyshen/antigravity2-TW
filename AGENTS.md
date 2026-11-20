# Antigravity 繁體中文專案 AI 助手維護規範 (AGENTS.md)

本文件為 AI 助手（Antigravity、Claude Code、Cursor、Copilot 等）維護本專案時的唯一行為準則與標準操作程序（SOP）。

---

## 1. 使用者操作與安裝指引

當使用者要求安裝、更新繁中化、安全檢查、設定背景守護或還原官方英文時：
1. **嚴格遵循兩階段安裝流程**：直接讀取並遵循根目錄下的 [`AI_INSTALL_GUIDE.md`](./AI_INSTALL_GUIDE.md)。
2. **第一階段（唯讀檢查）**：先檢視作業系統、Node.js 版本（>= 22.12.0）、Antigravity 安裝路徑、寫入權限與執行狀態；向使用者呈現唯讀檢查摘要與 1–4 選項，**未獲使用者回覆前不得修改任何檔案**。
3. **安全防護**：若系統正在執行 Antigravity，呼叫 `localization_engine.js` 時**務必加上 `--no-kill`**，避免意外中斷使用者對話。
4. **一鍵還原整合**：執行還原官方英文時，腳本會自動連帶停止並卸載背景守護服務，再行還原 `app.asar`，確保一鍵乾淨復原，避免 5 分鐘內自動重新繁中化。

---

## 2. 字典維護與繁體中文體例規範

1. **體例指南**：任何詞彙變更、翻譯微調與新介面適配，均須遵循 [`docs/LOCALIZATION_STYLE_GUIDE.md`](./docs/LOCALIZATION_STYLE_GUIDE.md)。
2. **字典對齊校驗**：修改 `dicts/`（簡中基準）或 `dicts_tw/`（繁中）後，必須在終端機執行：
   ```bash
   node scripts/compare_dicts.js
   ```
   確保所有鍵值雙向 100% 對齊且格式合法。
3. **L0 繁體中文底線層**：
   - 嚴禁 AI 翻案腔（「不是 A 而是 B」、「並非」、「不在於」）。
   - 嚴禁空泛拔高、洞察路標、動詞名詞化與商業黑話。
   - 受保護 Token（Slash 指令、Thinking Effort、程式碼路徑、快捷鍵）一律維持原文不翻譯。
   - 全文使用標準全形標點符號與台灣常用語彙。

---

## 3. Markdown 排版與 GFM 格式防破版規範

為確保所有 Markdown 文件在 GitHub 網頁端（GitHub Flavored Markdown）正確渲染，避免排版破裂，必須嚴格遵守：
1. **粗體標記邊界規範（嚴禁粗體結尾緊貼全形標點）**：
   - **錯誤寫法**：`**粗體標題：**內文`（在 CommonMark/GFM 規範下，全形冒號緊貼 `**` 且後方接中文時，會導致右側標記判定失效，GitHub 頁面直接露出裸星號 `**`）。
   - **正確寫法**：`**粗體標題**：內文`（將全形標點置於粗體外部，確保 `**` 順利閉合）。
2. **結構與間距規範**：
   - 標題（`#`）、列表項目（`-` / `1.`）、區塊引用（`>`）、程式碼區塊（` ``` `）前後必須保留完整單行空行。
   - 列表內各項目層級縮排一律使用 2 個或 4 個半形空格，避免 Tab 與空格混用。
3. **排版自動檢查方式**：
   在提交任何 `.md` 檔案前，必須執行語法檢查以防破版：
   ```bash
   python3 -c "
   import glob, re
   for md in glob.glob('**/*.md', recursive=True):
       with open(md) as f:
           for i, line in enumerate(f, 1):
               if re.search(r'\*\*[^*]+[：:]\*\*[^\s]', line):
                   print(f'GFM Bold Error in {md}:{i}')
   "
   ```

---

## 4. 程式碼修改與測試驗證紀律

1. **隔離沙盒原則**：修復引擎或守護程式時，僅在系統暫存資料夾或隔離測試環境中執行驗證，嚴禁直接改動本機正式運行的 `/Applications/Antigravity.app` 或系統原生排程。
2. **語法與全套測試**：提交變更前必須執行完整回歸驗證，確保 100% 通過：
   ```bash
   node --check localization_engine.js
   node --check auto_localize_watcher.js
   npm test
   ```

---

## 5. 開源程式庫資產治理規範（Repository Governance Protocol）

為維護高水準的開源專案架構，防止私人環境配置、除錯產物與對話提示詞外洩，嚴格遵循以下邊界：

### A. 允許納入版本控制（GitHub 白名單）
- **核心原始碼**：`localization_engine.js`、`auto_localize_watcher.js`、`src/*.js`。
- **字典資料**：`dicts/*.json`、`dicts_tw/*.json`。
- **使用者捷徑與安裝器**：根目錄下的 8 個中文一鍵捷徑腳本（`.bat` / `.command`）與 4 個原生安裝腳本（`.sh` / `.ps1`）。
- **輔助與建置工具**：`scripts/` 下的原子替換、打包、校驗與診斷工具。
- **測試與 CI/CD**：`test/`、`tests/`、`.github/workflows/`。
- **公開文檔**：`README.md`、`README_TW.md`、`CHANGELOG.md`、`AI_INSTALL_GUIDE.md`、`AGENTS.md`、`docs/LOCALIZATION_STYLE_GUIDE.md`、`docs/RELEASING.md`。

### B. 嚴禁進入 Git 追蹤與 GitHub（黑名單）
- **AI Agent 提示詞與交接草稿**：包含紅隊驗收 Prompt、對話指引、任務指派稿等，**嚴禁以 Markdown 檔案形式提交上傳**。
- **私有路徑與機器設定**：任何包含開發者本機絕對路徑（如 `/Users/...`、`C:\...`）、私有代理伺服器（如 `127.0.0.1:18080` 等 proxy 配置）的設定檔（`.cursorrules`、`.clinerules` 等），一律列入 `.gitignore`，不得推送到公開倉庫。
- **執行期與解包暫存**：`build_app/`、`.watcher-state/`、`scratch/`、`dist/`、`autolocalize.log` 等執行期中間產物，嚴禁解除忽略。

---

## 6. 代理人對抗式自審與放行紀律（Adversarial Self-Audit Guardrail）

AI 助手在提出「通過（PASS）」或執行 Git 提交與發布前，**必須在思維中強制執行反向對抗自審**：
1. **反向懷疑**：預設自己的修改可能破壞現有功能、引發未考慮之跨平台邊界異常或文實不符。
2. **四大檢驗維度**：
   - **實體與變更邊界**：核對 `git status` 與 `git diff`，確認沒有夾帶未追蹤檔案或意外修改。
   - **承諾與實現一致性**：文檔承諾的機制（檢查間隔、原子交換、接續復原）必須有真實代碼對應。
   - **異常邊界與安全**：唯讀檔案系統、權限不足、落盤失敗（`fsync`）時必須安全 Fail-Closed，絕不可降級為盲目覆寫。
   - **文風與衛生**：文字乾淨俐落，無 AI 腔，無本機私有資訊洩漏，Markdown 粗體無 GFM 渲染破版。
3. **思維內化原則**：對抗式審查過程與反證推論**保留於對話回覆與思考鏈中**，供使用者查核；**嚴禁將審查記錄或自審 Prompt 作為專案檔案寫入磁碟並提交至 GitHub**。

---

## 7. 版本發布規範（Release Preflight Protocol）

正式發布純翻譯更新與版本迭代時，嚴格遵循 [`docs/RELEASING.md`](./docs/RELEASING.md)：
- Release Assets 唯一性：有且僅能上傳單一純翻譯包 `antigravity2-TW-translations-vX.Y.Z.zip`。
- 嚴禁上傳完整程式 ZIP 至 Assets；完整套件手動安裝由 GitHub 原生 Source code (zip) 提供。
- 必須先經 Draft Release、Preflight 檢查與 Markdown 渲染審核通過後，經人工審核始可發布。
