#!/bin/bash
set -e
cd "$(dirname "$0")"
bash install_macos_autowatcher.sh
echo "服務安裝完成；可查看 /Library/Logs/Antigravity2TW/autolocalize.log。"
read -t 5 -n 1 -s || true
