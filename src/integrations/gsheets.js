/**
 * integrations/gsheets.js
 * Google Sheets 業績同步（選用）
 * 依賴：core/toast.js
 */

import { toast } from '../core/toast.js';

export async function syncSalesToSheets(salesData) {
  try {
    const res = await fetch('/api/gsheets/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ salesData }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    toast('✅ 業績已同步至 Google Sheets');
  } catch (e) {
    toast('同步失敗：' + e.message);
  }
}

export async function fetchSalesFromSheets() {
  try {
    const res = await fetch('/api/gsheets/sales');
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
