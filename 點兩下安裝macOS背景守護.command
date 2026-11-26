#!/bin/bash
set -e
# 以 root 執行時，先把 PATH 換成系統目錄再執行任何指令：傳入的 PATH 可能把使用者可寫目錄排在前面，
# 讓同名的 dirname 等程式以 root 身分執行。傳入的 PATH 只留著找 node
if [ "$EUID" -eq 0 ]; then export INCOMING_PATH="$PATH"; export PATH="/usr/bin:/bin:/usr/sbin:/sbin"; fi
cd "$(dirname "$0")"
bash install_macos_autowatcher.sh
echo "背景自動更新守護服務安裝完成。"
read -t 5 -n 1 -s || true
