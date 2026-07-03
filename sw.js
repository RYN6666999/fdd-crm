/* ═══════════════════════════════════════
   房多多經營系統 — Service Worker
   策略：
     HTML/JS/CSS → Network-First + stale-while-revalidate
     圖片/字型   → Cache-First（離線可用）
   版本號每次部署+1 → 確保 SW 更新
   ═══════════════════════════════════════ */
const CACHE = 'fdd-crm-v205';
const PRECACHE = [
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './manifest.json',
];

/* 安裝：預快取靜態圖示，不快取 HTML/JS */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
  self.skipWaiting(); // 立即接管所有頁面
});

/* 啟動：清掉舊快取，並通知所有頁面新 SW 已就緒 */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => {
        for (const client of clients) {
          // 發送訊息通知頁面更新 SW，而不是 navigate
          client.postMessage({ type: 'SW_UPDATED', cache: CACHE });
        }
      })
  );
  self.clients.claim();
});

/* 攔截請求 */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // ?bust= 跳過快取
  if (url.searchParams.has('bust')) {
    e.respondWith(fetch(e.request.url.replace(/[?&]bust=[^&]*/,''), { cache: 'no-store' }));
    return;
  }

  const isNav = e.request.mode === 'navigate';
  const isAsset = /\.(js|css|html)(\?.*)?$/.test(url.pathname);

  if (isNav || isAsset) {
    // Network-First + stale-while-revalidate：網路回 fast 時更新快取
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // Cache-First：圖片等靜態資源
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});
