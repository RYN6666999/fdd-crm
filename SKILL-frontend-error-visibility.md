# Skill: frontend-error-visibility

> 核心原則：**把隱性失敗變成顯性**
> 適用場景：前端部署後畫面空白、功能不動、JS 模組載入失敗

---

## 一、根本問題模式

```
JS 模組炸掉
    → 畫面靜默空白（沒有任何視覺提示）
    → 開發者只能「猜」
    → 嘗試大量無效修復
    → 浪費時間，信任崩潰
```

標準答案：**在猜之前，先讓錯誤說話。**

---

## 二、部署前：靜態驗證（攔截問題於上線之前）

### 2-1 語法檢查（必要但不足）

```bash
find src -name "*.js" | while read f; do
  node --check "$f" 2>&1 | grep -q "SyntaxError" && echo "❌ $f"
done
```

**限制**：只驗證語法，無法發現跨模組 import/export 不對應。

### 2-2 Import/Export 對應掃描（關鍵）

```js
// check-imports.mjs — 部署前必跑
import { readFileSync } from 'fs';

const mainSrc = readFileSync('./src/main.js', 'utf8');
const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
let m, errors = [];

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
      errors.push('❌ ' + name + '  ←  ' + relPath);
    }
  }
}

if (errors.length) { errors.forEach(e => console.error(e)); process.exit(1); }
else console.log('✅ All imports resolved');
```

**執行**：
```bash
node check-imports.mjs && npx wrangler pages deploy .
```

**典型錯誤**：
```
❌ onThemeChange  ←  ./features/settings/index.js
```
→ `settings/index.js` 沒有 export `onThemeChange`，但 `main.js` import 了它。
→ 這會導致整個模組圖崩潰，畫面靜默空白。

---

## 三、執行時：動態錯誤 Overlay（讓 runtime 錯誤顯示在畫面上）

### 3-1 加到 index.html（在 main.js script tag 之前）

```html
<!-- 全域錯誤攔截：捕捉模組載入失敗 -->
<script>
(function(){
  function showErr(msg) {
    var d = document.getElementById('_boot_err');
    if (!d) {
      d = document.createElement('div');
      d.id = '_boot_err';
      d.style.cssText = [
        'position:fixed;top:54px;left:0;right:0;z-index:99999',
        'background:#3a0000;color:#ff9090;padding:14px 16px',
        'font-size:12px;font-family:monospace;white-space:pre-wrap',
        'overflow:auto;max-height:50vh;border-bottom:2px solid #ff4444'
      ].join(';');
      document.body && document.body.appendChild(d);
    }
    d.textContent += msg + '\n';
  }
  window.addEventListener('error', function(e) {
    showErr('❌ ERROR: ' + (e.message||'') + '\n  at ' + (e.filename||'') + ':' + e.lineno);
  });
  window.addEventListener('unhandledrejection', function(e) {
    showErr('❌ PROMISE: ' + (e.reason?.stack || e.reason || e));
  });
})();
</script>

<script type="module" src="src/main.js"></script>
```

### 3-2 init() 也加 try/catch（補捉 async 錯誤）

```js
function bootWithErrorReport() {
  init().catch(err => {
    console.error('[BOOT ERROR]', err);
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:60px;left:0;right:0;z-index:99999;' +
      'background:#3a0000;color:#ff8080;padding:16px;font-size:13px;' +
      'font-family:monospace;white-space:pre-wrap;overflow:auto;max-height:40vh';
    div.textContent = '⚠️ 啟動錯誤:\n' + (err?.stack || err);
    document.body?.appendChild(div);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootWithErrorReport);
} else {
  bootWithErrorReport();
}
```

---

## 四、部署鏈驗證（改動前必做）

```bash
# 確認「我在改的目錄」和「線上實際來源」是同一份
curl -s https://your-app.pages.dev/sw.js | grep "const CACHE"
# 對比本地
grep "const CACHE" ./sw.js
```

若版本不一致 → 先找到真正的部署來源，再動手。

**常見陷阱**：
- `git push` 觸發的是 GitHub CI，不是 Cloudflare Pages
- `wrangler pages deploy` 直接上傳，跳過 Git
- 兩條路徑並存時，push 永遠無效

---

## 五、Debug SOP（按順序執行）

```
1. 驗證部署鏈
   curl 線上版本 vs 本地版本，確認是同一份

2. 加錯誤 Overlay（若尚未有）
   在 index.html 加全域 error/unhandledrejection 監聽

3. 訪問 /?bust=1 強制繞過 SW 快取
   https://your-app.pages.dev/?bust=1

4. 讀錯誤訊息
   紅色框出現 → 直接看錯誤，不猜
   沒有紅色框但畫面空白 → 問題在數據層（localStorage / API）

5. 修復後跑靜態驗證
   node check-imports.mjs

6. 部署
   npx wrangler pages deploy . --project-name xxx --commit-dirty=true
```

---

## 六、Service Worker 更新機制

```js
// sw.js activate — 觸發所有分頁強制重載
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(c => c.navigate(c.url)))
  );
  self.clients.claim();
});

// fetch — ?bust= 參數完全跳過快取
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.searchParams.has('bust')) {
    e.respondWith(
      fetch(e.request.url.replace(/[?&]bust=[^&]*/, ''), { cache: 'no-store' })
    );
    return;
  }
  // ... 其他策略
});
```

```js
// index.html — controllerchange 後強制 bust reload（iOS PWA 相容）
navigator.serviceWorker.addEventListener('controllerchange', function() {
  if (_reloading) return;
  _reloading = true;
  setTimeout(function() {
    window.location.replace(location.pathname + '?bust=' + Date.now());
  }, 800);
});
```

**重點**：iOS PWA 上 `window.location.reload()` 有時不生效，必須用 `location.replace('/?bust=時間戳')` 搭配 SW 的 no-store 處理。

---

## 七、部署鏈自動化（post-push hook）

**問題根源**：`git push` 只到 GitHub，Cloudflare Pages 沒有 CI/CD 連動，修復永遠不上線。

**解法**：git post-push hook 焊死兩條路：

```bash
# 安裝（一次性，換機器要重跑）
cat > .git/hooks/post-push << 'EOF'
#!/bin/bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" != "main" ] && exit 0

CHANGED=$(git diff --name-only HEAD~1 HEAD -- tools/crm/ 2>/dev/null)
[ -z "$CHANGED" ] && exit 0

echo "🚀 偵測到 tools/crm 變更，自動部署到 Cloudflare Pages..."
cd "$(git rev-parse --show-toplevel)/tools/crm"

node check-imports.mjs || { echo "❌ 驗證失敗，部署取消"; exit 1; }

SW_FILE="sw.js"
CURRENT=$(grep "const CACHE = 'fdd-crm-v" $SW_FILE | grep -o '[0-9]*' | tail -1)
NEXT=$((CURRENT + 1))
sed -i '' "s/fdd-crm-v${CURRENT}/fdd-crm-v${NEXT}/" $SW_FILE
echo "✓ SW cache: v${CURRENT} → v${NEXT}"

npx wrangler pages deploy . --project-name fdd-crm --branch main --commit-dirty=true
EOF
chmod +x .git/hooks/post-push
```

效果：`git push` = 驗證 + SW bump + wrangler 部署，一步到位。

**注意**：hook 只存本機，不進 git。

---

## 八、實戰教訓（2026-04-24）

```
症狀：設定頁主題格空白，反覆修復無效
根因：git push 從未觸發 CF Pages 部署
      線上一直是舊版（v48），本地已是 v49+修復版
浪費：多輪 debug，信任崩潰

診斷指令：
  curl -s https://fdd-crm.pages.dev/sw.js | grep "const CACHE"
  # 輸出 v48 ≠ 本地 v49 → 確認部署鏈斷裂

修復指令：
  npx wrangler pages deploy . --project-name fdd-crm --commit-dirty=true
  # 5 秒上線，問題立即解決
```

**教訓順序**：
1. **改之前先驗證部署鏈**，不然所有修復都是在本地自嗨
2. 修復後 `curl` 確認線上版本號，不信任 git push 的回傳訊息
3. 兩條部署路徑並存（git push vs wrangler）= 必然失憶，用 hook 焊死

---

## 九、核心原則總結

| 原則 | 做法 |
|------|------|
| 改之前先驗證部署鏈 | `curl` 線上版本 vs 本地版本號 |
| 靜態驗證不只是語法 | import/export 對應掃描 + 專項檢查 |
| 讓錯誤說話，不要猜 | 全域 error overlay |
| 快取問題用 bust 參數 | `?bust=時間戳` + SW no-store |
| 部署鏈唯一化 | post-push hook 自動觸發 wrangler |
| 修復後機器確認 | `curl` 比對版本號，不靠記憶 |
