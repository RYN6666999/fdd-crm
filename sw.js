/* ═══════════════════════════════════════
   房多多經營系統 — Service Worker Kill Switch
   PWA 改為純 manifest（無 SW）。此檔的唯一任務：
   讓所有已安裝舊 SW 的裝置自我解除註冊、清光快取、重新載入。
   永久保留此檔（成本為零），確保晚歸的舊裝置也能被救回。
   ═══════════════════════════════════════ */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) c.navigate(c.url);
  })());
});
