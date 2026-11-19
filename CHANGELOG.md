# 更新紀錄

## 3.7.2 — 2026-11-20

- 純翻譯資料自動更新與程式碼自我升級徹底移除：
  - 守護程序僅同步 `dicts/` 與 `dicts_tw/` 純文字字典及非執行型 manifest，永不自我更新可執行程式碼。
  - 徹底移除 `selfUpdateWatcher`、`applySelfUpdateAtomic` 及相關寫入路徑，程式引擎與守護腳本更新均由使用者手動下載安裝。
  - 停用自動更新方式為標準卸載守護程序，無須額外設定開關。
- Google ShipIt 官方更新競爭防護（P0-01）：
  - 引入跨平台原生原子交換機制（macOS `renamex_np(RENAME_SWAP)`、Windows `ReplaceFileW`、Linux `renameat2(RENAME_EXCHANGE)`）。
  - 原子交換後核對被換出的 ASAR。若偵測到官方更新，會嘗試換回官方檔案；恢復失敗時保留原始檔案並記錄復原位置。
- 官方 ASAR 備份安全強制守門（P0-02）：
  - 備份寫入後執行 `fsync`，並以原子方式置入 `app.asar.bak`；Windows 同步失敗會中止套用。
  - 備份寫入失敗（如磁碟空間不足 ENOSPC）或讀回驗證雜湊不符時，立即終止流程，正式 `app.asar` 保持未修改狀態。
- GitHub Release 發布安全隔離與預檢閘門：
  - 針對舊版 v3.7.1 任意 ZIP 選取漏洞，建立 Release Assets 唯一性規範：有且僅有單一純翻譯包，嚴禁夾帶可執行程式 ZIP。
  - 完整程式升級一律經由 GitHub 自動生成之 Source code (zip) 取得。
  - 實作 `scripts/check_release_assets.js` 與 GitHub Actions 預檢工作流程，發布前嚴格驗證資產唯一性、SHA-256 與引擎相容性。
- 跨平台權限安全（macOS & Windows）：
  - macOS 完善 LaunchAgent / LaunchDaemon 互斥鎖定（`run.lock`）與安全卸載。
  - Windows 工作排程嚴格採用 `LeastPrivilege` 最低權限，遇 `Program Files` 限制乾淨提供管理員手動指引，杜絕失控重試與提權風險。

## 3.7.1 — 2026-11-19

- 徹底解決背景守護程序覆寫新版本問題（四道防回滾架構）：
  - 診斷並修復 macOS LaunchAgent / Windows Task Scheduler 背景守護在手動安裝後數秒內因比對快照雜湊而將新版 `app.asar` 覆寫回舊版的根本衝突。
  - 元數據防偽標記 (`ANTIGRAVITY L10N META`)：在產出之 `app.asar` 中寫入版本號、雜湊與時間戳，使守護程序與安裝腳本能精準判定套件版本。
  - 守護防降級守門：`auto_localize_watcher.js` 偵測到目標檔案版本大於或等於自身版本時自動安全略過，終結回滾。
  - 主動同步快照：安裝程序會自動同步更新 LaunchAgent 快照目錄（`~/Library/Application Support/Antigravity2TW/runtime/`）並重新向 Windows Task Scheduler 註冊當前正確路徑。
  - 多分區 Electron 快取自動清理：安裝後自動清除 5 處快取與多分區 Code Cache，避免 V8 bytecode 與 UI 快取衝突。
- 守護程序自動升級機制 (Self Auto-Updater)：
  - 全新實作 `scripts/auto_updater.js` 並深度整合至 `auto_localize_watcher.js`。
  - 背景守護在定時檢查官方 updates 時，可自動偵測本專案之 GitHub 最新版本，支援嚴格網域白名單與 SHA-256 校驗，自動原子化下載並更新守護程式碼（保留 `node_modules` 與狀態），免去手動更新守護之繁瑣。
- Slash 指令與 Thinking Effort 硬性保護：
  - Slash 指令純英文化：徹底解決 `/goal` 等 Slash 指令被中文化為「目標」而在選單輸入時引發指令解析失敗的問題。白名單保護涵蓋所有 Slash 指令 token（如 `/goal`, `/swarm`, `/boost`, `/learn`, `/schedule`, `/compact`, `/btw` 等），保留純英文指令名稱，僅翻譯說明文字。
  - Thinking Effort 嚴格保留英文：使用者明確指示「Thinking Effort 不修改」，模型選擇器中思考強度等級（`Low`, `Medium`, `High`, `Extra`, `Max`）及 `Thinking Effort` 標籤完全維持官方英文，不被字典或模糊規則篡改。
- 模型提示補齊與 L0 出版級自然繁體中文校對：
  - 補齊最新截圖中漏翻之模型 Tooltip：
    - `"For most deep reasoning and complex problems"` ➔ `"適合大多數深度推理與複雜難題"`
    - `"For speed and efficiency in execution tasks"` ➔ `"適合追求速度與效率的執行任務"`
    - `"Neon that may offload routine steps to Hydrogen. Same Neon-level quality, fewer tokens used."` ➔ `"Neon 可將例行步驟分流至 Hydrogen。維持 Neon 同級品質，消耗更少 Token。"`
    - `"Argon that may offload routine steps to Hydrogen. Same Argon-level quality, fewer tokens used."` ➔ `"Argon 可將例行步驟分流至 Hydrogen。維持 Argon 同級品質，消耗更少 Token。"`
  - 補齊 52 個全新 UI 詞條至 `dicts_tw/` 與 `dicts/`，字典達成 100% 對齊。
  - 徹底依據 L0 出版級標準去除被動式（「被...」）、大陸黑話與空動詞（如「進行...」），校對全數短句，統一正字與半形引號轉全形「」引號。
- 台灣軟體在地化標準體例指南確立 (`docs/LOCALIZATION_STYLE_GUIDE.md`)：
  - 整合 Google、Apple、Microsoft、VS Code 等國際軟體在台灣的在地化行規與體例指南，固化詞彙對照表（如全面採用 VS Code 繁中標準「存放庫」替代「倉庫／儲存庫」）。
  - 在專案規範中建立長久遵循的標準檔案。

## 3.7.0 — 2026-11-19

- 出版級繁體中文體例全面校對與 L0 底線守護：
  - 全面消除大陸用語殘留：「並行」統一校訂為「平行」（涵蓋工作流程指令碼、協調器歡迎語中之「啟動平行工作代理」以及 README 說明）、「定時任務」統一校訂為「排程任務」、「定時器」統一校訂為「計時器」。
  - 徹底移除被動語態「被…」殘留：成品審查設定「被注入內容」優化為主動語境「遭惡意注入的內容」。
  - 統一蜂群 (Swarm) 介面術語體例：修復字典中 Swarm 英文殘留與「蜂群」雙軌混雜問題，UI 介面全數統整為「蜂群」（蜂群看板、蜂群成員、蜂群時間軸、蜂群檢視、未命名蜂群），原生 Slash 命令識別碼保持 `/swarm` 不變。
  - 正字規範與排版空格校準：全面將「發佈」收斂為台灣標準正字「發布」（發布訊息、發布概覽、發布通道），並在 `scripts/compare_dicts.js` 固化違禁詞攔截；修復動態日期與句子拼接處之標點空格瑕疵（消除全形句點後之空格，修正「日」與「起」間誤植空格為標準「日起」）。
  - 修復協調器 (Coordinator) 歡迎語無 `<strong>` 標籤時遺失專案名稱之防禦性容錯。
- 模型選擇器提示文字與訂閱方案標準對齊：
  - 規範化英文原序與中文對稱對應標準：嚴格區分「Pro 與 Ultra」與「Ultra 與 Pro」、「付費訂閱者」（`paid ... subscribers`）與「付費方案訂閱者」（`paid ... plan subscribers`）。
  - 同步對齊並擴充 `formatPlanAudience`、`DYNAMIC_RULES`、`dicts_tw/page_main.json`、`dicts/page_main.json` 及 `test/engine.test.js`，雙向覆蓋 Argon、Carbon、Hydrogen 與 Sonnet 等所有主流模型之帶句點／無句點變體。
- Slash 指令與原生標記白名單保護：
  - 確認所有 Slash 指令（`/swarm`、`/goal`、`/boost`、`/learn`、`/schedule`、`/swarm-autonomous-pipeline`、`/egm-boost` 等）絕對不被翻譯，保留原生指令標記以防觸發異常；指令說明文字全量維持自然出版級台灣繁體中文。
- 專案在地化規範沉澱：
  - 新增專案繁中在地化文字規範與體例指南 [`docs/LOCALIZATION_STYLE_GUIDE.md`](./docs/LOCALIZATION_STYLE_GUIDE.md)，完整沉澱架構原則、L0 標點與去腔體例、名詞對照表、Slash 白名單、動態模板規範與驗收清單，並與 `AGENTS.md`、`.cursorrules`、`.clinerules` 及 `scripts/compare_dicts.js` 形成自動防護機制。
- 適配 Antigravity **v2.33.0**，並整合上游 `qqxpee/antigravity2-cn` 至 `91529e3`：
  - 補齊 v2.33.0 新增介面譯文：內建瀏覽器資料與 Cookie 管理、快速鍵配置方案、麥克風診斷、組合包（bundle）市集、分支提問、`remoteManager.js` 的 5 組 SSH／麥克風／共用家目錄對話框，並新增 `patchWizardHtmlJs()` 翻譯首次導覽視窗。
  - 同步上游 ASAR 標頭校驗、詞邊界取代（`replaceWithBoundary`）、Sidecar／Tray 缺值防護、`restore_page` 圖示保留 React 節點，以及簽署失敗回滾；`scripts/compare_dicts.js` 增加非物件 JSON 檢查。
  - 台灣術語依上游 `805bc52` 校訂。
- 模型選擇器警示與動態下架日期翻譯支援：
  - 新增模型狀態標籤 `Unavailable`（繁體中文：`無法使用`，簡體中文：`不可用`）。
  - 新增動態模型付費可用性與第三方模型移除警示規則，支援各類動態日期（如 `starting on November 30, 2026` 自動在地化為 `自 2026 年 11 月 30 日 起，您目前的方案將不再提供第三方模型存取權限。`），自動因應上游變動時間與不同模型名稱。
- 專案檔案整頓與全面繁體中文命名統一：
  - 清理上游遺留之舊版簡體中文腳本（`双击安装中文汉化.bat`、`双击安装中文汉化.command`、`双击安装繁体中文.bat`、`双击安装繁体中文.command`、`双击卸载还原官方英文.bat`、`双击卸载还原官方英文.command`）與舊版 `README_CN.md`。
  - 全專案批次檔與指令檔統一採用標準繁體中文命名的 8 大腳本（`點兩下安裝繁體中文.bat/.command`、`點兩下還原官方英文.bat/.command`、`點兩下安裝Windows/macOS背景守護.bat/.command`、`點兩下卸載Windows/macOS背景守護.bat/.command`），徹底消除簡繁重複與混淆。
- Windows 交付修復（根因：批次檔 LF 換行與 4-byte Emoji、GBK 編碼、`.ps1` 缺 BOM、防毒啟發式特徵）：
  - 所有 `.bat` 改為純 ASCII、`CRLF`、`chcp 65001`，互動選單與訊息改由 Node.js 輸出；`.ps1` 改為 UTF-8 BOM + `CRLF`；`.gitattributes` 強制 `.bat`／`.ps1` 為 `crlf`、`.command`／`.sh` 為 `lf`。
  - 移除 `proxy_config` DLL 注入（`version.dll`、`dbghelp.dll`、`config.json`）、未執行時的盲目 `taskkill /f` 與 `powershell -ExecutionPolicy Bypass`。
  - 新增 `--install-windows-task`／`--uninstall-windows-task`：以 UTF-16LE XML 透過 `schtasks /create /xml` 註冊排程，依是否為系統管理員決定 `RunLevel`；新增 Windows 寫入權限預檢與 `Program Files (x86)`、`Antigravity IDE` 路徑偵測。
  - 新增 `--interactive`（品牌標題選單）與 `--sync-watcher`。
- 新增 `AI_INSTALL_GUIDE.md` 與 `AGENTS.md`：交給 AI 工具時先唯讀檢查，再由使用者從 1–4 選項決定；README 改以此為首選安裝方式，並修正已過時的說明與失效連結。
- 測試：擴充 `test/windows_deliverables.test.js` 與 `test/engine.test.js`，`npm test` 共 45 項全部通過。

## 3.6.1 — 2026-11-18

- 單次安裝腳本防呆補強：
  - `點兩下安裝繁體中文.command` 新增偵測機制：若本機原本已啟用舊版 macOS 背景守護（`LaunchDaemon` 或 `LaunchAgent`），安裝完成後會自動將該守護同步升級至最新版本，避免舊版守護於 30 秒後將手動升級好的繁中套件覆寫回舊版；同時補齊 Homebrew / `/usr/local/bin` 的 `PATH` 搜尋路徑。
  - `install_macos_autowatcher.sh` 在系統級 `LaunchDaemon` 升級完成後，自動清理已汰換的舊 `runtime.*` 殘留目錄。
  - `點兩下安裝繁體中文.bat` 偵測到已註冊的 Windows 排程 `AntigravityAutoLocalize` 時，於完成畫面主動提示同步更新背景守護。

## 3.6.0 — 2026-11-18

- 同步上游 Swarm Sidecar 修復（`upstream/main` `f4f2005`）：
  - 在 `src/main_patches.js` 的 Sidecar 注入檢查中放行 `plugin://` 協定（支援 `plugin://swarm-auth/...` 等子框架），同步補齊 `tests/installer-regressions.cjs` 驗證案例。
- 根治 macOS 背景守護雙服務互打與安裝腳本缺陷：
  - 修復 `install_macos_autowatcher.sh` 未處理系統級 `LaunchDaemon`（`/Library/LaunchDaemons/com.antigravity.autolocalize.plist`）與使用者級 `LaunchAgent` 並存的問題：自動模式偵測到舊系統級服務時優先接管升級；指定 `--user` 時自動停用舊系統級服務，杜絕新舊服務每 30 秒互相覆寫 `app.asar` 導致介面版本跳動與舊版譯文殘留。
  - 修復使用者模式 `cp -R` 在目標資料夾已存在時產生巢狀目錄的問題。
  - 移除一鍵安裝腳本與守護安裝腳本中對執行期無關的強制 `npm ci` 下載步驟，實現真正零依賴、可離線安裝；同步將 `@electron/asar` 移至 `devDependencies` 並重新校準 `package-lock.json` 與移除跨檔重複鍵值 `"Global Permissions"`，修復 GitHub Actions CI 驗證失敗。
  - `localization_engine.js` 正式支援 `--staging` 參數，跳過暫存階段重複清快取與對暫存目錄誤報重簽名警告；`cleanElectronCache()` 補回 `'Cache'` 目錄清理，更完整消除更新後快取殘留。
- 補齊 v2.32.1 遺漏翻譯與原生 Electron 彈窗：
  - 補強 `dicts/` 與 `dicts_tw/` 靜態缺失詞條（`Authentication required`、`SSH host`、`Reading terminal:`、`Read terminal:` 與無內部連結版 Best of N 說明），並統一 `src/main_patches.js` 繁中術語為「代理」。
  - `src/preload_runtime.js` 新增 40+ 項即時介面動態模板規則（語音選擇標題、麥克風權限提示、瀏覽器下載／導覽封鎖提醒、外掛與技能捷徑、MCP 設定提示、資料夾建立／錯誤彈窗、自動化任務提示、遠端視窗與專案儲存錯誤訊息等）。
  - 主行程原生彈窗新增覆蓋 `dist/deviceChooser.js`、`dist/webauthn.js`、`dist/webviewPopupSecurity.js`、`dist/provisionSplash.js`，並修復 `dist/remote/remoteManager.js` 多行字串拼接導致的漏譯與補齊 `dist/main.js` Dock 選單、`dist/ipcHandlers.js` 複數工作區／下載資料夾對話框、`dist/remote/sshPrompts.js` HTML 提示。
- 測試套件擴充：
  - 自動化單元測試增至 31 項，`node scripts/compare_dicts.js` 與全部回歸測試 100% 通過。

## 3.5.0 — 2026-11-17

- 主行程（Main Process）原生彈窗繁中化：
  - 納入 DOM 無法觸及的原生對話框，新增 `patchMainJs()`、`patchIpcHandlersJs()`、`patchRemoteManagerJs()` 與 `patchSshPromptsJs()` 注入引擎。
  - 覆蓋退出確認彈窗（「確定要結束嗎？可能仍有代理人或背景任務在執行中。」）、WSL 環境與核心依賴錯誤、IPC 工作區資料夾選取器、SSH 終端終止確認與安全性金鑰觸碰提示。
- 根治初次啟動快取延遲：
  - 重構 `cleanElectronCache()`，改為遞迴深度掃描並清除 `Partitions/hub-browser-*/Code Cache` 內之 V8 編譯位元碼，解決應用升級或更新後初次啟動殘留舊版快取（顯示英文或舊翻譯）的問題。
  - 調整守護服務快取清理邏輯，確保更新套用後即刻載入最新繁體中文字串。
- 動態使用者問候語片段匹配修復：
  - 針對 React 在首頁將動態使用者名稱與問候語切割為多個獨立文字節點的結構（`Hey {name}, what should we build today?`），強化 `src/preload_runtime.js` 之後綴片段規則與上下文父節點匹配，完整呈現「嗨 {name}，今天我們要打造什麼？」。
- macOS 背景守護服務（LaunchAgent）校準：
  - 修復 `install_macos_autowatcher.sh` 與守護服務模組同步邏輯，確保 `src/` 模組目錄正確複製並納入監聽。
- 字典與文件專名校準：
  - 補齊 `Global Permissions`（全域權限）等介面詞條；登入介面標題校準為「歡迎使用 Antigravity」並更新最新截圖；全面整理軟體專有名詞體例。
- 測試套件擴充：
  - 單元測試擴充至 30 項跨平台自動化測試（涵蓋主行程原生彈窗注入與動態問候語分詞場景），全數通過。

## 3.4.0 — 2026-11-16

- 適配 Google Antigravity v2.32.1 官方最新介面：
  - 納入 SSH 遠端連線主機（Remote SSH Host）、草稿膠囊（Draft Capsule）、多代理視圖佈局（Stage / Desktop / Grid / Multi-Agent Layout）等新介面繁中化。
  - 補齊終端機沙箱邊界說明、雲端憑證存取提醒、macOS 隱私跳轉與自訂外掛預算提示，繁體中文字典總量擴充至 3,721 條，100% 繁中對齊覆蓋。
- 架構重構與引擎現代化解耦：
  - 核心運行時解耦拆分為模組化架構（`src/preload_runtime.js`、`src/main_patches.js`、`src/asar_patcher.js`），大幅精簡程式碼體積。
  - 引入純原生 Node.js ASAR 解析與修補引擎（`patchAsarArchive` / `validateAsarCandidate`），徹底擺脫外部 `asar` CLI 工具與第三方相依，支援直接記憶體流二進制修補與 SHA-256 完整性校驗。
  - 強化 `src/preload_runtime.js` 中的 `isCodeOrEditor` 安全防護，增強非瀏覽器環境容錯，並保留 `makeFlexibleRegex` 直彎引號動態模糊相容與多子句連續替換機制。
- 測試套件擴充與綠燈通過：
  - 整合上游回歸測試（`installer-regressions.cjs`）與繁中專屬單元測試套件，涵蓋 28 項跨平台自動化測試（macOS / Linux / Windows），全數通過。

## 3.3.5 — 2026-11-14

- 深度修復引擎長句與特殊引號解析缺陷（`localization_engine.js`）：
  - 引入 `makeFlexibleRegex` 動態正規編譯器，自動抹平 DOM 原始文字中印刷體彎引號（`’`、`‘`、`“`、`”`）、省略號（`...` 與 `…`）與任意空白格式差異，徹底根治 `We won’t show you ads` 與 `Antigravity’s agents...` 因引號型態不一致導致的替換脫落。
  - 解除複合節點過早中斷（`break`）限制，支援同一文字節點內多個子句（如 `Help us improve Antigravity.` 與 `Allow Google to collect...`）連續替換，杜絕中英夾雜。
- 完整補齊 NUX 登入新手導覽與條款全句繁中化：
  - 納入完整句子與多種拆分形態（`Customize your experience... what Antigravity says.`、`Antigravity's agents are powerful...`、`Sign up for newsletters... about Antigravity.` 等），在單一節點或多節點情境下均能 100% 呈現道地繁體中文。
- 全量清查並補齊官方 UI 基準中遺漏之 123 條介面詞條：
  - 納入 `page_v231_patch.json`（涵蓋 Apply/Create、關閉分頁、主控台截圖、排隊發送訊息、專案/工作區搜尋、桌面/行動/PWA 模式標籤、常用按鍵等），官方基準 2,296 條詞條達 100.00% 繁中全覆蓋。
- 測試套件擴充至 25 項跨平台自動化測試，全數通過。
- 實作背景自動版本檢測與更新提醒機制（`scripts/auto_updater.js`）：
  - 整合至守護程序（`auto_localize_watcher.js`），每 24 小時定期查詢 GitHub 最新發布版本；偵測到字典或引擎修訂時，主動發出原生系統通知提醒升級，不阻斷前景操作。
  - 於一次性安裝腳本（`點兩下安裝繁體中文.command` 與 `.bat`）完成畫面中加入常駐守護引導說明。

## 3.3.4 — 2026-11-12

- 適配 Antigravity v2.31.0 / v2.31.1 官方介面更新：
  - 新增 `page_v231_patch.json` 繁中修訂字典，補齊協調器（Coordinator）角色面板、設定與多代理任務配置。
  - 補齊 OAuth 授權碼備援登入提示、語音通話摘要（Summarizing call...）、歷史發言角色標記（Agent said / You said）與側邊提問指令（Ask /btw）。
  - 全量掃描驗證 Antigravity v2.31.1 介面 2,296 條詞條，達 100% 完整中文化覆蓋。
- 維護性與跨平台測試：
  - 22 項跨平台自動化測試全數通過（macOS / Linux / Windows）。

## 3.3.3 — 2026-11-11

- 補齊 Antigravity v2.30.0+ 登入與新手導覽（NUX Onboarding）中英夾雜漏譯：
  - 深度適配 React 前端以動態變數拆分字串之 TextNode 架構，補齊 `Customize your experience...`、`'s agents are powerful...`、`Help us improve Antigravity.` 等切斷節點繁中化。
  - 補齊服務條款詳細頁（Terms of Service & Data Use）、隱私權聲明與背景代理運作提示，UI 詞條涵蓋率達 100% 全量覆蓋。
- 根除 macOS 背景守護服務誤開 Finder 視窗之問題：
  - 完善 `localization_engine.js` 重啟守衛，強制在 `--staging` 沙箱模式或 `--no-kill` 時略過用戶端重啟。
  - 嚴格檢驗目標路徑必須為正規 `.app` 應用程式套件（含 `Contents/MacOS`），杜絕暫存資料夾被系統 `open` 指令喚起 Finder 視窗之烏龍。
- 維護性與跨平台測試：
  - 22 項跨平台自動化測試全數通過（macOS / Linux / Windows）。

## 3.3.2 — 2026-11-10

- 適配 Antigravity v2.30.0+ 官方介面更新：
  - 整合 v2.22 至 v2.30 介面修訂，新增 `page_v222_patch.json`、`page_v226_patch.json`、`page_v227_patch.json`、`page_v228_patch.json`、`page_v229_patch.json` 與 `page_v230_patch.json` 繁中修訂字典。
  - 全面清洗並校準為台灣在地用語（zh-TW），涵蓋對話設定、知識庫、MCP 工具、模型面板及自訂代理介面。
  - 強化輸入焦點隔離與程式碼選擇器，確保編輯器、終端機與思考內容不被誤翻譯。
- 提升 macOS Sequoia 相容性與守護穩定度：
  - 主動清除 `com.apple.provenance` 延伸屬性，解決 macOS Sequoia 檔案屬性鎖定阻礙置換之問題。
  - 加固 `localization_engine.js` 本機 asar 提取與封裝機制，相容特殊字元與空白路徑，保持背景離線可用。
  - 完善 `--staging` 與測試隔離環境，22 項跨平台自動化測試全數通過。

## 3.3.1 — 2026-10-14

- 修復 macOS 守護服務置換檔案時造成 `app.asar` 遺失的資料損毀問題：
  - 徹底移除 `safeReplaceFile` 中的 `fs.unlinkSync(dst)` 與 `/bin/cp -f` 強制刪除邏輯，改採原檔案控制項 `openSync('r+')` 與 `ftruncateSync` 原地寫入回退，防範 macOS TCC 與 App Management 阻攔新檔建立時目標檔案遭刪除。
  - 同步將原地寫入安全防護機制引入 `localization_engine.js`，消除引擎單獨手動執行時的非預期中斷風險。
  - 備份流程非致命化：應用程式目錄備份建立失敗時記錄警告並繼續進行主程式繁中化，避免單純備份權限不足阻斷繁中套用。
- 支援雙軌安裝架構與 Apple Silicon 原生相容：
  - `install_macos_autowatcher.sh` 新增 `--user` 與 `--daemon` 旗標，支援一般使用者無 sudo 權限安裝至 `~/Library/LaunchAgents`，遇權限不足時自動降級為使用者守護服務。
  - 自動探測 `/opt/homebrew/bin/node`、系統 PATH 與官方安裝之 Node.js 22.12+，修復 Apple Silicon 機型路徑未命中問題。
  - `uninstall_macos_autowatcher.sh` 支援同步安全卸載 `gui/$UID` LaunchAgent 與 `system` LaunchDaemon。
- 測試套件擴充至 21 項測試，納入版本號雜湊聯動（`recipeHash`）、`safeReplaceFile` 原地寫入回退及權限受限目錄復原驗證。

## 3.3.0 — 2026-10-14

- 吸收上游 `qqxpee/antigravity2-cn` 2.22.0+ 至 `8500f37`：
  - 支援 FastPick 與 QuickPick 複合節點與分割文本節點處理（修復模板轉義脫落問題）。
  - 強化 Lexical 編輯器輸入焦點隔離與程式碼隔離選擇器（防止 Chat、Thinking 及 Markdown 程式碼區塊誤觸翻譯）。
  - 新增 `page_v218_extra.json` 逾 1,450 條字典條目，全數清洗並校準為台灣在地用語（影片、貼上、支援、目前、帳戶、一般設定、進階設定等）。
  - 整合 MCP 市場前端自動探針、動態正規表示式翻譯（規則 Token 預算、工具摘要、訊息分頁等）。
  - 引入開發輔助工具集 `scripts/dev_tool.js`、`scripts/compare_dicts.js` 與 `scripts/mcp_catalog_baseline.json`，簡繁字典鍵值 100% 嚴格對齊。
- 根除 LaunchDaemon 守護程序與本機執行的 `EPERM` 與 `EACCES` 權限問題：
  - 實作 `safeReplaceFile`：在置換檔案遭遇 macOS 限制時自動回退至覆蓋式寫入與清理；置換前主動清除 `com.apple.quarantine` 延伸屬性；建立暫存目錄若受限自動回退至狀態目錄或系統暫存區。
  - 強化狀態目錄與鎖定權限防護：`.watcher-state` 與鎖定目錄以 `0755` 建立並支援既有權限自動補全；以 root 執行時主動將目錄、PID 檔案與 `_CodeSignature` 屬主還原至應用程式父層擁有者。
  - 完善安裝腳本：確保日誌目錄與 `autolocalize.log` 具備適當讀寫權限（`0755`/`0644`），避免診斷日誌遭遮蔽。
- 測試套件擴充至 18 項自動化跨平台測試，涵蓋 FastPick 節點本地化、`safeReplaceFile` 異常回退與 `ensureAccessibleDir` 權限提升驗證。

## 3.2.0 — 2026-09-26

- 整合上游至 `c392638`：終端機、檔案預覽、Diff 與 Shadow DOM 隔離，動態設定摘要、字典補充及官方更新備份。
- macOS 守護改用系統 LaunchDaemon，將 Node、程式與依賴複製到 root 擁有的版本目錄。舊 LaunchAgent 停用後保留。
- 每 5 分鐘巡檢；macOS 另監看應用程式路徑。等待檔案穩定，檢查重建期間是否有官方更新，使用互斥鎖避免重複執行。
- 以引擎、字典與輸出雜湊判斷是否需重套；簽署失敗回報非零狀態並嘗試還原，不再回報成功。
- 鎖定 `@electron/asar` 4.3.0，使用 Node.js 22.12.0 以上。背景執行不連網、不搜尋使用者的 npm 快取。
- 引擎可安全匯入測試；`--staging` 不關閉應用程式、不清除快取、不簽署真實應用程式。手動重套不再從可能過期的備份覆蓋目前版本。
- 新增跨平台回歸測試，涵蓋重複執行、更新競爭、備份、失敗還原、程式碼區域隔離與實際 ASAR 重建。

背景套用完成後，已開啟的視窗仍須重啟才能載入新內容。macOS App 管理權限及 Windows 排程帳號的寫入權限須在目標電腦確認。
