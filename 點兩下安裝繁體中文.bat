@echo off
chcp 65001 > nul
title Antigravity - 安裝繁體中文（台灣）

echo.
echo ======================================================
echo    正在安裝 Windows 版 Antigravity 繁體中文（台灣）套件
echo ======================================================
echo.
echo 請選擇左上角品牌名稱顯示方式:
echo [1] 顯示官方英文 Antigravity（推薦）
echo [2] 隱藏品牌名稱
echo [3] 顯示繁體中文品牌名（反重力）
set "CHOICE_VAL=1"
set /p "CHOICE_VAL=請輸入 [1/2/3]（直接按 Enter 預設為 1）: "
set "BRAND_ARG=--brand-title english"
if "%CHOICE_VAL%"=="2" set "BRAND_ARG=--brand-title hidden"
if "%CHOICE_VAL%"=="3" set "BRAND_ARG=--brand-title translated"

echo.
echo [1/2] 正在注入繁體中文語系與資源...
cd /d "%~dp0"
call npm ci --ignore-scripts --no-audit --no-fund
if errorlevel 1 exit /b 1
node localization_engine.js --tw %BRAND_ARG% %*

if %errorlevel% neq 0 (
    echo.
    echo ❌ 錯誤: 注入繁體中文失敗，請確認是否已安裝 Node.js 以及是否以系統管理員身分執行！
    pause
    exit /b 1
)

echo.
echo [2/2] 繁體中文套用完成！
echo.
echo 🎉 提示: Antigravity 繁體中文化已成功注入。
echo.
echo 視窗將在 5 秒後自動關閉...
timeout /t 5
