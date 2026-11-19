@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% equ 0 goto :check_node_ver

if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"

where node >nul 2>nul
if %errorlevel% equ 0 goto :check_node_ver

echo [ERROR] Node.js 22.12.0+ not found.
echo Please install Node.js LTS from https://nodejs.org/ and re-run this file.
pause
exit /b 1

:check_node_ver
node -e "const v=process.versions.node.split('.').map(Number); if(v[0]<22||(v[0]===22&&v[1]<12)){console.error('[ERROR] Node.js >= 22.12.0 required. Current:',process.versions.node); process.exit(1);}"
if errorlevel 1 goto :failed

node localization_engine.js --tw --huifu
if errorlevel 1 goto :failed

echo.
pause
exit /b 0

:failed
echo.
echo [FAILED] Operation did not complete. Please check the messages above.
pause
exit /b 1
