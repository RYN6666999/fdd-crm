/**
 * integrations/obsidian.js
 * Obsidian vault 備份（via n8n webhook 或直接 REST API）
 * 依賴：core/toast.js
 */

import { toast } from '../core/toast.js';

const OBSIDIAN_BASE = localStorage.getItem('crm-obsidian-url') || 'http://localhost:27123';

export async function backupToObsidian(content, filename) {
  try {
    const url = `${OBSIDIAN_BASE}/vault/${encodeURIComponent(filename)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/markdown', Authorization: `Bearer ${localStorage.getItem('crm-obsidian-token') || ''}` },
      body: content,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    toast(`✅ 已備份至 Obsidian: ${filename}`);
  } catch (e) {
    toast('Obsidian 備份失敗：' + e.message);
  }
}

export async function readFromObsidian(filename) {
  try {
    const url = `${OBSIDIAN_BASE}/vault/${encodeURIComponent(filename)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${localStorage.getItem('crm-obsidian-token') || ''}` },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}
