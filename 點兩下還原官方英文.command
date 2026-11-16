#!/bin/bash
cd "$(dirname "$0")"

# 檢查系統管理員權限，若非 root 則自動透過 sudo 提權
if [ "$EUID" -ne 0 ]; then
    echo "======================================================"
    echo " 提示：macOS 修改應用程式（/Applications）需要管理員權限"
    echo " 請在下方輸入您的電腦開機密碼（輸入時畫面不會顯示密碼，直接按 Enter）："
    echo "======================================================"
    exec sudo bash "$0" "$@"
fi

TARGET_USER="${SUDO_USER:-$USER}"
USER_HOME=$(eval echo "~$TARGET_USER")

# 若背景守護服務正在執行，先自動卸載，避免還原後被背景守護再次自動中文化
if [ -f "$USER_HOME/Library/LaunchAgents/com.antigravity.autolocalize.plist" ]; then
    echo "⚡ 偵測到背景自動更新守護服務正在運作。"
    echo "   為防止還原後背景守護再度將其自動重套繁中，正在為您同步停止並卸載守護服務..."
    sudo -u "$TARGET_USER" bash ./uninstall_macos_autowatcher.sh 2>/dev/null || true
    echo ""
fi

echo "======================================================"
echo "    正在還原 macOS 版 Antigravity 官方原版英文"
echo "======================================================"
node localization_engine.js --huifu --install-dir /Applications/Antigravity.app

# 若有安裝 VS Code 擴充套件中文化，一併詢問或還原
if [ -d "$USER_HOME/.vscode/extensions" ]; then
    echo ""
    echo "⚡ 正在檢查並還原 VS Code 官方擴充套件為官方原版英文..."
    sudo -u "$TARGET_USER" node ./localize_vscode_extension.js --restore 2>/dev/null || true
fi

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ 執行失敗！請檢查上方錯誤訊息。"
    read -n 1 -s
    exit 1
fi

echo ""
echo "🎉 處理完成！視窗將在 5 秒後自動關閉（或按任意鍵立即關閉）..."
read -t 5 -n 1 -s
