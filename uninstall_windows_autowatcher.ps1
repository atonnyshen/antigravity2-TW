# Antigravity Windows 背景自動更新守護排程 卸載腳本
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    Antigravity Windows 背景自動更新守護服務 卸載工具" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$taskName = "AntigravityAutoLocalize"

Write-Host "⚡ 正在檢查並移除 Windows 排程工作 [$taskName]..." -ForegroundColor Yellow

$exists = schtasks.exe /query /tn "$taskName" 2>$null
if ($LASTEXITCODE -eq 0) {
    schtasks.exe /end /tn "$taskName" 2>$null
    schtasks.exe /delete /tn "$taskName" /f | Out-Null
    
    $verify = schtasks.exe /query /tn "$taskName" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✅ 已成功停止並刪除排程工作 [$taskName]！" -ForegroundColor Green
    } else {
        Write-Host "⚠️ 排程可能仍被系統鎖定，請稍候重試或以管理員身分執行。" -ForegroundColor Yellow
    }
} else {
    Write-Host "ℹ️ 系統中未偵測到此排程工作。" -ForegroundColor Gray
}

Write-Host ""
Write-Host "🎉 Windows 背景自動更新守護服務已完全停止並卸載！" -ForegroundColor Green
Write-Host "未來官方若發布版本更新，Antigravity 將保持官方原版設定，不再自動重套繁體中文。"
Write-Host "若日後需要重新啟用，可隨時執行 install_windows_autowatcher.ps1 再次啟用。" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
