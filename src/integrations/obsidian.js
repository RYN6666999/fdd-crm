/**
 * integrations/obsidian.js
 * Obsidian vault 整合 — 讀取、搜尋、備份
 * 依賴：core/toast.js
 * REST API 透過 Obsidian Local REST API 插件（預設 port 27123）
 */

import { toast } from '../core/toast.js';

function _base() {
  return localStorage.getItem('crm-obsidian-url') || 'http://localhost:27123';
}
function _headers() {
  const t = localStorage.getItem('crm-obsidian-token') || '';
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** 檢查 Obsidian 是否已連結 */
export function isObsidianLinked() {
  return !!localStorage.getItem('crm-obsidian-token');
}

/** 備份內容到 Obsidian vault */
export async function backupToObsidian(content, filename) {
  try {
    const url = `${_base()}/vault/${encodeURIComponent(filename)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/markdown', ..._headers() },
      body: content,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    toast(`✅ 已備份至 Obsidian: ${filename}`);
  } catch (e) {
    toast('Obsidian 備份失敗：' + e.message);
  }
}

/** 從 Obsidian 讀取指定檔案 */
export async function readFromObsidian(filename) {
  try {
    const url = `${_base()}/vault/${encodeURIComponent(filename)}`;
    const res = await fetch(url, { headers: _headers() });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

/**
 * 搜尋 Obsidian vault 中的筆記
 * @param {string} query 搜尋關鍵字
 * @param {number} limit 最多回傳幾份筆記
 * @returns {Array<{filename:string, content:string, score:number}>}
 */
export async function searchObsidian(query, limit = 3) {
  try {
    // 先列出 vault 中的所有檔案
    const listUrl = `${_base()}/vault/`;
    const listRes = await fetch(listUrl, { headers: _headers() });
    if (!listRes.ok) return [];

    const files = await listRes.json();
    const mdFiles = (files.files || files || [])
      .filter(f => typeof f === 'string' ? f.endsWith('.md') : (f.name || '').endsWith('.md'))
      .slice(0, 30); // 最多掃 30 份

    const q = query.toLowerCase();
    const results = [];

    for (const f of mdFiles) {
      const fname = typeof f === 'string' ? f : (f.name || '');
      const content = await readFromObsidian(fname);
      if (!content) continue;

      // 簡單全文比對評分
      const lower = content.toLowerCase();
      let score = 0;
      if (lower.includes(q)) score += q.length / lower.length * 10;
      // 檔名匹配加分
      if (fname.toLowerCase().includes(q)) score += 5;
      if (score > 0.5) {
        const excerpt = _extractExcerpt(content, q);
        results.push({ filename: fname, content: excerpt, score });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  } catch { return []; }
}

function _extractExcerpt(text, keyword, windowChars = 200) {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return text.slice(0, windowChars);
  const start = Math.max(0, idx - Math.floor(windowChars / 2));
  const end = Math.min(text.length, idx + keyword.length + Math.floor(windowChars / 2));
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}
