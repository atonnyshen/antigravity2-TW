# Antigravity 2.0 繁體中文套件 — AI 助手安裝導引（AI Install Playbook）

> 本手冊隨套件附帶於壓縮檔與 Git 存放庫根目錄。
> **給正在閱讀本文件的 AI 助手**：請**嚴格依序**執行以下兩個階段。**在完成「第一階段：唯讀檢查」並由使用者明確回覆選項前，請勿修改任何系統或 Antigravity 應用程式檔案。**

---

## 表達與安全規則（執行前必讀）

1. **老嫗能解＋精準專業原則**：向使用者回報環境檢查、安全掃描與 1～4 選項時，**先講白話結果，再以精簡括號交代真實機制**（例如點出「5 分鐘偵測官方改版」、「24 小時比對純翻譯包＋SHA-256 校驗」、「不更動可執行程式」、「同步基準版本以防回滾」），讓新手看得懂、專業人員也能核對授權邊界；**對使用者對話時，避免直接拋出未解釋的 CLI 參數**（如 `--brand-title english`、`--no-kill`、`--sync-watcher`），參數由 AI 在背景執行即可。
2. **避免誤關正在對話的視窗**：只要偵測到系統正在執行 `Antigravity`（或你正透過 Antigravity 內建對話協助操作），呼叫 `localization_engine.js` 時**務必加上 `--no-kill`**，改為完成後請使用者手動完整重啟。
3. **禁止覆寫備份以外的官方檔**：本套件僅透過原生 ASAR 引擎補丁 `resources/app.asar`，並以原子寫入備份官方原版為 `app.asar.bak`。
4. **品牌名稱預設值**：除非使用者另有指定，一律加上 `--brand-title english`，保留左上角官方英文 `Antigravity`。

---

## 第一階段：唯讀檢查（不修改任何檔案）

請先執行唯讀檢視並整理簡潔摘要給使用者：

1. **檢查執行環境**：
   - 辨識作業系統（macOS 或 Windows）與 CPU 架構。
   - 檢查 Node.js 版本（`node -v`），確認為 **v22.12.0 以上**。若未安裝或版本過舊，先停下來以白話引導至 [Node.js 官網](https://nodejs.org/) 下載 LTS 安裝包（提示安裝時維持預設一路下一步）後再繼續。
   - 檢查目前系統是否正在執行 Antigravity（若在執行中，後續指令一律帶 `--no-kill`）。
   - 確認 Antigravity 安裝路徑與寫入權限：
     - **macOS**：檢查 `/Applications/Antigravity.app`、`~/Applications/Antigravity.app` 等路徑的 `Contents/Resources/app.asar`。
     - **Windows**：檢查 `%LOCALAPPDATA%\Programs\antigravity`、`%LOCALAPPDATA%\Programs\Antigravity IDE`、`C:\Program Files\Antigravity`、`C:\Program Files (x86)\Antigravity` 等路徑的 `resources\app.asar`（若位於 `Program Files`，預告寫入時需要 Windows UAC 授權）。
2. **唯讀安全掃描**：
   - 快速檢視本資料夾的 `package.json`、`localization_engine.js`、`auto_localize_watcher.js`、`src/` 及 `.bat`／`.ps1`／`.command`／`.sh` 腳本，確認：
     - 執行期零外部相依套件（無須 `npm ci`）。
     - 無遠端下載執行腳本（無 `irm | iex`）、無任何 `.dll` 側載模組或 `config.json`。
     - 僅在啟用「背景自動維護」時，每 24 小時查詢 GitHub 純翻譯發布，只套用通過 SHA-256 與版本區間校驗的字典與規則資料；不會自動下載可執行程式碼，也不上傳任何本機資料。
3. **向使用者回報並提供選項（簡短明確、專業不艱澀）**：
   先用數行條列檢查與安全結果（作業系統／Node.js／Antigravity 路徑與執行狀態／安全掃描結論），接著**直接提供以下 1～4 選項**請使用者回覆數字：

   ```text
   已完成環境檢查與安全掃描（執行期零外部依賴、無異常外連腳本），請直接回覆數字 1～4 選擇你要的做法：

   1. 安裝繁體中文 ＋ 啟用背景自動維護（推薦）
      先將介面中文化，並註冊系統背景排程（每 5 分鐘偵測官方改版並自動重套繁中；每 24 小時檢查遠端純翻譯包，通過 SHA-256 校驗後自動更新詞庫，不含可執行程式，軟體本體新功能仍須手動更新）。
   2. 只安裝這一次繁體中文（不另外新增背景排程）
      只修改目前的介面檔案；日後若官方改版變回英文，再手動執行安裝即可。（若本機先前已啟用過背景自動維護，本次會同步刷新該排程的基準版本與快照，避免數分鐘內被舊版覆蓋回滾；欲停用排程請選 4 或單獨卸載。）
   3. 只看檢查結果，這次先不修改任何檔案
   4. 關閉背景自動維護，並恢復官方原版英文

   小提醒：預設會保留左上角官方英文「Antigravity」標題；若想一併改為中文或隱藏，回覆數字時告訴我即可。
   ```

---

## 第二階段：依使用者選擇精準執行

收到使用者明確選擇後，進入專案目錄執行對應指令：

### 選項 `1`：安裝繁體中文 ＋ 啟用背景自動維護
- **步驟 A（套用繁中並同步既有背景排程基準）**：
  ```bash
  node localization_engine.js --tw --no-kill --sync-watcher --brand-title english
  ```
- **步驟 B（註冊或更新背景排程；使用者選 `1` 即同意每 5 分鐘本機巡檢與每 24 小時純翻譯包校驗更新，不升級任何程式本體）**：
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
*(本選項不會新增背景排程；若本機先前已啟用守護程序，仍會保留原有定期檢查，引擎會在權限允許時同步更新守護基準以避免回滾。若要完全停用背景排程，請選選項 `4` 或執行卸載腳本。)*

### 選項 `3`：僅做唯讀檢查
不執行任何寫入指令，結束任務。

### 選項 `4`：關閉背景自動維護並恢復官方原版英文
- **步驟 A（先移除背景排程，避免 5 分鐘內再次自動重套繁中）**：
  - **macOS**（若曾安裝系統級 `LaunchDaemon` 需搭配 `sudo`）：
    ```bash
    bash uninstall_macos_autowatcher.sh
    ```
  - **Windows**：
    ```powershell
    node auto_localize_watcher.js --uninstall-windows-task
    ```
- **步驟 B（以官方 `app.asar.bak` 原檔還原）**：
  ```bash
  node localization_engine.js --tw --no-kill --huifu
  ```

---

## 權限不足排錯與直接提權指引（遇 `EPERM`／`EACCES`／`Access is denied` 時）

**關鍵 UX 防呆**：切勿在未說明的情況下要使用者「去資料夾按右鍵以系統管理員身分執行」——新手常直接在 Antigravity IDE 側邊欄的檔案樹按右鍵，選單裡只有「Copy」而找不到管理員選項，導致卡關。

1. **Windows 遇權限不足或 `Access is denied`（首選：AI 直接呼叫 UAC 提權視窗，不讓使用者自行找檔案）**：
   - 先用白話告知使用者：「這一步需要 Windows 管理員授權才能完成寫入，等一下畫面會跳出系統『你要允許此 App 變更你的裝置嗎？』確認視窗，請點選『**是**』即可。」
   - 取得同意後，由 AI 透過 PowerShell 呼叫 `Start-Process` 搭配 `-Verb RunAs -Wait` 執行對應指令或 `.bat`，直接把 Windows 原生 UAC 視窗帶到最前，使用者只需點「是」即可接續完成。
   - 若環境不允許自動觸發 UAC、必須手動操作時，務必明確指引：「請點選螢幕最下方工作列的**黃色資料夾圖示（檔案總管）**進入下載資料夾，**不要在 Antigravity 視窗內點選**」，再對指定 `.bat` 按右鍵選擇「以系統管理員身分執行」。
   - **架構與權限邊界（`C:\Program Files\Antigravity`）**：背景排程刻意維持 `LeastPrivilege`（一般使用者權限）執行，不註冊長期高權限背景服務；若 Antigravity 安裝於受保護的 `Program Files`，須誠實告知使用者「之後官方改版重套時，可能仍須再手動授權一次」，不可為此將背景排程改成高權限。
2. **macOS 遇權限不足或 `Operation not permitted`**：
   - 系統級路徑若須執行 `sudo`，先說明需要輸入 Mac 登入密碼（輸入時螢幕不會顯示字元屬正常現象）。
   - 若仍遭系統阻擋，請引導打開「**系統設定 → 隱私權與安全性 → App 管理**」，確認終端機或編輯器權限已開啟。

---

## 完成回報

1. 先用兩三句白話總結結果（已完成繁中安裝／背景排程或還原狀態），再附上精簡的技術確認與日誌路徑供查核（macOS：`/Library/Logs/Antigravity2TW/autolocalize.log` 或 `~/Library/Logs/Antigravity2TW/autolocalize.log`；Windows：專案資料夾內的 `autolocalize.log`）。
2. **明確提醒完整重啟**：引導使用者**完全關閉 Antigravity 再重新開啟**——Mac 請按 `Cmd + Q` 或點左上角選單「結束 Antigravity」（不能只關視窗）；Windows 請關閉視窗並確認右下角系統匣沒有殘留圖示後再重開，重開後即套用新介面。
