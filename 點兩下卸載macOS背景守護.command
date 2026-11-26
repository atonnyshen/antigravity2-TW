#!/bin/bash
set -e
# 以 root 執行時，先把 PATH 換成系統目錄再執行任何指令：傳入的 PATH 可能把使用者可寫目錄排在前面，
# 讓同名的 dirname 等程式以 root 身分執行
if [ "$EUID" -eq 0 ]; then export PATH="/usr/bin:/bin:/usr/sbin:/sbin"; fi
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
