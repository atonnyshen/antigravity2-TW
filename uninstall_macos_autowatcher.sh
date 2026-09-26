#!/bin/bash
set -e

PLIST_NAME="com.antigravity.autolocalize.plist"
LABEL="com.antigravity.autolocalize"

echo "=========================================================="
echo "    Antigravity macOS 背景自動更新守護服務 卸載工具"
echo "=========================================================="

echo "⚡ 正在停止背景常駐守護服務..."

# 1. 嘗試清理系統級 LaunchDaemon (若有)
DAEMON_PLIST="/Library/LaunchDaemons/$PLIST_NAME"
if [ -f "$DAEMON_PLIST" ]; then
    if [ "$EUID" -eq 0 ]; then
        launchctl bootout system/$LABEL 2>/dev/null || launchctl unload "$DAEMON_PLIST" 2>/dev/null || true
        rm -f "$DAEMON_PLIST"
        echo "✅ 已成功移除系統級 LaunchDaemon：$DAEMON_PLIST"
    else
        echo "⚠️ 偵測到存在系統級 LaunchDaemon，但未以管理員身分執行。若要完全移除請使用 sudo 執行。"
    fi
fi

# 2. 嘗試清理使用者級 LaunchAgent
ACTUAL_USER="${SUDO_USER:-$USER}"
USER_HOME="$(eval echo "~$ACTUAL_USER")"
AGENT_PLIST="$USER_HOME/Library/LaunchAgents/$PLIST_NAME"

if [ -f "$AGENT_PLIST" ]; then
    if [ "$EUID" -eq 0 ] && [ -n "$SUDO_USER" ]; then
        su - "$SUDO_USER" -c "launchctl bootout gui/\$(id -u) '$AGENT_PLIST' 2>/dev/null || launchctl unload '$AGENT_PLIST' 2>/dev/null || true" 2>/dev/null || true
    else
        launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$AGENT_PLIST" 2>/dev/null || true
    fi
    rm -f "$AGENT_PLIST"
    echo "✅ 已成功移除使用者級 LaunchAgent：$AGENT_PLIST"
else
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
fi

echo ""
echo "🎉 macOS 背景自動更新守護服務已完全停止並卸載！"
echo "未來官方若發布版本更新，Antigravity 將保持官方原版設定，不再自動重套繁體中文。"
echo "若日後需要重新啟用，可隨時執行「點兩下安裝macOS背景守護.command」再次註冊。"
echo "=========================================================="
