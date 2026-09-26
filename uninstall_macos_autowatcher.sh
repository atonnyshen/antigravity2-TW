#!/bin/bash
set -euo pipefail
LABEL="com.antigravity.autolocalize"
PLIST="/Library/LaunchDaemons/$LABEL.plist"
if [ -f "$PLIST" ] && [ "$EUID" -ne 0 ]; then
    echo "系統服務需要管理員權限；請使用 sudo bash uninstall_macos_autowatcher.sh。" >&2
    exit 1
fi
if [ "$EUID" -eq 0 ]; then
    launchctl bootout "system/$LABEL" 2>/dev/null || true
    if [ -f "$PLIST" ]; then
        mv "$PLIST" "$PLIST.disabled-$(date +%Y%m%d%H%M%S)"
    fi
fi
ACTUAL_USER="${SUDO_USER:-$(stat -f%Su /dev/console)}"
if [ "$ACTUAL_USER" != root ] && [ "$ACTUAL_USER" != loginwindow ]; then
    USER_DIR="$(dscl . -read "/Users/$ACTUAL_USER" NFSHomeDirectory | sed 's/^NFSHomeDirectory: //')"
    AGENT="$USER_DIR/Library/LaunchAgents/$LABEL.plist"
    launchctl bootout "gui/$(id -u "$ACTUAL_USER")/$LABEL" 2>/dev/null || true
    if [ -f "$AGENT" ]; then mv "$AGENT" "$AGENT.disabled-$(date +%Y%m%d%H%M%S)"; fi
    if launchctl print "gui/$(id -u "$ACTUAL_USER")/$LABEL" >/dev/null 2>&1; then
        echo "使用者服務仍在註冊狀態，停止未完成。" >&2
        exit 1
    fi
fi
if launchctl print "system/$LABEL" >/dev/null 2>&1; then
    echo "系統服務仍在註冊狀態，停止未完成。" >&2
    exit 1
fi
echo "守護服務已停用；設定、runtime 與日誌保留供復原。已套用的繁中內容不會還原。"
