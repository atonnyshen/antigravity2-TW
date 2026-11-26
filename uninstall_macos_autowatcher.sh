#!/bin/bash
set -euo pipefail
# 以 root 執行時，先把 PATH 換成系統目錄再執行任何指令：傳入的 PATH 可能把使用者可寫目錄排在前面，
# 讓同名的 dirname 等程式以 root 身分執行
if [ "$EUID" -eq 0 ]; then export PATH="/usr/bin:/bin:/usr/sbin:/sbin"; fi
LABEL="com.antigravity.autolocalize"
SYSTEM_PLIST="/Library/LaunchDaemons/$LABEL.plist"
USER_PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
CURRENT_UID="$(id -u)"

# 卸載使用者級 LaunchAgent
if [ -f "$USER_PLIST" ] || launchctl print "gui/$CURRENT_UID/$LABEL" >/dev/null 2>&1; then
    launchctl bootout "gui/$CURRENT_UID/$LABEL" 2>/dev/null || true
    if [ -f "$USER_PLIST" ]; then
        mv "$USER_PLIST" "$USER_PLIST.disabled-$(date +%Y%m%d%H%M%S)"
    fi
    echo "已停用使用者級 LaunchAgent。"
fi

# 卸載系統級 LaunchDaemon (若有管理員權限)
if [ "$EUID" -eq 0 ]; then
    launchctl bootout "system/$LABEL" 2>/dev/null || true
    if [ -f "$SYSTEM_PLIST" ]; then
        mv "$SYSTEM_PLIST" "$SYSTEM_PLIST.disabled-$(date +%Y%m%d%H%M%S)"
    fi
    echo "已停用系統級 LaunchDaemon。"
elif [ -f "$SYSTEM_PLIST" ]; then
    echo "提示：系統中尚有系統級 LaunchDaemon ($SYSTEM_PLIST)，若需完全移除請以 sudo 執行此腳本。"
fi

echo "守護服務清理完成。"
