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
# 確認「我在改的目錄」和「線上實際來源」是同一份（比對檔案 hash）
curl -s https://your-app.pages.dev/index.html | md5 -q
md5 -q ./index.html
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

3. 硬重新整理（Cmd+Shift+R）
   本專案已無 Service Worker，_headers 對 HTML/JS/CSS 設 no-cache，
   一般重新整理就會拿到最新版；硬重整只是為了排除瀏覽器 disk cache

4. 讀錯誤訊息
   紅色框出現 → 直接看錯誤，不猜
   沒有紅色框但畫面空白 → 問題在數據層（localStorage / API）

5. 修復後跑靜態驗證
   node check-imports.mjs

6. 部署
   npx wrangler pages deploy . --project-name xxx --commit-dirty=true
```

---

## 六、Service Worker：已移除（2026-07-07 定案）

過去這一節教的是 SW 更新機制。從 v206 bump 到 v301 共 95 次版本遞增都治不好
「改了看不到、重新整理沒用」，最終定案：**移除 SW，改純 manifest PWA**。

現在的架構：

- **新鮮度唯一機制**：`_headers` 對 HTML/JS/CSS 設 `Cache-Control: no-cache, must-revalidate`
  → 瀏覽器每次載入向 CF revalidate（304 很快），部署即生效
- **sw.js 是 kill switch**：解除舊裝置的 SW 註冊 + 清光快取 + 重載。永久保留、不准改回快取邏輯
- **manifest.json 保留**：加主畫面/全螢幕/icon 照舊，PWA 體驗零損失（安裝不需要 SW）
- **不需要任何版本號**：沒有 APP_VERSION、沒有 `?bust=`、部署不 bump 任何東西
- **`.githooks/pre-commit` 是守門員**：擋 `serviceWorker.register`、擋 sw.js 加快取邏輯、擋刪 `_headers`

**教訓**：SW 更新地獄有三個獨立根因（waiting 生命週期、sw.js 本身被 HTTP 快取、
cache-first 的舊 shell），bump 版本號一個都碰不到。當你發現自己在「加強更新機制」，
就是在治標 —— 正確動作是問「這層快取為什麼要存在」。這個專案的答案是：不需要存在。

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

npx wrangler pages deploy . --project-name fdd-crm --branch main --commit-dirty=true
EOF
chmod +x .git/hooks/post-push
```

效果：`git push` = 驗證 + wrangler 部署，一步到位。
（無 SW 架構下不需要 bump 任何版本，部署即生效。）

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
