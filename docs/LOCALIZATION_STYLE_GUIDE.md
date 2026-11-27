# Antigravity 繁體中文在地化文字規範與體例指南 (Localization Style Guide)

> **版本**：v3.8.2（適配 Antigravity v2.35.2；純翻譯包 `schemaVersion: 2`）  
> **維護依據**：Antigravity 繁體中文翻譯規範、L0 中文輸出底線層、老編輯統一出版體例、Jserv《[資訊科技詞彙翻譯](https://hackmd.io/@sysprog/it-vocabulary)》（僅採 Domain Profile 資工分艙與四項跨領域方法論，不擴散至非科技文本）、台灣軟體在地化業界行規（Apple / Google / Microsoft / VS Code zh-TW）  
> **適用範圍**：所有靜態字典檔（`dicts_tw/*.json`、`dicts/*.json`）、核心執行期腳本（`src/preload_runtime.js`、`localization_engine.js`）及自動化守護程序

---

## 1. 核心架構與 SSOT 原則

本專案採用 **靜態字典精準匹配 + 動態正規表達式即時替換 + DOM MutationObserver 深度過濾** 三層縱深架構：

1. **唯一事實源 (SSOT)**：
   - `dicts_tw/*.json` 為台灣繁體中文基準字典。
   - `dicts/*.json` 為簡體中文基準字典。
   - 兩者必須維持 **100% 鍵值對齊**，無跨檔重複鍵，任何鍵的增刪改必須兩側同步更新。
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
2. **中英與中數空白隔離（盤古之白）**：
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
  - ❌ `麥克風已被阻止` ➔ ✔️ `麥克風權限受阻`

### 2.3 拒絕生硬翻譯腔與輕動詞包裝 (去「進行…」化)
- 嚴禁「進行……」、「完成對……的優化」、「實現……的提升」等空動詞包裝。
  - ❌ `手動下載除錯套件並進行分享` ➔ ✔️ `手動下載除錯套件並直接分享`
  - ❌ `持續執行，直到指定的目標完全完成` ➔ ✔️ `持續執行，直至達成指定目標`
  - ❌ `此提示詞較為直接，無需進行多方案對比` ➔ ✔️ `此提示詞直接明確，無須多方案比對`
  - ❌ `請先啟用該外掛程式以進行登入` ➔ ✔️ `請先啟用該外掛程式以登入`
  - ❌ `每個外掛程式都可以獨立進行管理` ➔ ✔️ `每個外掛程式都可以獨立管理`
  - ❌ `作為知識圖譜進行查詢` ➔ ✔️ `作為知識圖譜查詢`

### 2.4 軟體介面 UI 元件文體規範
依台灣軟體在地化行規（Apple HIG 繁中版 / Microsoft 繁中本地化指引 / VS Code 繁中套件）：
1. **選單項目 (Menu Items)**：簡短名詞或「動詞＋受詞」，動詞置於句首；帶後續輸入或彈出對話框者保留省略號 `...`（如 `開啟工作區...`、`儲存`、`關閉分頁`）。
2. **按鈕動作詞 (Buttons)**：強動詞開頭，省略多餘主詞與贅字。動作明確時以具體動作命名（如 `儲存`、`建立`、`安裝`、`套用`、`取代`），嚴禁口語口吻（如「按我」、「點此」、「點擊」）。
3. **確認對話框 (Confirmation Dialogs / Alerts)**：問句與按鈕嚴格對稱（如「要儲存對此檔案的變更嗎？」對應【儲存】、【不要儲存】、【取消】），避免問非所答的【是】／【否】。
4. **工具提示 (Tooltips / Hover Help)**：動詞開頭，單句 Tooltip 末尾絕不加句號；僅當包含兩句以上時，才使用全形句號分隔。
5. **狀態列 (Status Bar)**：正面簡短陳述當前狀態，進行中的任務統一使用「正在 [動詞]...」（如 `準備就緒`、`正在同步存放庫...`、`已變更 3 個檔案`）。
6. **錯誤訊息 (Error Messages)**：遵循「發生原因＋解決建議」（Cause + Actionable Resolution）原則，不指責使用者，主動明確陳述狀態。

### 2.5 語氣與人稱規範
1. **第二人稱「您」的使用邊界**：
   - 介面指示只要指涉清楚，一律省略多餘主詞（如「請輸入工作區路徑」，不寫「請您輸入您的工作區路徑」）。
   - 指明歸屬權（`您的帳戶`、`您的自訂外掛程式`）或假設說明（`若管理員有提供憑證`）時使用「您」（敬稱）。介面文字嚴禁直呼「你」。
2. **避免過度客套**：去除「親愛的使用者」等非必要客套詞彙。

---

## 3. 兩岸名詞標準對照與大陸黑話防護庫

本專案在 `scripts/compare_dicts.js` 中固化違禁詞攔截清單，並參照 Jserv《[資訊科技詞彙翻譯](https://hackmd.io/@sysprog/it-vocabulary)》的**四項跨領域方法論**審校軟體 UI 詞彙（嚴守 Domain Profile 分艙邊界，IT 專屬強制譯名不擴散至心理、文學、料理、醫療或純統計文本）：

- **詞源考據**：追溯原典詞源與學科脈絡（如 `silicon→矽`、`atomic→不可分割`、`operator / operand→運算子 / 運算元`）。
- **反概念塌縮**：區分技術層次，不混為同一詞彙（`cache→快取` vs `buffer→緩衝區`；`process→處理程序` vs `procedure→程序`；`concurrency→並行` vs `parallelism→平行`）。
- **反機械對應**：一詞多義依語境擇詞（`data` 於資訊脈絡作「資料」、於統計脈絡作「數據」；`function` 於程式設計作「函式」、數學作「函數」、介面說明作「功能」；`optimize` 視語意譯為「最佳化」或「改善」，不盲目硬替）。
- **音譯防誤導**：摒棄易混淆字面與誤導音譯（取「雜湊」捨「哈希」）。

以下名詞在繁體中文（`dicts_tw/`）中必須嚴格遵守台灣標準用法：

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
| **Item / Entry** (清單項目) | **項目** | 项目 / 项 | ❌ 條目 |
| **Default** | **預設** | 默认 | ❌ 默認 |
| **Global** | **全域** | 全局 | ❌ 全局 |
| **Settings / Preferences** | **設定** / **偏好設定** | 设置 / 首选项 | ❌ 設置 / 配置（非版面配置時） |
| **Window** | **視窗** | 窗口 | ❌ 窗口 |
| **Plugin / Extension** | **外掛程式** / **擴充功能** | 插件 / 扩展 | ❌ 插件 |
| **Shortcut / Keybinding** | **快速鍵** / **按鍵對應設定** | 快捷键 | ❌ 快捷鍵 |
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
| **View** (動作/選單) | **檢視** | 查看 / 视图 | ❌ 查看（選單/操作動作時） |
| **Select / Choose** | **選取** / **選擇** | 选中 / 选择 | ❌ 選中 |
| **Apply** (動詞) | **套用** | 应用 | ❌ 應用（作為動詞時） |
| **Change / Changes** | **變更**（已暫存的變更） | 更改 / 变更 | ❌ 更改 |
| **Repository** | **存放庫**（對齊 VS Code 繁中體例） | 仓库 / 代码库 | ❌ 倉庫 / 儲存庫（一律對齊存放庫） |
| **Workspace** | **工作區** | 工作区 / 工作空间 | ❌ 工作空間 |
| **Kernel / Core** | **核心**（核心版本） | 内核 / 核心 | ❌ 內核 |
| **Process** | **處理程序** | 进程 / 程序 | ❌ 進程 |
| **Instance** | **執行個體** | 实例 | ❌ 實例 |
| **License** | **授權**（授權清單、選擇授權） | 许可证 / 授权 | ❌ 許可證 |
| **Capture** | **擷取**（擷取主控台記錄檔） | 捕获 / 抓取 | ❌ 捕獲 |
| **Interrupt** | **中斷**（中斷代理並傳送） | 打断 / 中断 | ❌ 打斷 |
| **Migrate / Moved** | **移轉** / **已移至** | 迁移 / 已移动 | ❌ 遷移 |
| **Protocol** | **協定**（模型上下文協定） | 协议 | ❌ 協議 |
| **Compatible / Support** | **相容** / **支援** | 适配 / 兼容 | ❌ 適配 |
| **Response / Remediation** | **應變** / **應對與修復** | 响应 | ❌ 響應 |
| **Token** | **標記** / **Token** | 令牌 / 符号 | ❌ 令牌 / 符記 |
| **Click** | **點選** / **按一下** | 点击 / 单击 | ❌ 點擊 / 單擊 |
| **No need / without** | **無須** | 无需 | ❌ 無需 |
| **Unmount** | **卸除**（卸除工作區） | 卸载 | ❌ 卸載（非軟體解除安裝時） |
| **Plan** (名詞/規劃) | **計畫**（名詞）/ **規劃**（動詞） | 计划 | ❌ 計劃 |
| **Bookmark** | **書籤** | 书签 | ❌ 書簽 |
| **Weekly** | **每週** | 每周 | ❌ 每周 |
| **Assist** | **協助** / **支援** | 助力 / 辅助 | ❌ 助力 |
| **Empower** | **賦予能力** | 赋能 | ❌ 賦能 |
| **Exit with error** | **結束並出現錯誤** | 异常退出 | ❌ 異常退出 |
| **Render** (CG / Web 畫面) | **算繪** / **彩現** / **繪製** | 渲染 | ❌ 渲染 |
| **Traverse / Traversal** (圖論 / 資料結構) | **走訪** | 遍历 / 周游 | ❌ 遍歷 / 周遊（「遍歷性」數學專名除外） |
| **Hash** | **雜湊** | 哈希 / 散列 | ❌ 哈希 |
| **Asynchronous** | **非同步** | 异步 | ❌ 異步 |
| **Linked List** | **鏈結串列** | 链表 | ❌ 鏈表 |
| **Command Line** | **命令列** | 命令行 | ❌ 命令行 |
| **Iterative / Iterate** | **迭代** | 迭代 / 叠代 | ❌ 疊代 |
| **Optimize** | **最佳化**（演算法）/ **改善**（語境） | 优化 | ❌ 盲目機械強替 |
| **Silicon** | **矽** | 硅 | ❌ 硅 |

---

## 4. Slash 指令與不翻譯詞彙白名單 (Protected Tokens)

### 4.1 Slash 指令保留原則與單字鍵防撞
所有以 `/` 開頭之系統命令識別碼均直接由 Antigravity 核心解析器攔截，**一律嚴禁翻譯**：
- `/goal`
- `/swarm`
- `/boost`
- `/learn`
- `/schedule`
- `/plan`
- `/browser`
- `/compact`
- `/grill-me`
- `/teamwork`
- `/automation`
- `/plugin`
- `/btw`
- `/clear`
- `/help`
- `/init`

**關鍵防撞原則**：
1. 嚴禁在靜態字典中收錄與 Slash 指令同名的全小寫單字鍵（如 `goal`, `swarm`, `schedule`, `plan`, `clear`, `automation`, `browser`）。
2. 在 `src/preload_runtime.js` 中對 `[data-mention-menu] [data-testid="menu-option-label"]` 與 `/^\/[a-zA-Z0-9_.-]+$/` 全面實施標籤硬保護，絕對不翻譯指令名稱，僅翻譯 `menu-option-description` 說明文字。
3. `lowerMap` 單字轉換中，嚴禁將大寫單字鍵流向全域覆蓋同名小寫指令。

### 4.2 指令說明文字規範
Slash 指令名稱保持英文字串，但其輔助說明文字一律採用精煉出版級繁體中文：
- `/goal` ➔ 說明：`持續執行，直至達成指定目標`
- `/schedule` ➔ 說明：`依週期排程或一次性計時器執行指令`
- `/boost` ➔ 說明：`呼叫 Boost 多代理編排器以應對複雜任務`
- `/swarm` ➔ 說明：`啟動蜂群協作：多位代理在各自對話中平行處理同一任務`
- `/btw` ➔ 說明：`在不中斷目前主對話流程的情況下快速提問`

### 4.3 系統專有名詞與代碼保留清單
- **品牌名**：`Antigravity`、`Google`、`Firebase`、`Gemini`、`Claude`、`Android`、`Chrome DevTools`、`Puppeteer`。
- **協定與路徑**：`plugin://*`、`vscode://*`、`~/.gemini/*`、檔案路徑指標。
- **程式語言與關鍵字**：`Python`、`JavaScript`、`TypeScript`、`Go`、`Dart`、`Flutter`、`JSON`、`Markdown`、`agent`、`parallel`、`pipeline`、`phase`。

### 4.4 Thinking Effort 白名單（使用者最新指示：嚴格保留英文不翻譯）
模型選單中的 Thinking Effort 相關文字與選項標籤**一律保留英文原文、絕對不翻譯**：
- `Thinking Effort`（設定標籤）
- `Low`（低思考強度）
- `Medium`（中思考強度）
- `High`（高思考強度）
- `Extra`（極高思考強度）
- `Max`（最大思考強度）

---

## 5. 模型選單與動態訂閱方案規範 (Model Selector Specifications)

在模型選擇器與模型提示資訊中，Google Antigravity 具有多種方案組合與動態提示。必須保證動態函數 `formatPlanAudience`、正規規則 `DYNAMIC_RULES` 與靜態字典 `page_main.json` 完全一致。

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

### 5.3 模型選單 Tooltip 與分流提示標準範本 (v2.33.0+ 新增)
1. **Gemini 4 Neon**：
   - `For most deep reasoning and complex problems`  
     ➔ `適用於深度推理與高度複雜的問題`
2. **Gemini 4 Hydrogen**：
   - `For speed and efficiency in execution tasks`  
     ➔ `適用於執行任務時的高速與高效率`
3. **Orchestrator (Neon)**：
   - `Neon that may offload routine steps to Hydrogen. Same Neon-level quality, fewer tokens used.`  
     ➔ `Neon 可將例行步驟分流至 Hydrogen。維持 Neon 同級品質，消耗更少 Token。`
4. **Orchestrator (Argon)**：
   - `Argon that may offload routine steps to Hydrogen. Same Argon-level quality, fewer tokens used.`  
     ➔ `Argon 可將例行步驟分流至 Hydrogen。維持 Argon 同級品質，消耗更少 Token。`

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
   *必須保證*：所有測試項目全數通過（Windows 專屬 `fsync` 測試於非 Windows 平台按設計略過，0 failed）。

3. **封裝純翻譯資料包（Release Assets 唯一允許產物）**：
   ```bash
   node scripts/build_translation_pack.js \
     --version 3.8.1 \
     --min-engine 3.7.3 \
     --max-engine 3.8.1 \
     --output dist/antigravity2-TW-translations-v3.8.1.zip
   ```
   *注意*：完整發布規範與 Draft Preflight 稽核詳見 [`docs/RELEASING.md`](./RELEASING.md)，嚴禁將可執行程式碼 ZIP 上傳至 Release Assets。

4. **本機應用程式即時重套與 macOS 簽章驗證**：
   ```bash
   node localization_engine.js --tw --no-kill --sync-watcher --brand-title english
   codesign --verify --deep --strict /Applications/Antigravity.app
   ```
   驗證本機 `/Applications/Antigravity.app` 注入成功、簽章密封完整且正常運作。
