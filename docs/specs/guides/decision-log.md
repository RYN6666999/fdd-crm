# fdd-crm 架構決策記錄

## SW → 純 manifest PWA（2026-07-06）

### 已定案的決策

fdd-crm **已移除 Service Worker，改為純 manifest PWA**。原因：這個 CRM 不需要離線功能，而 SW 是過去所有「改了看不到、重新整理沒用、要一直 bump 版本」問題的唯一根源。從 v206 bump 到 v301，共 95 次版本號遞增，都在修同一個問題 —— 因為那條路本身就是錯的。

### 觀念一：PWA ≠ Service Worker

「加到主畫面」「全螢幕」「app icon」這些 PWA 體驗**只需要 manifest.json**，不需要 SW。SW 只提供兩樣東西：離線快取和推播。這個專案兩樣都不需要。所以拔掉 SW 之後，它仍然是完整的 PWA，使用者體驗零損失，但快取問題從根本上不存在了。

### 觀念二：為什麼「bump 版本號」永遠治不好

SW 更新地獄有三個獨立根因，bump 版本號一個都碰不到：

1. **SW 生命週期**：新 SW 裝好後預設卡在 waiting，舊 SW 繼續控制頁面直到所有分頁關閉。使用者按重新整理沒用，因為 reload 不會讓新 SW 接管。
2. **sw.js 檔案本身會被 HTTP 快取**：瀏覽器要先抓到新的 sw.js 才知道有更新。這由 server 的 `Cache-Control` header 決定，跟 SW 程式碼裡寫什麼完全無關。改一百次 SW 程式碼都影響不了這一層。
3. **被 SW 快取住的舊 HTML 指向舊資源**：cache-first 的 app shell 會讓入口永遠是舊的。

bump 版本號只是在第 3 層繞路，第 1、2 層原封不動，所以症狀反覆變形、永遠修不完。**當你發現自己在「加強更新機制」，就是在治標。正確動作是回頭問：這層快取為什麼存在？**

### 觀念三：新鮮度由 HTTP header 管理，且只由它管理

現在整個專案的「使用者看到最新版」由**唯一一個機制**保證：`_headers` 檔案裡對 HTML/JS/CSS 的 `Cache-Control: no-cache, must-revalidate`。瀏覽器每次載入都會向 Cloudflare revalidate（ETag 比對，沒變就是快速的 304），部署後立即生效。

推論：
- **不需要** `?v=`、`?bust=` 之類的 query param。這些參數是歷史遺留，無害，但**永遠不需要再 bump 它們**。你改了 CSS 或 JS，部署即生效，不用改任何版本號。
- **單一機制是刻意設計**。兩套新鮮度機制（header + query param）會讓除錯時無法判斷是哪一套失效。不要「保險起見」加回第二套。

### 觀念四：刪 SW 不是刪程式碼就完事 —— 舊裝置上的 SW 還活著

已經安裝過舊 SW 的手機，SW 會一直控制頁面。所以現在的 `sw.js` 是一個 **kill switch**：舊裝置的瀏覽器最慢 24 小時內會重新檢查 sw.js（瀏覽器對 SW script 有 24 小時強制上限，且 `_headers` 對它設了 `no-store`），抓到 kill switch 後自動：解除註冊 → 清光所有快取 → 重新載入。index.html 底部也有一段頁面端 unregister 善後碼，雙保險。

推論：**sw.js 這個檔案要永久保留**，因為永遠可能有一台幾個月沒開 app 的舊手機需要被它救回。它看起來「沒在做事」，那正是它的工作。

### 四條鐵則

1. **不准加 Service Worker。** 任何「離線支援」「更快載入」「預快取」的念頭，先停下來問使用者。
2. **不准動 `_headers`。** 它是唯一的新鮮度機制。
3. **不准加或 bump 任何版本參數。** 沒有 APP_VERSION，沒有 ?bust=，不需要。
4. **部署一律 `./deploy.sh`。** 它帶了 `--project-name fdd-crm --branch main`，保證進 production。`npm run deploy` 沒有 `--branch main`，依賴當下 git branch，不要用。

### 相關檔案

| 檔案 | 角色 |
|------|------|
| `_headers` | 唯一新鮮度機制 — `Cache-Control: no-cache` for JS/CSS/HTML |
| `sw.js` | Kill switch — 救回舊裝置，永久保留 |
| `index.html` 底部 script | 頁面端善後 — 每次載入自動 unregister SW + 清快取 |
| `deploy.sh` | 唯一正確部署指令 |