/**
 * core/error-monitor.js
 * Client-side error capture — 抓 window.onerror + unhandledrejection + fetch 失敗
 * 存 ring buffer (localStorage) + 可視化錯誤看板
 * FORBIDDEN: no DOM queries (caller injects UI)
 */

const LS_KEY = 'crm-error-log';
const MAX = 50;

/** 單筆錯誤記錄 */
export function captureError(err) {
  const log = loadLog();
  log.push({
    at: new Date().toISOString(),
    msg: err.message || String(err),
    stack: (err.stack || '').split('\n').slice(0, 6).join('\n'),
    type: err.constructor?.name || 'Error',
    href: location.href,
  });
  // ring buffer
  while (log.length > MAX) log.shift();
  try { localStorage.setItem(LS_KEY, JSON.stringify(log)); } catch {}
}

export function loadLog() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}

export function clearLog() {
  try { localStorage.removeItem(LS_KEY); } catch {}
}

/** 啟動全域監聽 */
export function installGlobalCapture() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', e => {
    captureError(e.error || e);
    return false; // 不 prevent default
  });

  window.addEventListener('unhandledrejection', e => {
    const err = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
    captureError(err);
  });

  // Wrap fetch 以捕捉網路錯誤
  const origFetch = window.fetch;
  window.fetch = async (...args) => {
    try {
      const res = await origFetch(...args);
      if (!res.ok) {
        // 只捕捉 API call，不捕捉靜態資源
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        if (url && (url.includes('/api/') || url.includes('generativelanguage') || url.includes('anthropic') || url.includes('openrouter'))) {
          const body = await res.clone().text().catch(() => '');
          captureError(new Error(`HTTP ${res.status} ${url.slice(-60)} ${body.slice(0, 120)}`));
        }
      }
      return res;
    } catch (e) {
      captureError(new Error(`FETCH_FAIL: ${e.message}`));
      throw e;
    }
  };
}