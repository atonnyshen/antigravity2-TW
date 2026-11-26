#!/bin/bash
# 以 root 執行時，先把 PATH 換成系統目錄再執行任何指令：傳入的 PATH 可能把使用者可寫目錄排在前面，
# 讓同名的 dirname 等程式以 root 身分執行。傳入的 PATH 只留著找 node
if [ "$EUID" -eq 0 ]; then INCOMING_PATH="$PATH"; export PATH="/usr/bin:/bin:/usr/sbin:/sbin"; fi
cd "$(dirname "$0")"

# 檢查系統管理員權限，若非 root 則自動透過 sudo 提權
if [ "$EUID" -ne 0 ]; then
    echo "======================================================"
    echo " 提示：macOS 修改應用程式（/Applications）需要管理員權限"
    echo " 請在下方輸入您的電腦開機密碼（輸入時畫面不會顯示密碼，直接按 Enter）："
    echo "======================================================"
    # 提權後的 PATH 只放系統目錄與 node 所在目錄（系統目錄優先），不把使用者整條 PATH 交給 root，
    # 以免可寫目錄裡被替換的 bash 或其他程式以 root 身分執行
    USER_NODE="$(export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"; command -v node || true)"
    ROOT_PATH="/usr/bin:/bin:/usr/sbin:/sbin"
    if [ -n "$USER_NODE" ]; then ROOT_PATH="$ROOT_PATH:$(dirname "$USER_NODE")"; fi
    exec /usr/bin/sudo /usr/bin/env "PATH=$ROOT_PATH" /bin/bash "$0" "$@"
fi
# root 階段的 PATH 一律重建：系統目錄排最前，只另加 node 所在目錄。經由上面提權進來時 PATH 已是這個形式；
# 直接以 root 執行時，傳入的 PATH 順序不可信，只拿來找 node
ROOT_NODE="$(export PATH="${INCOMING_PATH:-$PATH}"; command -v node || true)"
if [ -z "$ROOT_NODE" ]; then
    for cand in /usr/local/bin/node /opt/homebrew/bin/node; do
        if [ -x "$cand" ]; then ROOT_NODE="$cand"; break; fi
    done
fi
export PATH="/usr/bin:/bin:/usr/sbin:/sbin${ROOT_NODE:+:$(dirname "$ROOT_NODE")}"

TARGET_USER="${SUDO_USER:-$USER}"
USER_HOME=$(eval echo "~$TARGET_USER")

# 若背景守護服務正在執行，先自動卸載，避免還原後被背景守護再次自動中文化
if [ -f "/Library/LaunchDaemons/com.antigravity.autolocalize.plist" ] || [ -f "$USER_HOME/Library/LaunchAgents/com.antigravity.autolocalize.plist" ]; then
    echo "⚡ 偵測到背景自動更新守護服務正在運作。"
    echo "   為防止還原後背景守護再度將其自動重套繁中，正在為您同步停止並卸載守護服務..."
    bash ./uninstall_macos_autowatcher.sh 2>/dev/null || true
    /usr/bin/sudo -u "$TARGET_USER" /bin/bash ./uninstall_macos_autowatcher.sh 2>/dev/null || true
    echo ""
fi

echo "======================================================"
echo "    正在還原 macOS 版 Antigravity 官方原版英文"
echo "======================================================"
node localization_engine.js --huifu --install-dir /Applications/Antigravity.app

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ 執行失敗！請檢查上方錯誤訊息。"
    read -n 1 -s
    exit 1
fi

echo ""
echo "🎉 處理完成！視窗將在 5 秒後自動關閉（或按任意鍵立即關閉）..."
read -t 5 -n 1 -s
