# Antigravity 台灣繁體中文在地化套件（antigravity2-TW）

> 本專案為 Google Antigravity 的繁體中文（台灣，zh-TW）在地化套件。  
> 底層注入架構源自 [qqxpee/antigravity2-cn](https://github.com/qqxpee/antigravity2-cn)，本分支專注於台灣軟體體例校訂、快取清理與跨版本自動自癒守護。

[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-blue.svg)](#-極速安裝指引)
[![Locale](https://img.shields.io/badge/Locale-繁體中文%20(台灣%20zh--TW)-brightgreen.svg)](#-術語對照標準)
[![Upstream](https://img.shields.io/badge/Upstream-qqxpee%2Fantigravity2--cn-lightgrey.svg)](https://github.com/qqxpee/antigravity2-cn)

👉 **[原版簡體中文說明 (Upstream README)](README_CN.md)**

目前套件版本：**3.2.0**。上游已整合至 `c392638`；台灣用語與背景守護由本分支持續維護。

---

## 📌 術語對照標準

詞庫依據 macOS 與 Visual Studio Code 繁體中文（台灣）介面體例校訂，主要調整對照如下：

| 原版簡中轉譯 | 台灣開發者標準繁體 | 規範說明 |
| :--- | :--- | :--- |
| **命令面板** | **命令選擇區** | 對齊 VS Code 繁體中文介面標準（Command Palette） |
| **代碼倉庫 / Git 倉庫** | **儲存庫 / Git 儲存庫** | 對齊版本控制系統標準體例（Repository） |
| **智能體** | **代理** | AI 領域標準專用名詞（Agent） |
| **未配置計劃任務** | **未設定排程任務** | 修正排程與設定語意搭配（Scheduled Tasks） |
| **終端命令** | **終端機指令** | 對齊 macOS 終端機標準用法（Terminal Commands） |
| **本地** | **本機** | Local 對應本機規範 |
| **Token 預算超限** | **Token 預算額度已超限** | 語意精準完整 |
| **可復用** | **可重複使用** | 自然中文語序 |
| **暫無會話** | **尚無對話記錄** | 語意明確 |
| **確定** | **好** | 對齊 macOS 對話框確認按鈕體例 |
| **反重力智慧引擎** | **Antigravity** | 保留官方英文品牌標記，避免破壞辨識度 |

---

## ⚙️ 核心機制

1. **同步備份檔案**：偵測官方發布新版本時，自動將全新英文包同步備份為 `app.asar.bak`，避免還原時退回舊版。
2. **更新套用方式**：背景守護先在隔離目錄重建，確認官方檔案未再更新才置換；不關閉應用程式、不清除使用中的快取。已開啟的視窗須重啟後載入。
3. **macOS 簽署驗證**：背景置換後執行本機 ad-hoc 簽署與驗證，失敗時嘗試還原並回傳錯誤。這不等同官方簽章或 Apple 公證。
4. **專注桌面體驗**：全面聚焦 Antigravity 2.0 獨立桌面版 IDE 的完整繁體中文化；停止支援 VS Code 擴充套件以確保運作穩定。
5. **常駐背景守護**：提供 macOS `launchd` 原生守護服務與 Windows 排程工作，官方版本更動時自動於背景重編注入。

---

## 📸 介面效果展示

### 1. 歡迎頁與登入新手導引
![歡迎頁與登入新手導引](./showimg/showlogin_tw.png)

### 2. 主編輯器介面與選單
![主編輯器介面與選單](./showimg/showmain_tw.png)

### 3. 詳細參數設定面板
![詳細參數設定面板](./showimg/showmenu_tw.png)

---

## 🚀 極速安裝指南（獨立桌面版 IDE）

### 步驟 1：取得專案檔案（二選一）

- **方法 A（推薦：直接下載 ZIP）**：
  1. 點擊本頁右上角綠色按鈕 **`Code`** → 選擇 **`Download ZIP`**。
  2. 解壓縮至電腦任意資料夾（例如「下載」資料夾）。

- **方法 B（Git 複製）**：
  ```bash
  git clone https://github.com/atonnyshen/antigravity2-TW.git
  cd antigravity2-TW
  ```

### 步驟 2：執行一鍵套用

先安裝 **Node.js 22.12.0 以上**，並確認 `node`、`npm` 可執行。安裝入口會執行 `npm ci --ignore-scripts`，依 `package-lock.json` 安裝固定版本的依賴。直接使用引擎前也須執行此指令。背景守護不會呼叫 `npx` 或臨時下載程式。

1. **完全關閉** Antigravity 應用程式。
2. 進入解壓後的資料夾：
   - **macOS 使用者**：點兩下執行 **`點兩下安裝繁體中文.command`**。
   - **Windows 使用者**：點兩下執行 **`點兩下安裝繁體中文.bat`**。
3. 依提示選擇左上角品牌呈現方式（直接按 Enter 預設保留官方英文 `Antigravity`）。
4. 重新啟動 Antigravity，即可進入全繁體中文（台灣）開發環境！

---

## 📊 版本與架構支援說明

Google Antigravity 發展歷程中包含不同產品形態，本專案的支援範疇與邊界說明如下：

| 版本／形態 | 架構類型 | 應用程式路徑／識別名稱 | 繁體中文支援狀態 | 說明與建議 |
| :--- | :--- | :--- | :---: | :--- |
| **Antigravity 2.0 桌面端** | 獨立 Electron 客戶端 | `/Applications/Antigravity.app`<br>`Programs\Antigravity` | **主要支援** | 依字典翻譯介面並提供背景守護；官方新增介面可能仍有漏譯。2.17.0 已做本機隔離重建測試。 |
| **Antigravity 1.0 桌面端** | 舊版 VS Code Fork 客製 IDE | `/Applications/Antigravity IDE.app`<br>`Programs\Antigravity` | **基礎相容（建議升級）** | 早期 HTML 腳本注入架構。本專案保留相容偵測邏輯，但因 Google 官方已停止維護 1.0 且全線轉移至 2.0，強烈建議使用者升級至 2.0 取得完整繁中體驗。 |
| **VS Code 官方外掛** | VS Code 擴充套件（`google.google-antigravity`） | `~/.vscode/extensions/google.google-antigravity-*` | **已停止支援** | 核心設定與對話側邊欄由本地閉源二進位檔（`agy`）動態透過 iframe 輸出，無法全介面繁中化，且背景連線易受干擾。專案已全面終止支援。 |

---

## 💻 關於 VS Code 擴充套件的停止支援說明

若您先前曾在 Visual Studio Code 中安裝過本專案的擴充套件中文化：

1. **停止支援原因**：
   - Antigravity VS Code 擴充套件核心對話介面與設定面板，底層係由 Google 本機執行檔（`~/.gemini/bin/agy`）透過動態 HTTP 服務及 iframe 渲染，受限於同源安全政策無法達成真正全介面繁中化。
   - 雙重背景服務與帳號切換外掛（例如 Cockpit）可能造成 Token 遺失或觸發 WebSocket 連線逾時，增加使用不穩定性。
2. **還原官方英文方法**：
   - **macOS 使用者**：點兩下執行 **`點兩下還原VSCode擴充官方英文.command`**（或於終端機執行 `node localize_vscode_extension.js --restore`）。
   - **Windows 使用者**：點兩下執行 **`點兩下還原VSCode擴充官方英文.bat`**（或於命令提示字元執行 `node localize_vscode_extension.js --restore`）。
   - 執行後將還原官方原版 `package.json` 與 `extension.js`，重啟 VS Code 即可乾淨復原。

---

## 🛡️ 背景自動更新守護（有更新自動重套，支援 macOS / Windows）

Antigravity 官方更新會覆蓋資源檔。守護程式偵測變更後重套繁中，結果寫入日誌。已處理的檔案會記錄雜湊；引擎或字典修訂後也會重新套用。

### 🍎 macOS 使用者

系統服務需要管理員認證，並使用 nodejs.org 官方獨立 Node.js 套件的 `/usr/local/bin/node`。安裝器將程式、Node 與鎖定依賴複製到 root 擁有的 `/Library/Application Support/Antigravity2TW/runtime.*`，不讓常駐 root 服務執行工作區中可隨時改寫的程式。

觸發方式是載入服務、應用程式路徑變更，以及每 **5 分鐘**巡檢。檔案須先穩定，才會開始建置。服務只處理 `/Applications` 內的 Antigravity 2.x；家目錄安裝與 1.x 請手動套用。更新本儲存庫後，須重新執行安裝器才能更新受保護副本。

若日誌出現 `EPERM` 或 `Operation not permitted`，檢查「系統設定 → 隱私權與安全性 → App 管理」的實際授權提示。root 不保證繞過 macOS 保護；服務註冊成功也不代表套用成功。

- **啟用背景自動守護**（一行指令自動下載與註冊）：
  ```bash
  curl -fsSL https://raw.githubusercontent.com/atonnyshen/antigravity2-TW/main/install_macos_autowatcher.sh | bash
  ```
  *(若已下載本專案，亦可直接點兩下執行 **`點兩下安裝macOS背景守護.command`**)*
- **卸載背景守護**（停止服務，保留設定、程式與日誌供復原）：
  ```bash
  sudo bash uninstall_macos_autowatcher.sh
  ```
  *(若已下載本專案，亦可直接點兩下執行 **`點兩下卸載macOS背景守護.command`**)*

在本專案目錄執行卸載指令。檢查服務與最近結果：

```bash
launchctl print system/com.antigravity.autolocalize
tail -n 60 /Library/Logs/Antigravity2TW/autolocalize.log
```

確認 `last exit code = 0`，並查看「繁中套件已套用並驗證」或「已是目前版本」日誌。背景服務會自行結束，`state = not running` 不代表未註冊。還原官方英文前先停用守護，避免它再次套用。

---

### 🪟 Windows 使用者

工作排程每 **5 分鐘**巡檢一次，日誌位於專案的 `autolocalize.log`。若 Antigravity 安裝於受保護的 `Program Files`，仍須確認排程執行帳號的寫入權限。

- **一鍵安裝繁中環境**（PowerShell 一行指令）：
  ```powershell
  irm https://raw.githubusercontent.com/atonnyshen/antigravity2-TW/main/install_windows.ps1 | iex
  ```
- **啟用背景自動守護**（註冊 Windows 工作排程，自動巡檢重套）：
  ```powershell
  irm https://raw.githubusercontent.com/atonnyshen/antigravity2-TW/main/install_windows_autowatcher.ps1 | iex
  ```
  *(若已下載本專案，亦可點兩下執行 **`點兩下安裝Windows背景守護.bat`**)*
- **一鍵卸載背景守護**（移除 Windows 排程工作）：
  ```powershell
  irm https://raw.githubusercontent.com/atonnyshen/antigravity2-TW/main/uninstall_windows_autowatcher.ps1 | iex
  ```
  *(若已下載本專案，亦可點兩下執行 **`點兩下卸載Windows背景守護.bat`**)*

---

## 🔄 一鍵還原官方英文

若需隨時還原至官方原版英文狀態：

### 1. 桌面版 IDE 還原：
- **macOS 使用者**：點兩下執行 **`點兩下還原官方英文.command`**。
- **Windows 使用者**：點兩下執行 **`點兩下還原官方英文.bat`**。

### 2. VS Code 官方擴充套件還原：
- **macOS 使用者**：點兩下執行 **`點兩下還原VSCode擴充官方英文.command`**。
- **Windows 使用者**：點兩下執行 **`點兩下還原VSCode擴充官方英文.bat`**。

### 3. 背景自動守護卸載：
- **macOS 使用者**：點兩下執行 **`點兩下卸載macOS背景守護.command`**（或執行上方終端機卸載指令）。
- **Windows 使用者**：點兩下執行 **`點兩下卸載Windows背景守護.bat`**（或執行上方 PowerShell 卸載指令）。

備份檔完好保存，執行還原腳本即可迅速恢復官方原版英文狀態。

---

## 🤝 致謝與開源聲明

開發者驗證：執行 `npm ci --ignore-scripts` 與 `npm test`。GitHub Actions 在 macOS、Windows 與 Linux 跑回歸測試；測試不代表已驗證真實 Windows 排程或每個官方版本的介面。

- 特別感謝 [qqxpee/antigravity2-cn](https://github.com/qqxpee/antigravity2-cn) 原作者的開源貢獻與 ASAR 注入架構設計。
- 本儲存庫為個人使用與分享版本，主要維護繁體中文語境字典與自動更新腳本。
- 若使用時發現漏譯或語意不順的詞條，歡迎隨時提交 Issue 或 PR 共同補充！
