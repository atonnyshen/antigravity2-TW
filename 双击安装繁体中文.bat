@echo off
title Antigravity - Install Traditional Chinese

echo.
echo 请选择左上角品牌显示方式:
echo [1] 保持英文 Antigravity
echo [2] 不显示品牌名称
echo [3] 显示繁体中文品牌名
set "CHOICE_VAL=1"
set /p "CHOICE_VAL=请输入选项 [1/2/3] (直接按 Enter 默认为 1): "
set "BRAND_ARG=--brand-title english"
if "%CHOICE_VAL%"=="2" set "BRAND_ARG=--brand-title hidden"
if "%CHOICE_VAL%"=="3" set "BRAND_ARG=--brand-title translated"

echo.
echo [1/2] 正在注入繁体中文汉化...
cd /d "%~dp0"
node localization_engine.js --tw %BRAND_ARG% %*

if %errorlevel% neq 0 (
    echo.
    echo 错误: 汉化注入失败, 请确认是否已安装 Node.js。
    pause
    exit /b 1
)

echo.
echo [2/2] 完成!
echo.
echo 提示: 繁体中文汉化已成功部署。
echo.
echo 视图将在 5 秒后自动关闭...
timeout /t 5
