/**
 * integrations/gcal.js
 * Google Calendar 整合：OAuth flow + 讀取行程
 * 依賴：core/toast.js
 */

import { toast } from '../core/toast.js';

// ── OAuth helpers ─────────────────────────────────────────────────────────────

export async function getGcalToken() {
  try {
    const res = await fetch('/api/gcal/token');
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch { return null; }
}

export async function startGcalOAuth() {
  try {
    const res = await fetch('/api/gcal/auth-url');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const { url } = await res.json();
    if (url) window.location.href = url;
  } catch (e) {
    toast('無法啟動 Google Calendar 授權：' + e.message);
  }
}

export async function disconnectGcal() {
  try {
    await fetch('/api/gcal/disconnect', { method: 'POST' });
    toast('已中斷 Google Calendar 連結');
    updateGcalStatus();
  } catch (e) {
    toast('中斷失敗：' + e.message);
  }
}

// ── Fetch events ──────────────────────────────────────────────────────────────

export async function fetchGcalEvents(days = 30) {
  try {
    const res = await fetch(`/api/gcal/events?days=${days}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.events || [];
  } catch { return []; }
}

// ── Status UI ─────────────────────────────────────────────────────────────────

export async function updateGcalStatus() {
  const el = document.getElementById('gcal-status');
  if (!el) return;
  const token = await getGcalToken();
  el.textContent = token ? '✅ 已連結 Google Calendar' : '⚠ 尚未連結';
  el.className   = token ? 'status-ok' : 'status-warn';
}

export function renderGcalCard() {
  updateGcalStatus();
}
