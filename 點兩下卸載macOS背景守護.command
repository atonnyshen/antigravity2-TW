#!/bin/bash
cd "$(dirname "$0")"

if [ -f "/Library/LaunchDaemons/com.antigravity.autolocalize.plist" ] && [ "$EUID" -ne 0 ]; then
    exec sudo bash "$0" "$@"
fi

bash uninstall_macos_autowatcher.sh

echo ""
echo "視窗將在 5 秒後自動關閉（或按任意鍵立即關閉）..."
read -t 5 -n 1 -s
