# 更新紀錄

## 3.3.5 — 2026-11-14

- 深度修復引擎長句與特殊引號解析缺陷（`localization_engine.js`）：
  - 引入 `makeFlexibleRegex` 動態正規編譯器，自動抹平 DOM 原始文字中印刷體彎引號（`’`、`‘`、`“`、`”`）、省略號（`...` 與 `…`）與任意空白格式差異，徹底根治 `We won’t show you ads` 與 `Antigravity’s agents...` 因引號型態不一致導致的替換脫落。
  - 解除複合節點過早中斷（`break`）限制，支援同一文字節點內多個子句（如 `Help us improve Antigravity.` 與 `Allow Google to collect...`）連續替換，杜絕中英夾雜。
- 完整補齊 NUX 登入新手導覽與條款全句繁中化：
  - 納入完整句子與多種拆分形態（`Customize your experience... what Antigravity says.`、`Antigravity's agents are powerful...`、`Sign up for newsletters... about Antigravity.` 等），在單一節點或多節點情境下均能 100% 呈現道地繁體中文。
- 全量清查並補齊官方 UI 基準中遺漏之 123 條介面詞條：
  - 納入 `page_v231_patch.json`（涵蓋 Apply/Create、關閉分頁、主控台截圖、排隊發送訊息、專案/工作區搜尋、桌面/行動/PWA 模式標籤、常用按鍵等），官方基準 2,296 條詞條達 100.00% 繁中全覆蓋。
- 測試套件擴充至 25 項跨平台自動化測試，全數通過。
- 借鏡「善解輸入法」架構，實作背景自動版本更新探針（`scripts/auto_updater.js`）：
  - 整合至 `auto_localize_watcher.js`，每 24 小時定期檢查 GitHub 最新 Releases，當有新字典或引擎修復發布時，主動推播原生系統通知提醒升級。
  - 在一次性安裝腳本（`點兩下安裝繁體中文.command` 與 `.bat`）尾部加入背景守護引導提示。

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
