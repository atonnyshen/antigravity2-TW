# antigravity2-TW｜v3.7.2 起純翻譯 Release 發布規範

**狀態：候選流程。未通過完整驗收前不得發布。**

## P0 安全修復驗收（必要）

正式背景守護的 ASAR 替換必須使用原生保留舊檔的原子操作：macOS `renamex_np(RENAME_SWAP)`（經 `scripts/atomic_asar_exchange.rb` 呼叫）、Windows `ReplaceFileW`（經 `scripts/atomic_asar_replace.ps1` 呼叫）；Linux 測試使用 `renameat2(RENAME_EXCHANGE)`。**不能降級為先算雜湊再盲目 `renameSync`**，因為 Google 官方 ShipIt 可能在兩步之間更新正式檔案。

- 建立或更新 `app.asar.bak` 必須採原子寫入，並且重新讀取確認 SHA-256 完整一致；備份失敗、磁碟空間不足或同步失敗一律中止套用
- 原子交換後必須核對被替換的 ASAR；若與原先雜湊不同，代表官方更新競爭，應優先恢復被置換的官方 ASAR，或保留其原始位元組與明確的人工修復提示，不能宣稱成功
- 官方更新與回退同時發生也必須接受反證測試；不能只驗證建置期間的雜湊
- 此設計只能在系統原生交換及儲存裝置正常運作時保證其對應的原子性。斷電、硬體故障與未支援的權限／檔案系統仍有殘餘風險，不可聲稱絕對可回復
- 發布前必跑 `npm test`、`node scripts/compare_dicts.js`、macOS Ruby helper 的隔離原生測試，以及 Windows GitHub Actions 回歸測試（含 PowerShell 原生替換）；不能以 Mac 虛擬 Windows 測試代替 Windows CI

## 不可違反的發布規則

公開 `v3.7.1` 的守護程式可能從 GitHub Release Assets 選取**任意 ZIP**，並嘗試完整程式自我升級：優先匹配 `/^antigravity2-TW-.*\.zip$/i`，找不到時後備匹配 `/\.zip$/i`。因此，**把完整程式 ZIP 改名為 `manual-setup.zip` 完全不能規避舊版行為**。

- 每次新 Release 的 **Assets 只上傳一個** `antigravity2-TW-translations-vX.Y.Z.zip`（純字典及非執行型 manifest），不得夾帶其他 ZIP。
- 不將完整程式、安裝器或執行腳本打包成 Release Asset。程式手動安裝請使用 GitHub 在該版本頁面自動生成的 **Source code (zip)**，或直接從對應 Git 標籤 clone。Source code (zip) 是 GitHub 的 `zipball_url`，**不是** `assets[]` 項目。
- 舊版 v3.7.1 守護程式可能誤下載翻譯 ZIP，但它缺少完整程式要求的 `package.json`，因此更新流程會拒絕套用並記錄錯誤；**舊版不會因此獲得新字典**。必須向讀者明確告知：需要先**手動安裝新版程式一次**，才會具備純翻譯自動更新能力。
- GitHub Release 必須先以 **draft** 形式完成內容與資產驗證，然後才能正式發布。不得直接把完整程式 ZIP 附件上傳到已公開的 Release。

## 發布者操作（手動、不得無人值守發布）

1. 確認最新程式版本、字典、相容性範圍和完整回歸測試。
2. 使用 `node scripts/build_translation_pack.js --version X.Y.Z --min-engine X.Y.Z --max-engine X.Y.Z --output dist/antigravity2-TW-translations-vX.Y.Z.zip` 產生純翻譯資料包。請根據**實測過的**引擎版本指定 min/max，勿自動假定所有新版引擎相容。
3. 確認對應的 Git 標籤包含可手動安裝的完整原始碼，並先進行隔離解壓與最小手動安裝測試。**Release 標籤必須指向本次 Actions 回歸測試實際檢查的相同 commit**，否則可能出現「純翻譯資產安全，但 GitHub Source code (zip) 仍是舊版程式」的漏洞。翻譯資料版號可以高於引擎版號，但 Actions 的 `engine_version` 必須與受測來源的 `package.json.version` 完全一致。
4. 使用 `gh release create vX.Y.Z --draft --title ... --notes-file ... dist/antigravity2-TW-translations-vX.Y.Z.zip` 建立未公開草稿。正式版號與內容須先獲人工批准。
5. **發布前閘門**：先把新版流程合併到 GitHub 預設分支，再從 Actions 手動執行 `Draft release preflight (never publishes)`，指定 `tag=vX.Y.Z`、`engine_version=X.Y.Z`。確認兩個工作階段全數通過，才允許進入人工發布程序。此工作流程**只讀取與下載檢查，不會發布或修改 Release**。由於 GitHub 的草稿只對具有 push 權限的主體可見，檢查草稿的工作階段必須具備 `contents: write` API 權限，但其腳本沒有任何寫入 Release 的命令。

   若改從本機執行等價檢查，請在有 Repository 推送權限的已登入帳號下執行：

   ```bash
   gh api --paginate 'repos/atonnyshen/antigravity2-TW/releases?per_page=100' \
     --jq '.[] | select(.tag_name == "vX.Y.Z")' |
     node scripts/check_release_assets.js vX.Y.Z \
       --file dist/antigravity2-TW-translations-vX.Y.Z.zip \
       --engine-version X.Y.Z
   ```

   檢查器拒絕：非 draft、版本錯誤、非唯一純翻譯 ZIP、SHA-256 digest 缺失、未上傳完成、空檔、GitHub 與本機 ZIP 雜湊不符、ZIP 混入程式碼、字典格式錯誤、引擎版本不相容。它核對的是 GitHub API 的**實際 Release 資產清單**與**本機實際 ZIP 內容**，不是單憑檔名驗收。Actions 另核對 Release 標籤 SHA 等於受測的 `GITHUB_SHA`。**本機等價指令未代替這一步；若只用本機指令，須先自行用 `git rev-parse 'vX.Y.Z^{commit}'` 與受測 commit 對帳。** `--engine-version` 必須指定已測試的目標引擎版本；不同引擎若需支援，應分別測試。
6. 上一步已核對 GitHub API `assets[].digest` 與實際 ZIP 的 SHA-256，仍須人工核對 Source code (zip) 的安裝方式及 Release Notes。**Actions 工作流程已加入候選原始碼，待合併到預設分支後才能手動啟動。通過紀錄是發布前的證據，但 Repository 管理者仍可從 GitHub 網站繞過這道流程直接發布，不能宣稱平台已設定無法繞過的政策閘門。**
7. 經人工核准後才以 `gh release edit vX.Y.Z --draft=false` 發布，並立即唯讀重新核對發布後的資產清單。不得因為檢查器通過，就省略人工發布核准。

## 不符合即停止發布

- 發現任何非純翻譯 ZIP 資產。
- 舊版自動更新器能成功通過完整程式套件驗證。
- 缺少 GitHub SHA-256 digest，或本機雜湊不一致。
- 尚未完成可重現的 macOS／Windows 隔離測試或依 Apple、Microsoft 官方執行規則的虛擬驗證。若實機不可得，須在 Release Notes 明示「實機尚未驗證」，標出已知的 `Program Files` 最低權限限制與手動安裝替代方式；經人工評估接受後，才可視為有條件放行，**不能把虛擬測試寫成實機 PASS**。
- README 的手動下載說明仍指向只能給背景守護使用的純翻譯 ZIP。

此流程可減少舊版守護誤升級的風險，但不能改寫已在用戶電腦上執行的 v3.7.1；其行為須由隔離重現證明。注意 GitHub REST `/releases/tags/{tag}` 文件描述的是已發布版本，**草稿請用 Releases 清單查詢**，不可把查詢發布版的接口當成草稿驗收證據。
