@echo off
chcp 65001 > nul
title Antigravity - 還原官方原版英文

echo.
echo ======================================================
echo    正在還原 Windows 版 Antigravity 官方原版英文
echo ======================================================
echo.
echo [1/2] 正在還原官方原始檔案...
cd /d "%~dp0"
node localization_engine.js --huifu %*

if %errorlevel% neq 0 (
    echo.
    echo ❌ 錯誤: 還原官方原版失敗！請檢查上方錯誤訊息，或確認是否已安裝 Node.js。
    pause
    exit /b 1
)

echo.
echo [2/2] 還原完成！
echo.
echo 🎉 提示: Antigravity 已成功無痕還原至官方原版狀態。
echo.
echo 視窗將在 5 秒後自動關閉...
timeout /t 5
