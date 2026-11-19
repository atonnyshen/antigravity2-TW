# Antigravity 2.0 繁體中文套件 — AI 助手標準安裝手冊（AI Install Playbook）

> 本手冊隨套件附帶於壓縮檔與 Git 存放庫根目錄。
> **給正在閱讀本文件的 AI 助手**：請**嚴格依序**執行以下兩個階段。**在完成「第一階段：唯讀檢查」並由使用者明確回覆選項前，請勿修改任何系統或 Antigravity 應用程式檔案。**

---

## 安全規則（執行前必讀）

1. **避免誤關正在對話的視窗**：只要偵測到系統正在執行 `Antigravity`（或你正透過 Antigravity 內建對話協助操作），呼叫 `localization_engine.js` 時**務必加上 `--no-kill`**，改為完成後請使用者手動重啟。
2. **禁止覆寫備份以外的官方檔**：本套件僅透過原生 ASAR 引擎補丁 `resources/app.asar`，並自動將官方原版備份為 `app.asar.bak`。
3. **品牌名稱預設值**：除非使用者另有指定，一律加上 `--brand-title english`，保留左上角官方英文 `Antigravity`。

---

## 第一階段：唯讀檢查（不修改任何檔案）

請先執行唯讀檢視並整理摘要給使用者：

1. **檢查執行環境**：
   - 辨識作業系統（macOS 或 Windows）與 CPU 架構。
   - 檢查 Node.js 版本（`node -v`），確認為 **v22.12.0 以上**。若未安裝或版本過舊，先停下來以白話引導使用者至 <https://nodejs.org/> 安裝後再繼續。
   - 檢查目前系統是否正在執行 Antigravity（若在執行中，後續指令一律帶 `--no-kill`）。
   - 確認 Antigravity 安裝路徑與寫入權限：
     - **macOS**：檢查 `/Applications/Antigravity.app`、`~/Applications/Antigravity.app` 等路徑的 `Contents/Resources/app.asar`。
     - **Windows**：檢查 `%LOCALAPPDATA%\Programs\antigravity`、`%LOCALAPPDATA%\Programs\Antigravity IDE`、`C:\Program Files\Antigravity`、`C:\Program Files (x86)\Antigravity` 等路徑的 `resources\app.asar`（若位於 `Program Files`，預告可能需要系統管理員權限）。
2. **唯讀安全掃描**：
   - 快速檢視本資料夾的 `package.json`、`localization_engine.js`、`auto_localize_watcher.js`、`src/` 及 `.bat`／`.ps1`／`.command`／`.sh` 腳本，確認：
     - 執行期零外部依賴（使用者端無須跑 `npm ci`）。
     - 無可疑遠端下載執行指令（無 `irm | iex`）、無任何 `.dll` 側載模組或 `config.json`。
     - 僅在啟用背景守護時，每 24 小時檢查 GitHub 翻譯發布，可能下載經驗證的純翻譯資料包；不自動下載執行程式碼，也不上傳本機資料。
3. **向使用者回報並提供選項**：
   用簡明繁體中文列出環境檢查與安全確認結果，接著請使用者直接回覆數字 **1～4**：
   - **`1` 安裝繁體中文並啟用背景守護（同意每 5 分鐘巡檢官方更新，並自動取得與套用經驗證、相容的純翻譯資料；程式功能仍須手動更新）**
   - **`2` 僅安裝繁體中文（若本機曾裝過背景守護，引擎會自動同步刷新守護快照以防回滾）**
   - **`3` 只看檢查結果，暫不修改**
   - **`4` 卸載背景自動守護並還原官方原版英文**

---

## 第二階段：依使用者選擇精準執行

收到使用者明確選擇後，進入專案目錄執行對應指令：

### 選項 `1`：安裝繁體中文 + 啟用背景守護
- **步驟 A（套用繁中並同步既有背景守護快照）**：
  ```bash
  node localization_engine.js --tw --no-kill --sync-watcher --brand-title english
  ```
- **步驟 B（啟用或更新背景守護；使用者選擇此項即授權每 5 分鐘巡檢，以及每 24 小時自動取得相容翻譯資料，不升級任何程式功能）**：
  - **macOS**：
    ```bash
    bash install_macos_autowatcher.sh
    ```
  - **Windows**：
    ```powershell
    node auto_localize_watcher.js --install-windows-task
    ```

### 選項 `2`：僅安裝繁體中文
```bash
node localization_engine.js --tw --no-kill --sync-watcher --brand-title english
```
*(本選項不會新增背景守護；若本機已安裝守護程序，仍會繼續定期重套中文化及自動取得翻譯資料。要完全停止背景更新，請另外卸載守護程序。安裝器僅會在鎖定與權限允許時同步既有守護副本。)*

### 選項 `3`：僅做唯讀檢查
不執行任何寫入指令，結束任務。

### 選項 `4`：卸載背景守護並還原官方英文
- **步驟 A（先卸載背景守護，避免 5 分鐘內再次自動中文化）**：
  - **macOS**（若曾安裝系統級 `LaunchDaemon` 需搭配 `sudo`）：
    ```bash
    bash uninstall_macos_autowatcher.sh
    ```
  - **Windows**：
    ```powershell
    node auto_localize_watcher.js --uninstall-windows-task
    ```
- **步驟 B（還原官方 `app.asar.bak`）**：
  ```bash
  node localization_engine.js --tw --no-kill --huifu
  ```

---

## 權限不足排錯指引（遇 `EPERM`／`EACCES` 時使用）

- **Windows**（常見於 `C:\Program Files\Antigravity`）：請使用者在專案資料夾內對對應的 `.bat`（例如 `點兩下安裝繁體中文.bat` 或 `點兩下安裝Windows背景守護.bat`）按右鍵，選擇「**以系統管理員身分執行**」，或以系統管理員身分開啟終端機重跑指令。
- **macOS**：系統級路徑需要輸入本機管理員密碼（`sudo`）；若仍遇 `Operation not permitted`，請引導使用者檢查「**系統設定 → 隱私權與安全性 → App 管理**」授權。

---

## 完成回報

1. 回報實際執行成功的動作與日誌路徑（macOS：`/Library/Logs/Antigravity2TW/autolocalize.log` 或 `~/Library/Logs/Antigravity2TW/autolocalize.log`；Windows：專案目錄下的 `autolocalize.log`）。
2. **提醒使用者**：請**完全結束並重新開啟 Antigravity**（macOS 請按 `Cmd+Q` 或從系統匣選擇「結束」，勿僅關閉視窗，以免舊程序仍駐留記憶體），即可看到套用後的新介面。
