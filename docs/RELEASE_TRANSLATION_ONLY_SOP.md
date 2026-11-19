# antigravity2-TW｜v3.7.2 起純翻譯 Release 發布規範

**狀態：候選流程。未通過完整驗收前不得發布。**

## 不可違反的發布規則

公開 `v3.7.1` 的守護程式可能從 GitHub Release Assets 選取**任意 ZIP**，並嘗試完整程式自我升級：優先匹配 `/^antigravity2-TW-.*\.zip$/i`，找不到時後備匹配 `/\.zip$/i`。因此，**把完整程式 ZIP 改名為 `manual-setup.zip` 完全不能規避舊版行為**。

- 每次新 Release 的 **Assets 只上傳一個** `antigravity2-TW-translations-vX.Y.Z.zip`（純字典及非執行型 manifest），不得夾帶其他 ZIP。
- 不將完整程式、安裝器或執行腳本打包成 Release Asset。程式手動安裝請使用 GitHub 在該版本頁面自動生成的 **Source code (zip)**，或直接從對應 Git 標籤 clone。Source code (zip) 是 GitHub 的 `zipball_url`，**不是** `assets[]` 項目。
- 舊版 v3.7.1 守護程式可能誤下載翻譯 ZIP，但它缺少完整程式要求的 `package.json`，因此更新流程會拒絕套用並記錄錯誤；**舊版不會因此獲得新字典**。必須向讀者明確告知：需要先**手動安裝新版程式一次**，才會具備純翻譯自動更新能力。
- GitHub Release 必須先以 **draft** 形式完成內容與資產驗證，然後才能正式發布。不得直接把完整程式 ZIP 附件上傳到已公開的 Release。

## 發布者操作（手動、不得無人值守發布）

1. 確認最新程式版本、字典、相容性範圍和完整回歸測試。
2. 使用 `node scripts/build_translation_pack.js --version X.Y.Z --min-engine X.Y.Z --max-engine X.Y.Z --output dist/antigravity2-TW-translations-vX.Y.Z.zip` 產生純翻譯資料包。請根據**實測過的**引擎版本指定 min/max，勿自動假定所有新版引擎相容。
3. 確認對應的 Git 標籤包含可手動安裝的完整原始碼，並先進行隔離解壓與最小手動安裝測試。
4. 使用 `gh release create vX.Y.Z --draft --title ... --notes-file ... dist/antigravity2-TW-translations-vX.Y.Z.zip` 建立未公開草稿。正式版號與內容須先獲人工批准。
5. **發布前閘門**：執行以下指令（`vX.Y.Z` 換成草稿標籤），只有退出碼為 0 才能繼續：

   ```bash
   gh api repos/atonnyshen/antigravity2-TW/releases/tags/vX.Y.Z |
     node scripts/check_release_assets.js vX.Y.Z
   ```

   檢查器拒絕：非 draft、版本錯誤、非唯一純翻譯 ZIP、SHA-256 digest 缺失、未上傳完成或空檔。它核對的是 GitHub API 的 **實際 Release 資產清單**，不是本機預計上傳的檔名。
6. 再以 GitHub API 提供的 `assets[].digest` 對帳本機翻譯 ZIP 的 SHA-256，確認內容相同。核對 Source code (zip) 的安裝方式與 Release Notes 告知內容。
7. 經人工核准後才以 `gh release edit vX.Y.Z --draft=false` 發布，並立即唯讀重新核對發布後的資產清單。不得因為檢查器通過，就省略人工發布核准。

## 不符合即停止發布

- 發現任何非純翻譯 ZIP 資產。
- 舊版自動更新器能成功通過完整程式套件驗證。
- 缺少 GitHub SHA-256 digest，或本機雜湊不一致。
- 原生 macOS／Windows 隔離測試或官方版本重套驗證尚未達要求。
- README 的手動下載說明仍指向只能給背景守護使用的純翻譯 ZIP。

此流程可減少舊版守護誤升級的風險，但不能改寫已在用戶電腦上執行的 v3.7.1；其行為須由隔離重現證明。
