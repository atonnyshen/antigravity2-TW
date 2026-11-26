#!/bin/bash
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
ROOT_NODE="$(command -v node || true)"
if [ -z "$ROOT_NODE" ]; then
    for cand in /usr/local/bin/node /opt/homebrew/bin/node; do
        if [ -x "$cand" ]; then ROOT_NODE="$cand"; break; fi
    done
fi
export PATH="/usr/bin:/bin:/usr/sbin:/sbin${ROOT_NODE:+:$(dirname "$ROOT_NODE")}"

TARGET_USER="${SUDO_USER:-$USER}"
USER_HOME=$(/usr/bin/dscl . -read "/Users/$TARGET_USER" NFSHomeDirectory 2>/dev/null | /usr/bin/sed 's/^NFSHomeDirectory: //' || eval echo "~$TARGET_USER")

echo "======================================================"
echo "    正在安裝 macOS 版 Antigravity 繁體中文（台灣）套件"
echo "======================================================"
echo ""
echo "請選擇左上角品牌名稱顯示方式："
echo "[1] 顯示官方英文 Antigravity（推薦）"
echo "[2] 隱藏品牌名稱"
echo "[3] 顯示繁體中文品牌名（反重力）"
printf "請輸入 1/2/3（直接按 Enter 預設為 1）："
read -r BRAND_CHOICE
BRAND_ARG="--brand-title english"
if [ "$BRAND_CHOICE" = "2" ]; then
    BRAND_ARG="--brand-title hidden"
elif [ "$BRAND_CHOICE" = "3" ]; then
    BRAND_ARG="--brand-title translated"
fi

node localization_engine.js --tw $BRAND_ARG --sync-watcher --install-dir /Applications/Antigravity.app "$@"

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ 執行失敗！請檢查上方錯誤訊息。"
    read -n 1 -s
    exit 1
fi

WATCHER_UPDATED=0
SYSTEM_PLIST="/Library/LaunchDaemons/com.antigravity.autolocalize.plist"
USER_PLIST="$USER_HOME/Library/LaunchAgents/com.antigravity.autolocalize.plist"
if [ -f "$SYSTEM_PLIST" ]; then
    echo ""
    echo "🔄 偵測到本機已啟用系統級背景守護服務，正在同步升級至最新版以防舊版覆寫..."
    bash ./install_macos_autowatcher.sh --daemon && WATCHER_UPDATED=1
elif [ -f "$USER_PLIST" ]; then
    echo ""
    echo "🔄 偵測到本機已啟用使用者級背景守護服務，正在同步升級至最新版以防舊版覆寫..."
    /usr/bin/sudo -u "$TARGET_USER" HOME="$USER_HOME" /bin/bash ./install_macos_autowatcher.sh --user && WATCHER_UPDATED=1
fi

echo ""
echo "🎉 繁體中文套件安裝完成。"
if [ "$WATCHER_UPDATED" -eq 0 ]; then
    echo "💡 說明：若需在 Antigravity 官方更新或詞庫發布時自動維持繁中化，"
    echo "   可執行目錄內的「點兩下安裝macOS背景守護.command」啟用背景服務。"
fi
echo ""
echo "視窗將於 5 秒後自動關閉（亦可按任意鍵立即離開）..."
read -t 5 -n 1 -s
