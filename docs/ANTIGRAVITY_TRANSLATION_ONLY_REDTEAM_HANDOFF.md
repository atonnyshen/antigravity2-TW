# antigravity2-TW｜翻譯資料自動更新架構：Antigravity 獨立紅隊驗收提示詞

## 任務與唯一標的
請擔任獨立紅隊審計官，對 `/Users/atonny/工作區/antigravity2-TW` 的 `fix/v3.7.1-redteam-hardening` 分支執行對抗式審查。以發布標籤 `v3.7.1` 為基線，實際閱讀 `git diff v3.7.1...HEAD` 和完整程式碼。必須重新核對 HEAD 與當期測試數字；不可沿用舊報告的 `cad5238`、`14dc109` 或「65/65」「69/69」當成最新狀態。

## 已裁決的產品政策（不可擅自改回複雜設定）
1. 使用者只需要選擇「是否安裝背景守護程序」。啟用守護即明確同意每五分鐘檢查官方 Antigravity 更新，且約每 24 小時自動檢查、下載並套用相容的**純翻譯資料**。
2. **無任何翻譯更新開關、off/notify/translations 模式，亦無相關持久化政策檔。** 停用自動翻譯更新的正式方式是卸載守護程序；單次手動安裝中文化不新增守護程序。
3. **程式功能永不自動升級。** 不允許 `selfUpdateWatcher`、`applySelfUpdateAtomic` 或等價的更新引擎／守護 JS／腳本／其他可執行程式碼的遠端路徑。
4. 只有 `dicts/` 與 `dicts_tw/`、必要的非執行型 JSON manifest 可作為遠端翻譯包。以已簽核的發布端相容性範圍、Release 資產 SHA-256、字典一致性與安全解壓結果為准入條件。
5. 遇到不相容、下載失敗、Release 未提供純翻譯包或驗證不過時應 fail closed，保留目前可運作的版本，記錄需要手動升級的事實。不得宣稱字典能處理所有 Electron、主程序或 DOM 結構變化。

## 先做的唯讀驗證
- 檢查 `scripts/auto_updater.js` 是否已真正**移除**程式自我升級函式、管理檔案清單與所有對外 API，並確定無其他等價可執行更新入口。
- 檢查 `auto_localize_watcher.js` 是否移除 `readUpdateMode`、`setUpdateMode`、`--update-policy` 與三段式邏輯。檢查沒有守護程序時不會憑空建立排程。
- 檢查 `install_macos_autowatcher.sh`、`install_windows_autowatcher.ps1`、`AI_INSTALL_GUIDE.md`、`README.md`、`README_TW.md`：必須在使用者授權啟用前明確告知**自動取得翻譯資料**，停用方式是卸載守護；不得有互相矛盾的選項。
- 審查 `scripts/build_translation_pack.js`、`scripts/auto_updater.js`、`localization_engine.js` 的版本配對：翻譯資料版本可以高於引擎版本，且最新已套用翻譯版本必須作為下次遠端比較基準。翻譯資料應以快照方式提交，具失敗回退能力。
- 對 ZIP Slip、符號連結、local/central header 不一致、超大與加密 ZIP、偽造或缺少 digest、GitHub 非預期重新導向、套件內混入 JS、引擎不相容、不合法字典、版本倒退、競態搶鎖、寫入權限提升進行反證測試。
- 複核 Slash 指令、Thinking Effort 標籤及台灣繁體中文 L0 體例，不因更新翻譯資料而失守。
- 在 macOS 真實 launchd 與 Windows 工作排程的條件可用時進行隔離測試，包含一般使用者權限、`Program Files` 權限不足情境。不可把模擬測試冒充實機驗證。
- **更正上一輪紅隊過度推論**：macOS 安裝腳本在官方 App 不可寫時仍可能明確呼叫 `sudo` 安裝 LaunchDaemon，不能宣稱一般使用者一律使用 LaunchAgent。Windows `LeastPrivilege` 排程即使由管理員註冊，也不保證可修改 `Program Files`。需以真實權限測試區分安全性與自動重套可用性。
- **新增回退驗收**：純翻譯包下載成功後，如重新套用 ASAR 失敗，應恢復先前有效的 `active_translation.json`（或刪除首次更新指標），不能將「通過字典格式驗證」誤當成「已成功套用與可完整回退」。再檢查最終 ASAR 與備份狀態。
- **原子性與災難恢復**：背景套用正式 `app.asar` 不得退回直接 copy/truncate 覆寫；當原子 rename 被拒絕時必須完整保留原檔。如果套用後簽署失敗，回復也只能原子置換；如回復本身失敗，必須保留原始 ASAR 復原副本，回報人工恢復需求，不得宣稱完全復原。另模擬寫入收據前中斷，以及子程序成功退出但翻譯版號未實際改變。
- **發布檢查必須可執行**：新版 `.github/workflows/release-preflight.yml` 在候選分支不等於已經在 GitHub 預設分支啟用。以 `workflow_dispatch` 手動執行前，確認檔案已合併至 default branch；審查 GitHub API 對草稿的存取權限、Release 資產內容驗證、唯讀下載操作、正負測試，並確認沒有任何自動 publish 指令。不能稱它是無法繞過的 GitHub 平台發布政策。

## P0：既有 v3.7.1 安裝的發布遷移風險
正式 v3.7.1 的舊守護程序仍能選取新 Release 內的完整 ZIP，進而自動更新程式碼。請檢查：
- 只修改新分支不會停止舊版守護程序的舊行為。
- 若新 Release 仍附加完整程式 ZIP，舊版使用者可能在未理解新政策前自動升級程式功能。
- 提出**不破壞舊讀者、可人工下載完整程式、但舊守護程序不會取得並執行新程式碼**的實際發布方案。**注意正式 v3.7.1 有兩層 ZIP 篩選：`/^antigravity2-TW-.*\.zip$/i` 與後備 `/\.zip$/i`。把完整程式命名為 `antigravity2-TW-manual-setup-vX.Y.Z.zip` 或任何其他 ZIP 並上傳至 Release Assets，都不能規避舊版自動下載。** GitHub 自動產生的 Source code (ZIP) 可供手動安裝，且不在 `assets[]` 中。所有新發布應先建立 draft，依 `docs/RELEASE_TRANSLATION_ONLY_SOP.md` 使用具備草稿讀取權限的 Release 清單 API 與實際翻譯 ZIP 檢查（切勿以僅描述已發布版的 `releases/tags/{tag}` API 當成草稿驗收）。通過後仍需人工批准才能公開。另以隔離測試驗證舊程式遇到純翻譯 ZIP 時確實 fail closed，不能只宣稱規避成功。
- 必須核對 `assets[].digest` 提供 SHA-256；如缺少 digest，新守護程序不得自動下載。

## 驗證命令與界線
必跑：`git diff v3.7.1...HEAD`、`node scripts/compare_dicts.js`、`npm test`、`node --check`、macOS `bash -n`。實際版本分支需先確認。可在系統暫存資料夾建立隔離測試套件；**不可修改 /Applications/Antigravity.app、正式守護程序、系統排程或現有 GitHub Release。不可 push、merge、tag、發布或安裝正式環境。** 發現缺陷時先記錄最小修正提案與反證測試，不要擴展成新的設定架構。

## 最後四條獨立紅隊 Lane（不可只轉述先前測試）
**2026-11-20 P0 修復後追加核驗：** 審查最新版 HEAD。前輪獨立紅隊曾以故障注入重現兩個實質問題：(1) Google ShipIt 在最後 SHA-256 檢查與原子 `rename` 之間更新 `app.asar`，守護仍把舊版中文化產物覆蓋回去；(2) `app.asar.bak` 在 `ENOSPC` 下失敗，但守護忽略錯誤並繼續覆寫正式檔案。候選修復改用原生保留舊檔的交換與強制備份驗證。必須檢視 `scripts/atomic_asar_exchange.rb`、`scripts/atomic_asar_replace.ps1`，重新驗證交換競爭、回退競爭、備份 ENOSPC、備份損毀、第二次恢復遭拒、正常重套、Windows `ReplaceFileW` 真正執行結果。沒有實際 Windows runner 的通過收據，不可聲稱跨平台原生測試已通過。對不支援原子交換的環境，要求安全拒絕，絕不可靜默退回盲目覆寫。

1. **P0 發布安全**：攻擊 `scripts/check_release_assets.js` 及 `.github/workflows/release-preflight.yml`。測試正確檔名卻混入 JS、ZIP Slip、CRC 或解壓異常、digest 不符、內容與引擎不相容、重複或額外資產、Release 非草稿、API 未授權、偽造 tag。以正式 v3.7.1 更新器逆向重現任意 ZIP 行為。核查 Actions 草稿查詢**必須具有 push 級可見性**、兩工作階段權限隔離、沒有自動發布。若尚無真正草稿，僅能評為「本機／虛擬通過；實際發布草稿未驗證」。
2. **P0 翻譯回退**：測試 `test/translation_updates.test.js` 與 `test/watcher.test.js` 的正負路徑。涵蓋下載或驗證失敗、指標變更後 ASAR 失敗、子程序成功但版本未變、原子 rename 遭 `EPERM` 或 `EXDEV` 拒絕、簽署失敗、回退本身遭拒絕、收據寫入前中斷與下次重啟恢復。逐一核對 `app.asar` SHA、`app.asar.bak`、`active_translation.json`、私人 `recovery-*/previous-app.asar`、排程 exit code 與日誌，不能只檢查指標。**若回退也失敗，應明確回報需要人工恢復，不可判成完全回退成功。**
   - **新反例**：前輪紅隊宣稱指標與 ASAR「完全連動」，但曾重現指標已回復 `3.7.4`、ASAR 仍是錯誤 `3.7.99`。本輪補上子程序成功但版本錯誤後的受控舊版重套與再核對。請重新攻擊「第二次重套仍失敗」「指標已被其他進程更改」「ASAR 同時受到官方更新」三種情境；不得僅憑測試數量宣布完全復原。
   - **發布程式碼一致性**：驗證 `.github/workflows/release-preflight.yml` 中 Git 標籤 SHA 必須等於本次受測 `GITHUB_SHA`，以及輸入的引擎版號必須等於受測 `package.json.version`。翻譯資料版號可以高於引擎版號。若 SHA 不符，必須拒絕發布前驗收，避免 GitHub 原生 Source code (zip) 下載到舊程式。
3. **P1 macOS**：用 Apple `launchd` 官方規格比對 `install_macos_autowatcher.sh` 的 LaunchAgent 與 LaunchDaemon plist。對 `RunAtLoad`、`StartInterval=300`、`ThrottleInterval=30`、`ProgramArguments`、使用者／系統權限、雙守護互斥、舊副本遷移、卸載作反證。無法在隔離系統啟動真正 LaunchDaemon 時，將 plist 解析及沙盒測試標為虛擬驗證。
4. **P1 Windows**：依 Microsoft Task Scheduler `RunLevel` 與 UAC 規範檢查工作排程 XML 必為 `LeastPrivilege`、`PT5M`。以模擬 `EPERM`、`EACCES`、唯讀 `Program Files`、工作已安裝但套用失敗、權限不足登錄、卸載後不再執行測試失敗處理。真實 Windows ACL 測試若不可得，不可視為實機 PASS。

官方規範：<https://docs.github.com/en/rest/releases/releases>、<https://docs.github.com/en/rest/releases/assets>、<https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow>、<https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html>、<https://learn.microsoft.com/en-us/windows/win32/taskschd/security-contexts-for-running-tasks>。

## 應交付的報告
用繁體中文列出：P0/P1/P2、具體檔案行號、失敗條件、實際重現或尚缺證據、修復建議；分別裁決「使用者知情選擇」「只更新翻譯」「版本相容與快照」「跨平台守護權限」「發布遷移」。最終只使用 PASS、FAIL、CONDITIONAL PASS，另標示未驗證部分。切勿以測試項數或原專案自述替代結論。
