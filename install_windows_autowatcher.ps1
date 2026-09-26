# Antigravity Windows 背景自動更新守護排程 安裝腳本
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    Antigravity Windows 背景自動更新守護服務 安裝工具" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. 檢查 Node.js 環境
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 偵測到未安裝 Node.js！" -ForegroundColor Red
    Write-Host "Antigravity 守護程式依賴 Node.js 執行。"
    Write-Host "請先至 https://nodejs.org/ 下載並安裝 Node.js，安裝完成後重新執行此指令。"
    exit 1
}

$nodePath = (Get-Command node).Source

# 2. 判斷目前工作目錄
$repoUrl = "https://github.com/atonnyshen/antigravity2-TW.git"
$targetDir = Join-Path $env:USERPROFILE ".antigravity2-TW"

if (Test-Path "./auto_localize_watcher.js") {
    $workDir = (Get-Item .).FullName
} else {
    Write-Host "⚡ 正在下載或更新專案至 $targetDir ..." -ForegroundColor Yellow
    if (Test-Path "$targetDir/.git") {
        git -C $targetDir pull --ff-only 2>$null
    } elseif (Get-Command git -ErrorAction SilentlyContinue) {
        git clone $repoUrl $targetDir
    } else {
        $zipPath = "$env:TEMP\antigravity2-TW.zip"
        Invoke-WebRequest -Uri "https://github.com/atonnyshen/antigravity2-TW/archive/refs/heads/main.zip" -OutFile $zipPath
        Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\antigravity-extract" -Force
        if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
        Copy-Item -Path "$env:TEMP\antigravity-extract\antigravity2-TW-main\*" -Destination $targetDir -Recurse -Force
    }
    $workDir = $targetDir
}

$watcherScript = Join-Path $workDir "auto_localize_watcher.js"
Push-Location $workDir
try {
    npm ci --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "安裝鎖定依賴失敗" }
} finally { Pop-Location }
$taskName = "AntigravityAutoLocalize"

# 3. 建立 Windows 工作排程（每 5 分鐘執行一次）
Write-Host "⚡ 正在註冊 Windows 排程工作 [$taskName]..." -ForegroundColor Yellow

$actionCmd = "`"$nodePath`" `"$watcherScript`""
schtasks.exe /create /tn "$taskName" /tr "$actionCmd" /sc minute /mo 5 /f | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "🎉 守護服務已成功註冊至 Windows 工作排程！" -ForegroundColor Green
    Write-Host "工作名稱：$taskName"
    Write-Host "守護工作目錄：$workDir"
    Write-Host "執行頻率：每 5 分鐘於背景自動巡檢一次"
    Write-Host "日後 Antigravity IDE 官方更新時，將自動於背景重新套用繁體中文。"
    Write-Host "==========================================================" -ForegroundColor Cyan
} else {
    Write-Host "❌ 註冊排程工作失敗，請嘗試以系統管理員身分開啟 PowerShell 重新執行。" -ForegroundColor Red
    exit 1
}
