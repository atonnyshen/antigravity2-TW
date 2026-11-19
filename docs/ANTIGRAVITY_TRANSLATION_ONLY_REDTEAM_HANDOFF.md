# antigravity2-TW｜翻譯資料自動更新架構：Antigravity 獨立紅隊驗收提示詞

## 任務與唯一標的
請擔任獨立紅隊審計官，對 `/Users/atonny/工作區/antigravity2-TW` 的 `fix/v3.7.1-redteam-hardening` 分支執行對抗式審查。以發布標籤 `v3.7.1` 為基線，實際閱讀 `git diff v3.7.1...HEAD` 和完整程式碼。不可把既有測試「59/59 通過」視為放行證據。

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

## P0：既有 v3.7.1 安裝的發布遷移風險
正式 v3.7.1 的舊守護程序仍能選取新 Release 內的完整 ZIP，進而自動更新程式碼。請檢查：
- 只修改新分支不會停止舊版守護程序的舊行為。
- 若新 Release 仍附加完整程式 ZIP，舊版使用者可能在未理解新政策前自動升級程式功能。
- 提出**不破壞舊讀者、可人工下載完整程式、但舊守護程序不會取得並執行新程式碼**的實際發布方案。可研究先用 GitHub 自動提供的 Source code (ZIP) 供手動安裝、Release Assets 只放純翻譯包，並驗證舊程式遇到純翻譯 ZIP 時確實 fail closed。不能只宣稱規避成功。
- 必須核對 `assets[].digest` 提供 SHA-256；如缺少 digest，新守護程序不得自動下載。

## 驗證命令與界線
必跑：`git diff v3.7.1...HEAD`、`node scripts/compare_dicts.js`、`npm test`、`node --check`、macOS `bash -n`。實際版本分支需先確認。可在系統暫存資料夾建立隔離測試套件；**不可修改 /Applications/Antigravity.app、正式守護程序、系統排程或現有 GitHub Release。不可 push、merge、tag、發布或安裝正式環境。** 發現缺陷時先記錄最小修正提案與反證測試，不要擴展成新的設定架構。

## 應交付的報告
用繁體中文列出：P0/P1/P2、具體檔案行號、失敗條件、實際重現或尚缺證據、修復建議；分別裁決「使用者知情選擇」「只更新翻譯」「版本相容與快照」「跨平台守護權限」「發布遷移」。最終只使用 PASS、FAIL、CONDITIONAL PASS，另標示未驗證部分。切勿以測試項數或原專案自述替代結論。
