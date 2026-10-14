#!/bin/bash
set -euo pipefail

if [ "$(uname -s)" != Darwin ]; then
    echo "此安裝程式僅適用 macOS。" >&2
    exit 1
fi

MODE="auto"
for arg in "$@"; do
    case "$arg" in
        --user) MODE="user" ;;
        --daemon) MODE="daemon" ;;
    esac
done

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
    exec bash "$DIR/install_macos_autowatcher.sh" "$@"
fi

cd "$DIR"

# 尋找可用的 Node.js 執行檔 (支援官方獨立安裝、Homebrew 或環境 PATH)
NODE_BIN=""
CANDIDATES=(
    "/usr/local/bin/node"
    "/opt/homebrew/bin/node"
    "$(command -v node 2>/dev/null || true)"
)
for prev_node in /Library/Application\ Support/Antigravity2TW/runtime.*/node; do
    if [ -x "$prev_node" ]; then
        CANDIDATES+=("$prev_node")
    fi
done

for cand in "${CANDIDATES[@]}"; do
    if [ -n "$cand" ] && [ -x "$cand" ]; then
        if "$cand" -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<12)) process.exit(1)' 2>/dev/null; then
            NODE_BIN="$cand"
            break
        fi
    fi
done

if [ -z "$NODE_BIN" ]; then
    echo "請先安裝 Node.js 22.12+ (可透過 nodejs.org 官方套件或 brew install node)。" >&2
    exit 1
fi

# 依賴安裝
if [ ! -f "$DIR/node_modules/@electron/asar/bin/asar.mjs" ]; then
    echo "安裝鎖定依賴..."
    npm ci --ignore-scripts --no-audit --no-fund
fi

LABEL="com.antigravity.autolocalize"
ACTUAL_USER="${SUDO_USER:-$(/usr/bin/stat -f%Su /dev/console 2>/dev/null || echo "$USER")}"
CURRENT_UID="$(id -u)"

# 若已有官方 app.asar 且尚未建立 .bak，在具寫入權限時預先備份，避免背景服務建立新檔遭遇權限阻礙
for cand_app in "/Applications/Antigravity.app" "/Applications/Antigravity IDE.app" "$HOME/Applications/Antigravity.app" "$HOME/Applications/Antigravity IDE.app"; do
    cand_asar="$cand_app/Contents/Resources/app.asar"
    cand_bak="$cand_asar.bak"
    if [ -f "$cand_asar" ] && [ ! -f "$cand_bak" ]; then
        if [ -w "$(dirname "$cand_asar")" ]; then
            /bin/cp "$cand_asar" "$cand_bak" 2>/dev/null || true
            /bin/chmod 644 "$cand_bak" 2>/dev/null || true
        fi
    fi
done

# 判定安裝模式：系統級 LaunchDaemon 或使用者級 LaunchAgent
IS_DAEMON=0
if [ "$MODE" = "daemon" ]; then
    IS_DAEMON=1
elif [ "$MODE" = "user" ]; then
    IS_DAEMON=0
else
    # auto mode
    if [ "$EUID" -eq 0 ]; then
        IS_DAEMON=1
    elif sudo -n true 2>/dev/null; then
        IS_DAEMON=1
    else
        TARGET_ASAR="/Applications/Antigravity.app/Contents/Resources/app.asar"
        if [ -w "/Applications/Antigravity.app" ] || [ -w "$TARGET_ASAR" ] || [ ! -e "/Applications/Antigravity.app" ]; then
            IS_DAEMON=0
        else
            echo "偵測到目標應用程式需要管理員權限，嘗試提權..."
            exec sudo /bin/bash "$DIR/install_macos_autowatcher.sh" --daemon
        fi
    fi
fi

if [ "$IS_DAEMON" -eq 1 ] && [ "$EUID" -ne 0 ]; then
    echo "以管理員認證安裝系統服務..."
    exec sudo /bin/bash "$DIR/install_macos_autowatcher.sh" --daemon
fi

if [ "$IS_DAEMON" -eq 1 ]; then
    echo "🛡️ 安裝為系統級 LaunchDaemon 守護服務..."
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
    /bin/chmod 755 "$BASE" "$LOG_DIR"
    if [ ! -f "$LOG_DIR/autolocalize.log" ]; then
        /usr/bin/install -o root -g wheel -m 644 /dev/null "$LOG_DIR/autolocalize.log"
    else
        /bin/chmod 644 "$LOG_DIR/autolocalize.log"
    fi
    
    RUNTIME="$(mktemp -d "$BASE/runtime.XXXXXX")"
    /bin/chmod 755 "$RUNTIME"
    /usr/bin/install -o root -g wheel -m 755 "$NODE_BIN" "$RUNTIME/node"
    for file in auto_localize_watcher.js localization_engine.js package.json package-lock.json; do
        /usr/bin/install -o root -g wheel -m 644 "$DIR/$file" "$RUNTIME/$file"
    done
    for folder in dicts dicts_tw node_modules; do
        /bin/cp -R "$DIR/$folder" "$RUNTIME/$folder"
    done
    if [ -d "$DIR/scripts" ]; then
        /bin/cp -R "$DIR/scripts" "$RUNTIME/scripts"
    fi
    /usr/sbin/chown -R root:wheel "$RUNTIME"
    /bin/chmod -R go-w "$RUNTIME"
    
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
    
    if [ "$ACTUAL_USER" != root ] && [ "$ACTUAL_USER" != loginwindow ]; then
        ACTUAL_UID="$(id -u "$ACTUAL_USER" 2>/dev/null || echo 501)"
        USER_DIR="$(/usr/bin/dscl . -read "/Users/$ACTUAL_USER" NFSHomeDirectory 2>/dev/null | /usr/bin/sed 's/^NFSHomeDirectory: //' || echo "$HOME")"
        AGENT="$USER_DIR/Library/LaunchAgents/$LABEL.plist"
        /bin/launchctl bootout "gui/$ACTUAL_UID/$LABEL" 2>/dev/null || true
        if [ -f "$AGENT" ]; then
            /bin/mv "$AGENT" "$AGENT.disabled-$(date +%Y%m%d%H%M%S)"
        fi
    fi
    
    /bin/launchctl bootout "system/$LABEL" 2>/dev/null || true
    if [ -f "$PLIST" ]; then
        /bin/cp "$PLIST" "$BASE/previous-launchd.plist"
    fi
    /usr/bin/install -o root -g wheel -m 644 "$PLIST_TMP" "$PLIST"
    /bin/rm -f "$PLIST_TMP"
    /bin/launchctl enable "system/$LABEL"
    /bin/launchctl bootstrap system "$PLIST"
    /bin/launchctl print "system/$LABEL"
    echo "🎉 LaunchDaemon 系統級守護服務已成功安裝並啟動！"
    echo "日誌路徑：$LOG_DIR/autolocalize.log"
else
    echo "👤 安裝為使用者級 LaunchAgent 守護服務..."
    USER_HOME="$HOME"
    TARGET_DIR="$USER_HOME/Library/LaunchAgents"
    PLIST="$TARGET_DIR/$LABEL.plist"
    LOG_DIR="$USER_HOME/Library/Logs/Antigravity2TW"
    BASE="$USER_HOME/Library/Application Support/Antigravity2TW"
    
    mkdir -p "$TARGET_DIR" "$LOG_DIR" "$BASE"
    chmod 755 "$TARGET_DIR" "$LOG_DIR" "$BASE"
    touch "$LOG_DIR/autolocalize.log"
    chmod 644 "$LOG_DIR/autolocalize.log"
    
    RUNTIME="$BASE/runtime"
    mkdir -p "$RUNTIME"
    for file in auto_localize_watcher.js localization_engine.js package.json package-lock.json; do
        cp "$DIR/$file" "$RUNTIME/$file"
    done
    for folder in dicts dicts_tw node_modules; do
        cp -R "$DIR/$folder" "$RUNTIME/$folder"
    done
    if [ -d "$DIR/scripts" ]; then
        cp -R "$DIR/scripts" "$RUNTIME/scripts"
    fi
    
    PLIST_TMP="$(mktemp "$BASE/launchd.XXXXXX")"
    cat > "$PLIST_TMP" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$LABEL</string>
<key>ProgramArguments</key><array><string>$NODE_BIN</string><string>$RUNTIME/auto_localize_watcher.js</string></array>
<key>WorkingDirectory</key><string>$RUNTIME</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
<key>RunAtLoad</key><true/>
<key>WatchPaths</key><array>
<string>/Applications/Antigravity.app</string>
<string>/Applications/Antigravity.app/Contents/Resources/app.asar</string>
<string>/Applications/Antigravity IDE.app</string>
<string>/Applications/Antigravity IDE.app/Contents/Resources/app.asar</string>
<string>$USER_HOME/Applications/Antigravity.app</string>
<string>$USER_HOME/Applications/Antigravity.app/Contents/Resources/app.asar</string>
<string>$USER_HOME/Applications/Antigravity IDE.app</string>
<string>$USER_HOME/Applications/Antigravity IDE.app/Contents/Resources/app.asar</string>
</array>
<key>StartInterval</key><integer>300</integer>
<key>ThrottleInterval</key><integer>30</integer>
<key>StandardOutPath</key><string>$LOG_DIR/autolocalize.log</string>
<key>StandardErrorPath</key><string>$LOG_DIR/autolocalize.log</string>
</dict></plist>
PLIST_EOF
    /usr/bin/plutil -lint "$PLIST_TMP"
    
    /bin/launchctl bootout "gui/$CURRENT_UID/$LABEL" 2>/dev/null || true
    mv "$PLIST_TMP" "$PLIST"
    chmod 644 "$PLIST"
    /bin/launchctl enable "gui/$CURRENT_UID/$LABEL" 2>/dev/null || true
    /bin/launchctl bootstrap "gui/$CURRENT_UID" "$PLIST"
    /bin/launchctl print "gui/$CURRENT_UID/$LABEL"
    echo "🎉 LaunchAgent 使用者級守護服務已成功安裝並啟動！"
    echo "日誌路徑：$LOG_DIR/autolocalize.log"
fi
