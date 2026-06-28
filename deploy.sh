#!/bin/bash
# 唯一正確的部署指令 — 永遠部署到 production (main branch)
set -e

# 自動 bump SW cache 版本，強制 PWA 更新
SW_FILE="sw.js"
CURRENT=$(grep "const CACHE = 'fdd-crm-v" $SW_FILE | grep -o '[0-9]*' | tail -1)
NEXT=$((CURRENT + 1))
sed -i '' "s/fdd-crm-v${CURRENT}/fdd-crm-v${NEXT}/" $SW_FILE
echo "✓ SW cache: v${CURRENT} → v${NEXT}"

# 自動 bump main.js 版本參數，強制瀏覽器抓新檔案
HTML_FILE="index.html"
sed -i '' "s|src=\"src/main.js?v=[0-9]*\"|src=\"src/main.js?v=$(date +%s)\"|" $HTML_FILE
echo "✓ JS version bumped in index.html"

npx wrangler pages deploy . --project-name fdd-crm --branch main --commit-dirty=true
echo "✓ 已部署到 https://fdd-crm.pages.dev"
