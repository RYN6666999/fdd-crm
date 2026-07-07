#!/bin/bash
# 唯一正確的部署指令 — 永遠部署到 production (main branch)
# PWA 無 SW，新鮮度由 _headers 的 no-cache 保證，不需要 bump 任何版本號
set -e

npx wrangler pages deploy . --project-name fdd-crm --branch main --commit-dirty=true
echo "✅ 已部署到 https://fdd-crm.pages.dev"
