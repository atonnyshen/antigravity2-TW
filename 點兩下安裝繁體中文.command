#!/bin/bash
cd "$(dirname "$0")"

# 檢查系統管理員權限，若非 root 則自動透過 sudo 提權
if [ "$EUID" -ne 0 ]; then
    npm ci --ignore-scripts --no-audit --no-fund || exit 1
    echo "======================================================"
    echo " 提示：macOS 修改應用程式（/Applications）需要管理員權限"
    echo " 請在下方輸入您的電腦開機密碼（輸入時畫面不會顯示密碼，直接按 Enter）："
    echo "======================================================"
    exec sudo bash "$0" "$@"
fi

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

node localization_engine.js --tw $BRAND_ARG --install-dir /Applications/Antigravity.app "$@"

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ 執行失敗！請檢查上方錯誤訊息。"
    read -n 1 -s
    exit 1
fi

echo ""
echo "🎉 處理完成！視窗將在 5 秒後自動關閉（或按任意鍵立即關閉）..."
read -t 5 -n 1 -s
