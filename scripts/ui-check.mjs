#!/usr/bin/env node
/**
 * ui-check.mjs — 靜默失敗偵測器
 * Playwright 開本地預覽，攔截 console.error/network 4xx/ES module 失敗/未捕獲異常/UI 元素缺失/頁面空白
 * Usage: node scripts/ui-check.mjs [--url http://...] [--screenshot]
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';

const args = process.argv.slice(2);
const urlArg = args.indexOf('--url');
const BASE_URL = urlArg !== -1 ? args[urlArg + 1] : 'http://localhost:8799';
const TAKE_SCREENSHOT = args.includes('--screenshot');
const SHOT_DIR = 'screenshots';
if (TAKE_SCREENSHOT && !existsSync(SHOT_DIR)) mkdirSync(SHOT_DIR);

const issues = { errors: [], warnings: [], networkErrors: [], pageErrors: [], moduleErrors: [], uiChecks: [] };

// CSP / font origins 不攔 — 本地預覽才缺
const CSP_ORIGINS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

function log(emoji, msg) { console.log(`  ${emoji} ${msg}`); }
function fail(cat, msg) { issues[cat].push(msg); console.log(`  ❌ ${msg}`); }
function pass(msg) { console.log(`  ✅ ${msg}`); }

async function main() {
  console.log(`\nfdd-crm UI 檢查 | ${BASE_URL}\n`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // intercept
  page.on('console', msg => {
    const t = msg.type(), text = msg.text();
    if (t === 'error') {
      if (text.includes('Failed to fetch dynamically imported module') || text.includes('Importing a module script failed')) {
        fail('moduleErrors', `[ES Module] ${text}`);
      } else { issues.errors.push(text); log('🔴', `[console.error] ${text}`); }
    } else if (t === 'warning') { issues.warnings.push(text); log('🟡', `[console.warn] ${text}`); }
  });
  page.on('pageerror', err => fail('pageErrors', `[uncaught] ${err.message}`));
  page.on('requestfailed', req => {
    const u = req.url();
    if (u.includes('favicon') || CSP_ORIGINS.some(o => u.includes(o))) return;
    fail('networkErrors', `[${req.failure()?.errorText || 'unknown'}] ${u}`);
  });
  page.on('response', res => {
    const s = res.status(), u = res.url();
    if (s >= 400 && !u.includes('favicon') && !CSP_ORIGINS.some(o => u.includes(o))) fail('networkErrors', `[HTTP ${s}] ${u}`);
  });

  // 1. 注入 session bypass 登入守衛 + 載入
  console.log('━ 1. 登入 + 載入首頁 ━━━━━━━━━━━━━━━━━━━━');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  // 注入假登入資料 bypass login guard
  await page.evaluate(() => {
    localStorage.setItem('crm-login', JSON.stringify({ name: '測試用戶', rank: 'manager', rankLabel: '經理', ts: new Date().toISOString() }));
    localStorage.setItem('crm-profile-rank', 'manager');
  });
  // reload → login guard 看到已登入 → 不 redirect
  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  pass('登入完成');
  await page.waitForTimeout(2000);

  // 2. UI elements
  console.log('\n━ 2. 關鍵元素 ─━━━━━━━━━━━━━━━━━━━━━━━━━');
  const UI_SELECTORS = {
    'app-layout': '.app-layout', sidebar: '.sidebar',
    'main-content': '.main-content', 'nav-buttons': '[data-page]',
    'ai-chat-container': '#ai-chat, .chat-container',
    'ai-provider-select': '#ai-provider-select', 'obsidian-url': '#obsidian-url',
  };
  for (const [name, sel] of Object.entries(UI_SELECTORS)) {
    const el = await page.$(sel);
    el ? pass(`${name} (${await el.isVisible() ? '可見' : '隱藏'})`) : log('⚪', `${name} 未找到`);
  }

  // 3. module check
  console.log('\n━ 3. ES Module ─━━━━━━━━━━━━━━━━━━━━━━━━━');
  const mc = await page.evaluate(() => {
    const r = [];
    document.querySelectorAll('script[type="module"]').forEach(s => r.push({ src: s.src, loaded: true }));
    ['renderSettingsPage', 'applyTheme', 'doLogout'].forEach(fn => r.push({ windowFn: fn, exists: typeof window[fn] === 'function' }));
    return r;
  });
  for (const r of mc) {
    r.src ? pass(r.src.split('/').pop()) : (r.exists ? pass(`window.${r.windowFn}`) : fail('moduleErrors', `window.${r.windowFn} 未掛載`));
  }

  // 4. 頁面導覽 — 實際 sidebar 用 switchPage(name) 不是 navigate
  console.log('\n━ 4. 頁面導覽 ─━━━━━━━━━━━━━━━━━━━━━━━━━');
  // 先點 sidebar 按鈕
  const sidebarBtns = await page.$$('.sidebar-item');
  const pageNames = ['daily', 'crm', 'events', 'sales', 'docs', 'ai', 'settings'];
  for (let i = 0; i < sidebarBtns.length && i < pageNames.length; i++) {
    const name = pageNames[i];
    await sidebarBtns[i].click({ force: true });
    await page.waitForTimeout(1000);
    const len = await page.evaluate(() => (document.querySelector('.main-content') || document.body).textContent.trim().length);
    len > 5 ? pass(`${name} (${len} 字)`) : fail('uiChecks', `${name} 空白`);
    if (TAKE_SCREENSHOT) await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
  }

  // 5. settings 細節檢查
  console.log('\n━ 5. 設定功能 ─━━━━━━━━━━━━━━━━━━━━━━━━━');
  // 點 settings
  const settingsBtn = await page.$('.sidebar-item[data-page="settings"]');
  if (settingsBtn) { await settingsBtn.click({ force: true }); await page.waitForTimeout(2000); }
  // 等 loading 消失
  await page.waitForSelector('#loading-overlay', { state: 'hidden', timeout: 5000 }).catch(() => {});

  (await page.$('#obsidian-url')) && (await page.$('#obsidian-token')) ? pass('Obsidian UI 存在') : fail('uiChecks', 'Obsidian UI 缺失');
  (await page.$('#ai-provider-select option[value="cline"]')) ? pass('Cline provider 選項存在') : fail('uiChecks', 'Cline provider 缺失');
  const themeN = await page.$$eval('[data-theme], .theme-item', els => els.length).catch(() => 0);
  themeN > 0 ? pass(`主題: ${themeN} 個`) : log('⚪', '未找到主題網格');

  // 6. SW
  console.log('\n━ 6. Service Worker ─━━━━━━━━━━━━━━━━━━━━━');
  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const regs = await navigator.serviceWorker.getRegistrations();
    return { supported: true, count: regs.length, scopes: regs.map(r => r.scope) };
  });
  sw.supported ? (sw.count > 0 ? pass(`已註冊 (${sw.count})`) : log('⚪', '未註冊 (localhost 正常)')) : log('⚪', '不支援 SW');

  if (TAKE_SCREENSHOT) {
    await page.screenshot({ path: `${SHOT_DIR}/dashboard.png` });
    pass(`截圖→${SHOT_DIR}/`);
  }
  await browser.close();
  printReport();
}

function printReport() {
  const counts = { errors: issues.errors.length, warnings: issues.warnings.length, networkErrors: issues.networkErrors.length, pageErrors: issues.pageErrors.length, moduleErrors: issues.moduleErrors.length, uiChecks: issues.uiChecks.length };
  const totalFail = counts.networkErrors + counts.pageErrors + counts.moduleErrors + issues.uiChecks.filter(u => u.startsWith('[fail]')).length;
  console.log(`\n━ 報告 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  Object.entries(counts).forEach(([c, n]) => console.log(`  ${n === 0 ? '✅' : '❌'} ${c.padEnd(16)} ${n}`));
  console.log(`\n  ❌ 致命: ${totalFail}  🟡 警告: ${counts.warnings + issues.uiChecks.filter(u => !u.startsWith('[fail]')).length}`);
  if (totalFail === 0) { console.log('\n  ✅ 全部通過\n'); process.exit(0); }
  console.log('\n  問題詳情見上方日誌\n');
  ['moduleErrors', 'pageErrors', 'networkErrors'].forEach(cat => {
    if (issues[cat].length) { console.log(`  📌 ${cat}:`); issues[cat].forEach(e => console.log(`     ${e}`)); console.log(); }
  });
  process.exit(1);
}

main().catch(e => { console.error('腳本異常:', e); process.exit(2); });