# Antigravity 2.0 繁體中文（台灣）Windows 一鍵安裝與自動設定腳本
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    Antigravity Windows 繁體中文（台灣）一鍵安裝工具" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. 檢查 Node.js 環境
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 偵測到未安裝 Node.js！" -ForegroundColor Red
    Write-Host "Antigravity 繁體中文化引擎依賴 Node.js 執行 ASAR 解析。"
    Write-Host "請先至 https://nodejs.org/ 下載並安裝 Node.js，安裝完成後重新執行此指令。"
    exit 1
}

# 2. 判斷目前工作目錄
$repoUrl = "https://github.com/atonnyshen/antigravity2-TW.git"
$targetDir = Join-Path $env:USERPROFILE ".antigravity2-TW"

if (Test-Path "./localization_engine.js") {
    $workDir = (Get-Item .).FullName
} else {
    Write-Host "⚡ 正在下載或更新 antigravity2-TW 套件至 $targetDir ..." -ForegroundColor Yellow
    if (Test-Path "$targetDir/.git") {
        git -C $targetDir pull --ff-only 2>$null
    } elseif (Get-Command git -ErrorAction SilentlyContinue) {
        git clone $repoUrl $targetDir
    } else {
        # 若無 git，則透過 PowerShell 下載 ZIP 解壓
        $zipPath = "$env:TEMP/antigravity2-TW.zip"
        Invoke-WebRequest -Uri "https://github.com/atonnyshen/antigravity2-TW/archive/refs/heads/main.zip" -OutFile $zipPath
        Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP/antigravity-extract" -Force
        if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
        Copy-Item -Path "$env:TEMP/antigravity-extract/antigravity2-TW-main/*" -Destination $targetDir -Recurse -Force
    }
    $workDir = $targetDir
}

# 3. 執行中文化注入
Write-Host "[1/2] 正在注入繁體中文語系..." -ForegroundColor Green
Set-Location $workDir
npm ci --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "安裝鎖定依賴失敗" }
node localization_engine.js --tw --brand-title english

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 注入失敗！請檢查上方錯誤訊息，或嘗試以系統管理員身分開啟 PowerShell 執行。" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/2] 繁體中文套用完成！" -ForegroundColor Green
Write-Host "🎉 Antigravity 已成功升級為繁體中文（台灣）開發環境。請開啟軟體體驗！" -ForegroundColor Cyan
