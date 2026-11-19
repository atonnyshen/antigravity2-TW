# AGENTS.md

1. **使用者請求安裝、更新後重套、安全檢查、設定守護或還原官方英文時**：
   - 請直接讀取並嚴格遵循同目錄下的 [`AI_INSTALL_GUIDE.md`](./AI_INSTALL_GUIDE.md)（第一階段先唯讀檢查環境與安全性，待使用者從 1–4 選擇後再執行；Antigravity 執行中務必加上 `--no-kill`）。
2. **開發者修改本專案字典（`dicts/`、`dicts_tw/`）或核心程式時**：
   - 請遵循同目錄下的 `.cursorrules`（`node scripts/compare_dicts.js` 必須通過、`npm test` 必須全部通過，且僅對暫存隔離目錄執行引擎測試）。
