# Antigravity 2.0 繁體中文套件 — AI 助手安裝導引（AI Install Playbook）

> 本手冊隨套件附帶於壓縮檔與 Git 存放庫根目錄。
> **給正在閱讀本文件的 AI 助手**：請**嚴格依序**執行以下兩個階段。**在完成「第一階段：唯讀檢查」並由使用者明確回覆選項前，請勿修改任何系統或 Antigravity 應用程式檔案。**

---

## 語氣與安全規則（執行前必讀）

1. **小白友善回報原則**：向使用者回報檢查結果與選項時，請全部使用**一般人一看就懂的白話繁體中文**。**不要對使用者顯示內部指令參數或工程術語**（例如不要露出 `--brand-title english`、`--no-kill`、`app.asar`、`刷新守護快照以防回滾`、`ASAR`、`LaunchDaemon`、`irm | iex`），這些指令與安全細節由你在背景執行和驗證即可。
2. **避免誤關正在對話的視窗**：只要偵測到系統正在執行 `Antigravity`（或你正透過 Antigravity 內建對話協助操作），呼叫 `localization_engine.js` 時**務必加上 `--no-kill`**，改為完成後請使用者手動重啟。
3. **禁止覆寫備份以外的官方檔**：本套件僅透過原生補丁更新 `resources/app.asar`，並自動將官方原版備份為 `app.asar.bak`。
4. **品牌名稱預設值**：除非使用者另有指定，一律加上 `--brand-title english`，保留左上角官方英文 `Antigravity`。

---

## 第一階段：唯讀檢查（不修改任何檔案）

請先執行唯讀檢視並用白話整理摘要給使用者：

1. **檢查執行環境**：
   - 辨識作業系統（macOS 或 Windows）與 CPU 架構。
   - 檢查 Node.js 版本（`node -v`），確認為 **v22.12.0 以上**。若未安裝或版本過舊，先停下來，用白話提供 [Node.js 官網下載連結](https://nodejs.org/) 引導安裝（說明「下載 LTS 版本後一路點下一步即可」）再繼續。
   - 檢查目前系統是否正在執行 Antigravity（若在執行中，後續指令一律帶 `--no-kill`）。
   - 確認 Antigravity 安裝路徑與寫入權限：
     - **macOS**：檢查 `/Applications/Antigravity.app`、`~/Applications/Antigravity.app` 等路徑的 `Contents/Resources/app.asar`。
     - **Windows**：檢查 `%LOCALAPPDATA%\Programs\antigravity`、`%LOCALAPPDATA%\Programs\Antigravity IDE`、`C:\Program Files\Antigravity`、`C:\Program Files (x86)\Antigravity` 等路徑的 `resources\app.asar`（若位於 `Program Files`，預告等一下可能會跳出系統確認視窗）。
2. **唯讀安全掃描**：
   - 快速檢視本資料夾的 `package.json`、`localization_engine.js`、`auto_localize_watcher.js`、`src/` 及 `.bat`／`.ps1`／`.command`／`.sh` 腳本，確認執行期零外部依賴、無可疑遠端下載執行指令（無 `irm | iex`）、無任何 `.dll` 側載模組或 `config.json`；僅在開啟「自動保持中文」時，每 24 小時檢查 GitHub 翻譯更新，只下載經驗證的翻譯字詞資料，不上傳本機資料。
3. **向使用者回報並提供選項（務必保持簡短、白話、可直接選擇）**：
   用 3～5 句清楚說明檢查與安全結果（例如「已確認電腦環境與檔案安全，沒有風險」），接著**直接呈現以下 1～4 選項**請使用者回覆數字：

   ```text
   請直接回覆數字 1～4 選擇你要的做法：

   1. 安裝繁體中文 ＋ 自動保持中文（推薦）
      以後官方改版變回英文時，會自動在背景幫你變回繁體中文，也會自動同步最新翻譯字詞（每 5 分鐘檢查一次，程式新功能仍須手動更新）。
   2. 只安裝這一次繁體中文
      只把目前的介面改成繁體中文；不會新增自動排程（若電腦以前已開過「自動保持中文」，會順便更新設定，不會覆蓋這次的翻譯）。
   3. 只看檢查結果，這次先不修改
   4. 關閉自動保持中文，並恢復成原本的英文版

   小提醒：預設會保留左上角原本的「Antigravity」英文字樣，如果你也想一起改成中文再告訴我。
   ```

---

## 第二階段：依使用者選擇精準執行

收到使用者明確選擇後，進入專案目錄執行對應指令：

### 選項 `1`：安裝繁體中文 ＋ 自動保持中文
- **步驟 A（套用繁中並同步既有設定）**：
  ```bash
  node localization_engine.js --tw --no-kill --sync-watcher --brand-title english
  ```
- **步驟 B（啟用自動保持中文；使用者選 `1` 即同意每 5 分鐘檢查官方變動並自動更新相容翻譯）**：
  - **macOS**：
    ```bash
    bash install_macos_autowatcher.sh
    ```
  - **Windows**：
    ```powershell
    node auto_localize_watcher.js --install-windows-task
    ```

### 選項 `2`：只安裝這一次繁體中文
```bash
node localization_engine.js --tw --no-kill --sync-watcher --brand-title english
```
*(本選項不會新增背景守護；若本機之前已開啟自動保持中文，仍會保留原有排程與同步翻譯，要完全停用請選選項 `4` 或單獨卸載。)*

### 選項 `3`：只看不改
不執行任何寫入指令，結束任務。

### 選項 `4`：關閉自動保持中文並恢復成英文版
- **步驟 A（先關閉背景排程，避免 5 分鐘內再次自動改回中文）**：
  - **macOS**（若曾安裝系統級服務需搭配 `sudo`）：
    ```bash
    bash uninstall_macos_autowatcher.sh
    ```
  - **Windows**：
    ```powershell
    node auto_localize_watcher.js --uninstall-windows-task
    ```
- **步驟 B（還原官方原版英文）**：
  ```bash
  node localization_engine.js --tw --no-kill --huifu
  ```

---

## 權限不足排錯與自動提權指引（遇 `EPERM`／`EACCES`／`Access is denied` 時）

**重要 UX 原則**：千萬不要只叫新手「去資料夾按右鍵以系統管理員身分執行」——使用者常常會在 Antigravity 軟體右側的檔案列表裡按右鍵，只看得到「Copy」，因而卡關。

1. **Windows 遇權限不足或 `Access is denied`（首選：直接彈出系統確認視窗，不讓使用者找檔案）**：
   - 先用白話告知使用者：「這一步需要 Windows 授權才能寫入，我會讓系統跳出確認視窗，畫面出現時請點『**是**』即可。」
   - 取得使用者同意後，由 AI 直接透過 PowerShell 呼叫 `Start-Process` 的 `-Verb RunAs -Wait` 執行對應 `.bat` 或系統指令，讓 Windows 原生 UAC「是／否」對話框直接跳到最上層，使用者點一下「是」就能繼續完成，無須自己翻找資料夾。
   - 僅當系統無法彈出 UAC 視窗、非得請使用者手動點擊時，**務必明確寫「請點螢幕最下方工作列的黃色資料夾圖示（檔案總管），不要在 Antigravity 視窗裡面點選」**。
   - **補充限制（`C:\Program Files\Antigravity`）**：背景排程固定維持標準使用者最低權限（`LeastPrivilege`）；若 Antigravity 安裝在受保護的 `Program Files`，請誠實告知使用者「後續官方改版時，可能需要再授權一次才能覆寫」，不可為此將背景排程改成高權限執行。
2. **macOS 遇權限不足或 `Operation not permitted`**：
   - 系統級路徑若需輸入電腦登入密碼（`sudo`），用白話引導輸入密碼（輸入時螢幕不會顯示星號是正常的）。
   - 若仍被系統擋住，請引導打開「**系統設定 → 隱私權與安全性 → App 管理**」，開啟終端機或編輯器的權限開關。

---

## 完成回報

1. 用白話回報結果：清楚說明已完成哪一項動作（以及是否有開啟自動保持中文），技術日誌位置僅附在最後當作備註（macOS：`/Library/Logs/Antigravity2TW/autolocalize.log` 或 `~/Library/Logs/Antigravity2TW/autolocalize.log`；Windows：專案資料夾內的 `autolocalize.log`）。
2. **提醒重新啟動**：用清楚的動作引導使用者**完全關閉 Antigravity 再重新打開**——Mac 請按 `Cmd + Q` 或點左上角選單「結束 Antigravity」；Windows 請先關掉視窗，並確認螢幕右下角工具列沒有殘留圖示後再重開，即可看到繁體中文介面。
