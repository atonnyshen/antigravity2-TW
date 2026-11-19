$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = (Get-Location).Path }
$WatcherScript = Join-Path $ScriptDir "auto_localize_watcher.js"
$NodeCmd = Get-Command node -ErrorAction SilentlyContinue

if ($NodeCmd -and (Test-Path $WatcherScript)) {
    & $NodeCmd.Source $WatcherScript --uninstall-windows-task
    exit $LASTEXITCODE
}

$TaskName = "AntigravityAutoLocalize"
$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($Task) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "[完成] Windows 背景自動守護已卸載！" -ForegroundColor Green
} else {
    Write-Host "[提示] 未偵測到已註冊的排程工作 ($TaskName)，無須移除。" -ForegroundColor Gray
}
exit 0
