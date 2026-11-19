$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
$WatcherScript = Join-Path $ScriptDir "auto_localize_watcher.js"

if (-not (Test-Path $WatcherScript)) {
    Write-Host "[錯誤] 找不到 auto_localize_watcher.js：$WatcherScript" -ForegroundColor Red
    Write-Host "[提示] 請下載 GitHub Source code (ZIP) 並完整解壓縮後，在專案資料夾內執行；純翻譯 ZIP 不能安裝。" -ForegroundColor Yellow
    exit 1
}

$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
    foreach ($Candidate in @(
        (Join-Path $env:ProgramFiles "nodejs\node.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe")
    )) {
        if ($Candidate -and (Test-Path $Candidate)) {
            $NodePath = $Candidate
            break
        }
    }
} else {
    $NodePath = $NodeCmd.Source
}

if (-not $NodePath) {
    Write-Host "[錯誤] 未偵測到 Node.js，請先至 https://nodejs.org/ 安裝 Node.js 22.12.0 以上版本。" -ForegroundColor Red
    exit 1
}

& $NodePath $WatcherScript --install-windows-task
exit $LASTEXITCODE
