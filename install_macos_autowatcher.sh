#!/bin/bash
set -euo pipefail

if [ "$(uname -s)" != Darwin ]; then
    echo "此安裝程式僅適用 macOS。" >&2
    exit 1
fi

if [ -f "$(dirname "$0")/auto_localize_watcher.js" ]; then
    DIR="$(cd "$(dirname "$0")" && pwd)"
elif [ -f "$PWD/auto_localize_watcher.js" ]; then
    DIR="$PWD"
else
    if [ "$EUID" -eq 0 ]; then
        echo "請先以一般使用者下載專案及依賴，再執行安裝。" >&2
        exit 1
    fi
    DIR="$HOME/.antigravity2-TW"
    if [ -d "$DIR/.git" ]; then
        git -C "$DIR" pull --ff-only
    else
        git clone https://github.com/atonnyshen/antigravity2-TW.git "$DIR"
    fi
    exec bash "$DIR/install_macos_autowatcher.sh"
fi

cd "$DIR"
# A standalone Node binary avoids loading user-writable Homebrew shared libraries as root.
NODE_BIN="/usr/local/bin/node"
if [ ! -x "$NODE_BIN" ]; then
    echo "請先安裝 nodejs.org 官方 macOS Node.js 22.12+ 套件（/usr/local/bin/node）。" >&2
    exit 1
fi
"$NODE_BIN" -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<12)) process.exit(1)'
if /usr/bin/otool -L "$NODE_BIN" | /usr/bin/awk '/^[[:space:]]+\// { print $1 }' | /usr/bin/grep -Ev '^(/usr/lib/|/System/Library/)' | /usr/bin/grep -q .; then
    echo "Node 連結了系統目錄以外的動態函式庫，無法安裝 root 守護；請使用官方獨立套件。" >&2
    exit 1
fi

if [ "$EUID" -ne 0 ]; then
    npm ci --ignore-scripts --no-audit --no-fund
    echo "依賴已備妥；接著需要管理員認證來安裝系統服務。"
    exec sudo /bin/bash "$DIR/install_macos_autowatcher.sh"
fi
if [ ! -f "$DIR/node_modules/@electron/asar/bin/asar.mjs" ]; then
    echo "缺少鎖定依賴；請先以一般使用者執行 npm ci --ignore-scripts。" >&2
    exit 1
fi
LABEL="com.antigravity.autolocalize"
BASE="/Library/Application Support/Antigravity2TW"
LOG_DIR="/Library/Logs/Antigravity2TW"
PLIST="/Library/LaunchDaemons/$LABEL.plist"
for target in "$BASE" "$LOG_DIR" "$PLIST"; do
    if [ -L "$target" ]; then
        echo "拒絕覆寫符號連結：$target" >&2
        exit 1
    fi
done
/usr/bin/install -d -o root -g wheel -m 755 "$BASE" "$LOG_DIR"
/bin/chmod go-w "$BASE" "$LOG_DIR"
RUNTIME="$(mktemp -d "$BASE/runtime.XXXXXX")"
/bin/chmod 755 "$RUNTIME"
/usr/bin/install -o root -g wheel -m 755 "$NODE_BIN" "$RUNTIME/node"
for file in auto_localize_watcher.js localization_engine.js package.json package-lock.json; do
    /usr/bin/install -o root -g wheel -m 644 "$DIR/$file" "$RUNTIME/$file"
done
for folder in dicts dicts_tw node_modules; do
    /bin/cp -R "$DIR/$folder" "$RUNTIME/$folder"
done
/usr/sbin/chown -R root:wheel "$RUNTIME"
/bin/chmod -R go-w "$RUNTIME"
"$RUNTIME/node" "$RUNTIME/node_modules/@electron/asar/bin/asar.mjs" --version

PLIST_TMP="$(mktemp "$BASE/launchd.XXXXXX")"
cat > "$PLIST_TMP" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$LABEL</string>
<key>ProgramArguments</key><array><string>$RUNTIME/node</string><string>$RUNTIME/auto_localize_watcher.js</string></array>
<key>WorkingDirectory</key><string>$RUNTIME</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
<key>RunAtLoad</key><true/>
<key>WatchPaths</key><array>
<string>/Applications/Antigravity.app</string>
<string>/Applications/Antigravity.app/Contents/Resources/app.asar</string>
<string>/Applications/Antigravity IDE.app</string>
<string>/Applications/Antigravity IDE.app/Contents/Resources/app.asar</string>
</array>
<key>StartInterval</key><integer>300</integer>
<key>ThrottleInterval</key><integer>30</integer>
<key>StandardOutPath</key><string>$LOG_DIR/autolocalize.log</string>
<key>StandardErrorPath</key><string>$LOG_DIR/autolocalize.log</string>
</dict></plist>
PLIST_EOF
/usr/bin/plutil -lint "$PLIST_TMP"

ACTUAL_USER="${SUDO_USER:-$(/usr/bin/stat -f%Su /dev/console)}"
AGENT_BACKUP=""
if [ "$ACTUAL_USER" != root ] && [ "$ACTUAL_USER" != loginwindow ]; then
    ACTUAL_UID="$(id -u "$ACTUAL_USER")"
    USER_DIR="$(/usr/bin/dscl . -read "/Users/$ACTUAL_USER" NFSHomeDirectory | /usr/bin/sed 's/^NFSHomeDirectory: //')"
    AGENT="$USER_DIR/Library/LaunchAgents/$LABEL.plist"
    /bin/launchctl bootout "gui/$ACTUAL_UID/$LABEL" 2>/dev/null || true
    if [ -f "$AGENT" ]; then
        AGENT_BACKUP="$AGENT.disabled-$(date +%Y%m%d%H%M%S)"
        /bin/mv "$AGENT" "$AGENT_BACKUP"
    fi
fi
/bin/launchctl bootout "system/$LABEL" 2>/dev/null || true
if [ -f "$PLIST" ]; then
    /bin/cp "$PLIST" "$BASE/previous-launchd.plist"
fi
/usr/bin/install -o root -g wheel -m 644 "$PLIST_TMP" "$PLIST"
/bin/rm -f "$PLIST_TMP"
/bin/launchctl enable "system/$LABEL"
if ! /bin/launchctl bootstrap system "$PLIST"; then
    /bin/mv "$PLIST" "$BASE/failed-launchd-$(date +%Y%m%d%H%M%S).plist"
    if [ -f "$BASE/previous-launchd.plist" ]; then
        /usr/bin/install -o root -g wheel -m 644 "$BASE/previous-launchd.plist" "$PLIST"
        /bin/launchctl bootstrap system "$PLIST" || true
    fi
    if [ -n "$AGENT_BACKUP" ]; then
        /bin/mv "$AGENT_BACKUP" "$AGENT"
        /bin/launchctl bootstrap "gui/$ACTUAL_UID" "$AGENT" || true
    fi
    echo "系統服務註冊失敗；已嘗試恢復先前服務，請檢查 launchctl 狀態。" >&2
    exit 1
fi
/bin/launchctl print "system/$LABEL"
echo "已註冊系統服務；觸發後以日誌與 exit code 確認套用結果。"
echo "日誌：$LOG_DIR/autolocalize.log"
echo "macOS 若仍拒絕 App Management，需在系統設定授權；root 不保證繞過系統保護。"
echo "舊服務設定與歷次 runtime 副本保留於原路徑及 $BASE，供復原。"
