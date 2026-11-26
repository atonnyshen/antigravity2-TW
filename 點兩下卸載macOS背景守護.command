#!/bin/bash
set -e
cd "$(dirname "$0")"

if [ -f "/Library/LaunchDaemons/com.antigravity.autolocalize.plist" ] && [ "$EUID" -ne 0 ]; then
    # 卸載只用到系統指令：提權後只給系統目錄，bash 用絕對路徑
    ROOT_PATH="/usr/bin:/bin:/usr/sbin:/sbin"
    exec /usr/bin/sudo /usr/bin/env "PATH=$ROOT_PATH" /bin/bash "$0" "$@"
fi

bash uninstall_macos_autowatcher.sh

echo ""
echo "視窗將在 5 秒後自動關閉（或按任意鍵立即關閉）..."
read -t 5 -n 1 -s || true
