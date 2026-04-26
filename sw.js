/* ═══════════════════════════════════════
   房多多經營系統 — Service Worker
   策略：HTML/JS/CSS → Network-First（部署後立即生效）
         圖片/字型   → Cache-First（離線可用）
═══════════════════════════════════════ */
const CACHE = 'fdd-crm-v49';
const PRECACHE = [
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './manifest.json',
];

/* 安裝：只預快取靜態圖示，不快取 HTML/JS */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

/* 啟動：清掉舊快取，並通知所有頁面重載 */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(c => c.navigate(c.url)))
  );
  self.clients.claim();
});

/* 攔截請求 */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 只處理同源請求
  if (url.origin !== location.origin) return;

  // ?bust= 強制更新請求 → 完全不走快取
  if (url.searchParams.has('bust')) {
    e.respondWith(fetch(e.request.url.replace(/[?&]bust=[^&]*/,''), { cache: 'no-store' }));
    return;
  }

  const isNav = e.request.mode === 'navigate';
  const isAsset = /\.(js|css|html)(\?.*)?$/.test(url.pathname);

  if (isNav || isAsset) {
    // Network-First：先走網路，失敗才用快取（確保部署後立即生效）
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
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
