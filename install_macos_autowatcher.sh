#!/bin/bash
set -e
REPO_URL="https://github.com/atonnyshen/antigravity2-TW.git"
DEFAULT_INSTALL_DIR="$HOME/.antigravity2-TW"

echo "=========================================================="
echo "    Antigravity macOS 背景自動更新守護服務安裝工具"
echo "=========================================================="

if [ -f "$(pwd)/auto_localize_watcher.js" ]; then
    DIR="$(pwd)"
elif [ -f "$(dirname "$0")/auto_localize_watcher.js" ] 2>/dev/null; then
    DIR="$(cd "$(dirname "$0")" && pwd)"
else
    echo "⚡ 偵測到直接透過網路執行，正在下載或更新專案至 $DEFAULT_INSTALL_DIR ..."
    if [ -d "$DEFAULT_INSTALL_DIR/.git" ]; then
        git -C "$DEFAULT_INSTALL_DIR" pull --ff-only 2>/dev/null || true
    else
        git clone "$REPO_URL" "$DEFAULT_INSTALL_DIR"
    fi
    DIR="$DEFAULT_INSTALL_DIR"
fi

PLIST_NAME="com.antigravity.autolocalize.plist"
LABEL="com.antigravity.autolocalize"

# 判斷當前使用者與執行權限
if [ "$EUID" -eq 0 ]; then
    IS_ROOT=1
    ACTUAL_USER="${SUDO_USER:-$(stat -f%Su /dev/console 2>/dev/null || echo "$USER")}"
    USER_HOME="$(eval echo "~$ACTUAL_USER")"
    TARGET_DIR="/Library/LaunchDaemons"
    TARGET_PLIST="$TARGET_DIR/$PLIST_NAME"
    echo "🛡️ 偵測到管理員權限 (root)，將安裝為系統級 LaunchDaemon 守護服務。"
    echo "   （優勢：完全免除 macOS App Management 權限阻擋，背景 100% 靜默自癒！）"
else
    IS_ROOT=0
    ACTUAL_USER="$USER"
    USER_HOME="$HOME"
    TARGET_DIR="$HOME/Library/LaunchAgents"
    TARGET_PLIST="$TARGET_DIR/$PLIST_NAME"
    if [ -e "/Applications/Antigravity.app/Contents/Resources/app.asar" ] || [ -e "/Applications/Antigravity IDE.app/Contents/Resources/app.asar" ]; then
        echo "❌ 目前的 Antigravity 安裝在 /Applications；使用者級 LaunchAgent 沒有穩定寫入權限。"
        echo "   請執行「點兩下安裝macOS背景守護.command」，以管理員權限安裝系統級 LaunchDaemon。"
        exit 1
    fi
    echo "👤 偵測為一般使用者權限，將安裝為使用者級 LaunchAgent 守護服務。"
fi

mkdir -p "$TARGET_DIR"

# 解析可用的 Node.js 路徑
if [ "$IS_ROOT" -eq 1 ] && [ -n "$SUDO_USER" ]; then
    NODE_BIN="$(su - "$SUDO_USER" -c 'which node' 2>/dev/null || which node || echo "/usr/local/bin/node")"
else
    NODE_BIN="$(which node || echo "/usr/local/bin/node")"
fi

if [ ! -x "$NODE_BIN" ]; then
    if [ -x "/opt/homebrew/bin/node" ]; then
        NODE_BIN="/opt/homebrew/bin/node"
    elif [ -x "/usr/local/bin/node" ]; then
        NODE_BIN="/usr/local/bin/node"
    fi
fi

echo "使用 Node.js 執行檔：$NODE_BIN"
echo "專案工作目錄：$DIR"

cat << PLIST_EOF > "$TARGET_PLIST"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_BIN}</string>
        <string>${DIR}/auto_localize_watcher.js</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/opt/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>WatchPaths</key>
    <array>
        <string>/Applications/Antigravity.app/Contents/Info.plist</string>
        <string>/Applications/Antigravity.app/Contents/Resources/app.asar</string>
        <string>/Applications/Antigravity IDE.app/Contents/Info.plist</string>
        <string>/Applications/Antigravity IDE.app/Contents/Resources/app.asar</string>
        <string>${USER_HOME}/Applications/Antigravity.app/Contents/Info.plist</string>
        <string>${USER_HOME}/Applications/Antigravity.app/Contents/Resources/app.asar</string>
        <string>${USER_HOME}/Applications/Antigravity IDE.app/Contents/Info.plist</string>
        <string>${USER_HOME}/Applications/Antigravity IDE.app/Contents/Resources/app.asar</string>
    </array>
    <key>StartInterval</key>
    <integer>300</integer>
    <key>ThrottleInterval</key>
    <integer>30</integer>
    <key>WorkingDirectory</key>
    <string>${DIR}</string>
    <key>StandardOutPath</key>
    <string>${DIR}/autolocalize.log</string>
    <key>StandardErrorPath</key>
    <string>${DIR}/autolocalize.log</string>
</dict>
</plist>
PLIST_EOF

# 驗證 plist 格式合法性
plutil -lint "$TARGET_PLIST" >/dev/null

if [ "$IS_ROOT" -eq 1 ]; then
    chown root:wheel "$TARGET_PLIST"
    chmod 644 "$TARGET_PLIST"

    # 若之前有安裝過使用者級 LaunchAgent，清理避免衝突雙重執行
    AGENT_PLIST="$USER_HOME/Library/LaunchAgents/$PLIST_NAME"
    if [ -f "$AGENT_PLIST" ]; then
        su - "$ACTUAL_USER" -c "launchctl bootout gui/\$(id -u) '$AGENT_PLIST' 2>/dev/null || launchctl unload '$AGENT_PLIST' 2>/dev/null || true" 2>/dev/null || true
        rm -f "$AGENT_PLIST"
        echo "🧹 已清理舊版使用者級 LaunchAgent。"
    fi

    launchctl bootout system/$LABEL 2>/dev/null || launchctl unload "$TARGET_PLIST" 2>/dev/null || true
    launchctl bootstrap system "$TARGET_PLIST" 2>/dev/null || launchctl load "$TARGET_PLIST"
    echo "🎉 LaunchDaemon 系統級守護服務已成功註冊並啟動！"
else
    chmod 644 "$TARGET_PLIST"
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$TARGET_PLIST" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$TARGET_PLIST" 2>/dev/null || launchctl load "$TARGET_PLIST"
    echo "🎉 LaunchAgent 使用者級守護服務已成功安裝並啟動！"
    echo "💡 提示：若希望在更新時 100% 靜默免輸密碼，建議執行「點兩下安裝macOS背景守護.command」以管理員授權升級為 LaunchDaemon。"
fi

echo "日後 Antigravity IDE 官方更新時，將自動於背景為新版本重新完成繁體中文化。"
echo "=========================================================="
