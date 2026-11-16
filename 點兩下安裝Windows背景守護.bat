@echo off
chcp 65001 > nul
title Antigravity - 安裝 Windows 背景自動更新守護

echo.
echo ==========================================================
echo   正在為 Antigravity 註冊 Windows 背景自動更新守護排程
echo ==========================================================
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File install_windows_autowatcher.ps1

echo.
echo 視窗將在 5 秒後自動關閉（或按任意鍵立即關閉）...
timeout /t 5
