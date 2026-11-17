#!/bin/bash
set -e
cd "$(dirname "$0")"
bash install_macos_autowatcher.sh
echo "背景自動更新守護服務安裝完成。"
read -t 5 -n 1 -s || true
