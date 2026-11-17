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
echo 🎉 說明: Antigravity 繁體中文化已成功注入。
schtasks /query /tn "AntigravityAutoLocalize" >nul 2>nul
if %errorlevel% equ 0 (
    echo ⚡ 偵測到已註冊 Windows 背景守護排程 [AntigravityAutoLocalize]：
    echo    若您先前在其他資料夾安裝過舊版守護，請一併執行本目錄的「點兩下安裝Windows背景守護.bat」以同步更新！
) else (
    echo 💡 提示: 若需在 Antigravity 官方更新或詞庫發布時自動維持繁中化，
    echo    可執行目錄內的「點兩下安裝Windows背景守護.bat」啟用背景服務。
)
echo.
echo 視窗將於 5 秒後自動關閉...
timeout /t 5
