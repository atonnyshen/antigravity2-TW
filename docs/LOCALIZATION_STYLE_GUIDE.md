# Antigravity 繁體中文在地化文字規範與體例指南 (Localization Style Guide)

> **版本**：v3.7.0  
> **維護依據**：Antigravity 繁體中文翻譯規範、L0 中文輸出底線層、老編輯統一出版體例  
> **適用範圍**：所有靜態字典檔（`dicts_tw/*.json`、`dicts/*.json`）、核心執行期腳本（`src/preload_runtime.js`、`localization_engine.js`）及自動化守護程序

---

## 1. 核心架構與 SSOT 原則

本專案採用 **靜態字典精準匹配 + 動態正規表達式即時替換 + DOM MutationObserver 深度過濾** 三層縱深架構：

1. **唯一事實源 (SSOT)**：
   - `dicts_tw/*.json` 為台灣繁體中文基準字典。
   - `dicts/*.json` 為簡體中文基準字典。
   - 兩者必須維持 **100% 鍵值對齊**，任何鍵的增刪改必須兩側同步更新。
2. **驗證守門工具**：
   - 提交任何改動前，必須執行 `node scripts/compare_dicts.js`。該腳本嚴格禁止鍵值脫節、簡體字滲漏（`STRICT_SC_CHARS_REGEX`）以及非規範大陸黑話（`FORBIDDEN_TC_TERMS`）。
   - 必須執行 `npm test`，確保所有單元測試與迴歸驗證 100% 通過。

---

## 2. 出版級台灣繁體中文體例標準 (L0 底線)

所有繁體中文介面文字均須達到**出版級／商業上架級**文字要求，無條件遵循以下體例：

### 2.1 排版與標點符號規範
1. **中文標點符號全形化**：
   - 中文介面一律使用全形標點符號：逗號 `，`、句號 `。`、問號 `？`、驚嘆號 `！`、冒號 `：`、分號 `；`、括號 `（` `）`、頓號 `、`、破折號 `——`。
   - 引用對話、專有名詞、選單項目或指令時，一律使用繁體中文標準雙角引號 `「` 與 `」`（次層引號使用 `『` 與 `』`），嚴禁直譯使用英文半形雙引號 `"` 或簡體引號 `“”`。
2. **中英與中數空白隔離**：
   - 中文字與英文字母、中文字與阿拉伯數字之間，一律空半形空格。  
     *正確範例*：`Gemini 4 Argon 目前僅提供給 Pro 與 Ultra 付費訂閱者使用。`  
     *正確範例*：`已變更 3 個檔案。`  
     *錯誤範例*：`Gemini 4 Argon目前僅提供給Pro與Ultra付費訂閱者使用。`
3. **末尾標點一致性**：
   - 若英文原文末尾帶有句點 `.`，中文翻譯末尾必須加上全形句號 `。`。
   - 若英文原文為片語、按鈕或標籤且末尾無句點，中文翻譯末尾亦不得任意添加句號。
4. **全形標點後方禁空格 & 中文字元間禁空格**：
   - 全形中文標點（`。`、`，`、`！`、`？`、`：`）後方嚴禁添加半形空格（正確為 `……提供。自 2026……`，嚴禁 `……提供。 自 2026……`）。
   - 中文日期「日」與「起」之間皆為中文字元，嚴禁添加半形空格（正確為 `自 2026 年 11 月 30 日起`，嚴禁 `30 日 起`）。

### 2.2 拒絕被動語態 (去「被…」化)
- 中文習慣主動語態。嚴禁機械式直譯英文 Passive Voice（如 is truncated, was denied, are blocked）。
- **改寫原則**：補齊施事者，或改以正面狀態陳述。
  - ❌ `過長的大型自訂元件將被自動截斷。` ➔ ✔️ `系統將自動截斷過長的大型自訂元件。`
  - ❌ `在不安全或被注入內容上執行的風險也最高。` ➔ ✔️ `在不安全或遭惡意注入的內容上執行的風險也最高。`
  - ❌ `部分非圖片二進位內容已被截斷。` ➔ ✔️ `系統已截斷部分非圖片二進位內容。`
  - ❌ `麥克風已被阻止` ➔ ✔️ `麥克風已封鎖`

### 2.3 拒絕生硬翻譯腔與輕動詞包裝
- 嚴禁「進行……」、「完成對……的優化」、「實現……的提升」等空動詞包裝。
  - ❌ `手動下載除錯套件並進行分享` ➔ ✔️ `手動下載除錯套件並直接分享`
  - ❌ `持續執行，直到指定的目標完全完成` ➔ ✔️ `持續執行，直至達成指定目標`
  - ❌ `此提示詞較為直接，無需進行多方案對比` ➔ ✔️ `此提示詞直接明確，無須多方案比對`

---

## 3. 兩岸名詞標準對照與大陸黑話防護庫

本專案已在 `scripts/compare_dicts.js` 中固化違禁詞攔截清單。以下名詞在繁體中文（`dicts_tw/`）中必須嚴格遵守台灣標準用法：

| 英文術語 | 繁體中文標準 (台灣) | 簡體中文 (`dicts/`) | ❌ 嚴禁在繁中出現的大陸黑話 / 港式異體 |
| :--- | :--- | :--- | :--- |
| **Parallel / In parallel** | **平行**（平行處理、平行工作代理） | 并行 | ❌ 並行 |
| **Scheduled Task / Schedule** | **排程任務** / **依排程** | 定时任务 / 定时 | ❌ 定時任務 / 定時執行 |
| **Timer** | **計時器** | 定时器 | ❌ 定時器 |
| **Agent / Subagent** | **代理** / **子代理** | 智能体 / 子代理 | ❌ 智能體 / 子智能體 |
| **Code / Source code** | **程式碼** / **原始碼** | 代码 / 源代码 | ❌ 代碼 / 源代碼 / 代碼塊 |
| **Document** (文件檔) | **文件** / **說明文件** | 文档 | ❌ 文檔 |
| **File** (本機檔案) | **檔案** | 文件 | ❌ 文件（指 File 時） |
| **Directory / Folder** | **資料夾** / **目錄** | 目录 / 文件夹 | - |
| **Project** | **專案** | 项目 | ❌ 項目（指工程專案時） |
| **Item** (清單項目) | **項目** | 项目 / 项 | - |
| **Default** | **預設** | 默认 | ❌ 默認 |
| **Global** | **全域** | 全局 | ❌ 全局 |
| **Settings / Preferences** | **設定** / **偏好設定** | 设置 / 首选项 | ❌ 設置 / 配置（非版面配置時） |
| **Window** | **視窗** | 窗口 | ❌ 窗口 |
| **Plugin / Extension** | **外掛程式** / **擴充功能** | 插件 / 扩展 | ❌ 插件 |
| **Shortcut / Keybinding** | **快速鍵** / **按鍵綁定** | 快捷键 | ❌ 快捷鍵 |
| **Terminal / Console** | **終端機** / **主控台** | 终端 / 控制台 | ❌ 終端 / 控制台 |
| **Refresh** | **重新整理** | 刷新 | ❌ 刷新 |
| **User** | **使用者** | 用户 | ❌ 用戶（指一般使用者時） |
| **Client** | **用戶端** | 客户端 | ❌ 客戶端 |
| **Script** | **指令碼** | 脚本 | ❌ 腳本 |
| **Cache** | **快取** | 缓存 | ❌ 緩存 |
| **Component** | **元件** | 组件 | ❌ 組件 |
| **Field** | **欄位** | 字段 | ❌ 字段 |
| **Interface / API** | **介面** / **API** | 接口 / 界面 | ❌ 接口 |
| **Troubleshoot / Debug** | **疑難排解** / **除錯** | 排查 / 调试 | ❌ 排查 |
| **Align / Alignment** | **對齊**（版面對齊）/ **確認**（方案確認）| 对齐 | ❌ 對齊（用作商業黑話時） |
| **Publish / Post** | **發布**（發布訊息、發布概覽） | 发布 | ❌ 發佈 |
| **Swarm** | **蜂群**（介面文字：蜂群看板／成員／時間軸） | 蜂群 | ❌ Swarm（一般介面文字殘留未翻；Slash `/swarm` 仍保留） |
| **Variant Chars** | **啟用** / **啟動** / **為** | 启用 / 启动 / 为 | ❌ 啓用 / 啓動 / 爲（港式舊字形） |

---

## 4. Slash 指令與不翻譯詞彙白名單 (Protected Tokens)

### 4.1 Slash 指令保留原則
所有以 `/` 開頭之系統命令識別碼均直接由 Antigravity 核心解析器攔截，**一律嚴禁翻譯**：
- `/swarm`
- `/swarm-autonomous-pipeline`
- `/goal`
- `/boost`
- `/egm-boost`
- `/learn`
- `/schedule`
- `/clear`
- `/compact`
- `/help`
- `/init`

在 `src/preload_runtime.js` 中已設有安全屏障：
```javascript
if (/^\/[a-zA-Z0-9_.-]+$/.test(valNorm)) {
    unchangedTextValues.set(node, originalVal);
    return;
}
```
### 4.2 指令說明文字規範
Slash 指令名稱保持英文字串，但其輔助說明文字一律採用精煉出版級繁體中文：
- `/goal` ➔ 說明：`持續執行，直至達成指定目標`
- `/schedule` ➔ 說明：`依週期排程或一次性計時器執行指令`
- `/boost` ➔ 說明：`呼叫 Boost 多代理編排器以應對複雜任務`
- `/swarm` ➔ 說明：`啟動蜂群協作：多位代理在各自對話中平行處理同一任務`

### 4.3 系統專有名詞與代碼保留清單
- **品牌名**：`Antigravity`、`Google`、`Firebase`、`Gemini`、`Claude`、`Android`、`Chrome DevTools`、`Puppeteer`。
- **協定與路徑**：`plugin://*`、`vscode://*`、`~/.gemini/*`、檔案路徑指標。
- **程式語言與關鍵字**：`Python`、`JavaScript`、`TypeScript`、`Go`、`Dart`、`Flutter`、`JSON`、`Markdown`、`agent`、`parallel`、`pipeline`、`phase`。

---

## 5. 模型選單與動態訂閱方案規範 (Model Selector Specifications)

在模型選擇器與模型提示資訊中，Google Antigravity 具有多種方案組合與動態下架警告。必須保證動態函數 `formatPlanAudience`、正規規則 `DYNAMIC_RULES` 與靜態字典 `page_main.json` 完全一致。

### 5.1 英文語序與中文對稱對照表
中文嚴格對齊英文原本詞彙與先後順序，絕不倒裝或混淆「方案」與「訂閱者」：

| 英文原句特徵 | 英文範例片段 | 台灣繁體中文標準標準譯法 |
| :--- | :--- | :--- |
| **Pro First + Subscribers (No plan)** | `paid Pro and Ultra subscribers` | **Pro 與 Ultra 付費訂閱者** |
| **Pro First + Plan Subscribers** | `paid Pro and Ultra plan subscribers` | **Pro 與 Ultra 付費方案訂閱者** |
| **Ultra First + Plan Subscribers** | `Ultra and paid Pro plan subscribers` | **Ultra 與 Pro 付費方案訂閱者** |
| **Ultra First + Subscribers (No plan)**| `Ultra and paid Pro subscribers` | **Ultra 與 Pro 付費訂閱者** |
| **Pro First + Plans Only** | `paid Pro and Ultra plans` | **Pro 與 Ultra 付費方案** |
| **Ultra First + Plans Only** | `Ultra and paid Pro plans` | **Ultra 與 Pro 付費方案** |
| **Single Ultra Plan Subscribers** | `Ultra plan subscribers` | **Ultra 方案訂閱者** |
| **Single Ultra Subscribers** | `Ultra subscribers` | **Ultra 訂閱者** |
| **Single Pro Plan Subscribers** | `paid Pro plan subscribers` | **Pro 付費方案訂閱者** |
| **Single Pro Subscribers** | `paid Pro subscribers` | **Pro 付費訂閱者** |

### 5.2 完整提示句式標準範本
1. **可用性提示 (Currently Available)**：
   - `Gemini 4 Argon is currently available to Ultra and paid Pro plan subscribers.`  
     ➔ `Gemini 4 Argon 目前僅提供給 Ultra 與 Pro 付費方案訂閱者使用。`
   - `Gemini 4 Argon is currently available to paid Pro and Ultra subscribers.`  
     ➔ `Gemini 4 Argon 目前僅提供給 Pro 與 Ultra 付費訂閱者使用。`
2. **現已提供提示 (Now Available)**：
   - `Sonnet 5.5 is now available on paid Pro and Ultra plans.`  
     ➔ `Sonnet 5.5 現已在 Pro 與 Ultra 付費方案中提供。`
3. **下架日期警告 (Deprecation Warning)**：
   - `GPT-OSS will be removed from Antigravity on November 30, 2026.`  
     ➔ `GPT-OSS 將於 2026 年 11 月 30 日自 Antigravity 下架。`
   - `Third-party model access will no longer be available on your current plan starting on November 30, 2026.`  
     ➔ `自 2026 年 11 月 30 日起，您目前的方案將不再提供第三方模型存取權限。`

---

## 6. 品質驗證與發布工程清單 (Release Checklist)

任何版本發布或更新時，必須嚴格按照以下步驟閉環執行：

1. **靜態字典驗證**：
   ```bash
   node scripts/compare_dicts.js
   ```
   *必須輸出*：`All dictionaries are perfectly aligned!`，代碼返回值為 `0`。

2. **全量迴歸測試**：
   ```bash
   npm test
   ```
   *必須保證*：所有測試通過（46/46 passed，0 failed）。

3. **打包發布產物**：
   ```bash
   zip -r -q dist/antigravity2-TW-v3.7.0.zip . -x "*.git*" "node_modules/*" "dist/*.zip" "build_app/*" "scratch/*"
   ```

4. **Git 與 GitHub Release 同步**：
   ```bash
   git add -A
   git commit -m "..."
   git tag -fa v3.7.0 -m "Release v3.7.0"
   git push origin main
   git push origin v3.7.0 --force
   gh release upload v3.7.0 dist/antigravity2-TW-v3.7.0.zip --clobber
   ```

5. **本機應用程式即時重套**：
   ```bash
   node localization_engine.js --tw --no-kill --brand-title english
   ```
   驗證本機 `/Applications/Antigravity.app` 注入成功且正常運作。
