import { readFileSync } from 'fs';

let errors = [];
let passed = 0;

// ── 1. Import/Export 對應掃描 ────────────────────────────────────────────────
const mainSrc = readFileSync('./src/main.js', 'utf8');
const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
let m;

while ((m = importRe.exec(mainSrc)) !== null) {
  const names = m[1].split(',')
    .map(n => n.trim().replace(/\s+as\s+\w+/, '').trim())
    .filter(Boolean);
  const relPath = m[2];
  if (!relPath.startsWith('./') && !relPath.startsWith('../')) continue;

  const absPath = './src/' + relPath.replace(/^\.\//, '') +
    (relPath.endsWith('.js') ? '' : '.js');

  let src;
  try { src = readFileSync(absPath, 'utf8'); }
  catch { errors.push('FILE NOT FOUND: ' + absPath); continue; }

  for (const name of names) {
    if (!src.match(new RegExp('export[^{]*\\b' + name + '\\b'))) {
      errors.push('❌ import missing export: ' + name + '  ←  ' + relPath);
    } else {
      passed++;
    }
  }
}

// ── 2. navigate('settings') 必須呼叫 renderThemeGrid ────────────────────────
const settingsBlock = mainSrc.match(/case\s*'settings':[\s\S]*?break/);
if (!settingsBlock) {
  errors.push('❌ navigate settings case 不存在');
} else if (!settingsBlock[0].includes('renderThemeGrid')) {
  errors.push('❌ navigate(settings) 未呼叫 renderThemeGrid()');
} else {
  passed++;
}

// ── 3. settings/index.js 必須 export renderThemeGrid & applyTheme ───────────
const settingsSrc = readFileSync('./src/features/settings/index.js', 'utf8');
for (const fn of ['renderThemeGrid', 'applyTheme', 'initTheme']) {
  if (!settingsSrc.match(new RegExp('export\\s+function\\s+' + fn))) {
    errors.push('❌ settings/index.js 缺少 export function ' + fn);
  } else {
    passed++;
  }
}

// ── 4. window.__crmApplyTheme 必須被綁定 ────────────────────────────────────
if (!mainSrc.includes('__crmApplyTheme')) {
  errors.push('❌ main.js 未綁定 window.__crmApplyTheme');
} else {
  passed++;
}

// ── 5. index.html theme-grid 容器存在 ───────────────────────────────────────
const htmlSrc = readFileSync('./index.html', 'utf8');
if (!htmlSrc.includes('id="settings-theme-grid"')) {
  errors.push('❌ index.html 缺少 #settings-theme-grid');
} else {
  passed++;
}

// ── 結果 ──────────────────────────────────────────────────────────────────────
console.log('\n── CRM 靜態驗證 ──────────────────────────────────────────');
if (errors.length) {
  errors.forEach(e => console.error(e));
  console.error(`\n結果：${passed} 通過 / ${errors.length} 失敗 ❌\n`);
  process.exit(1);
} else {
  console.log(`✅ 全部 ${passed} 項通過\n`);
}
