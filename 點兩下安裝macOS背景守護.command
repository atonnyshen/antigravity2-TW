#!/bin/bash
cd "$(dirname "$0")"

# 檢查系統管理員權限，若非 root 則自動透過 sudo 提權安裝為系統級 LaunchDaemon
if [ "$EUID" -ne 0 ]; then
    echo "======================================================"
    echo " 提示：安裝 macOS 背景自動守護服務（LaunchDaemon）需要管理員權限"
    echo " 這能確保未來官方更新時在背景 100% 靜默完成繁體中文化，不再跳出權限阻擋"
    echo " 請在下方輸入您的電腦開機密碼（輸入時畫面不會顯示密碼，直接按 Enter）："
    echo "======================================================"
    exec sudo bash "$0" "$@"
fi

bash install_macos_autowatcher.sh

echo ""
echo "🎉 處理完成！視窗將在 5 秒後自動關閉（或按任意鍵立即關閉）..."
read -t 5 -n 1 -s
