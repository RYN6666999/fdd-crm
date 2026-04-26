/**
 * features/settings/index.js
 * 設定頁：主題、快捷鍵說明、資料匯入匯出、帳號資料
 * 依賴：core/state.js, core/store.js, core/toast.js
 */

import { getNodes, getEvents, getSalesData, getDailyReports, getMonthlySalesTargets, getDocsData, dispatch } from '../../core/state.js';
import { STORE, K } from '../../core/store.js';
import { toast } from '../../core/toast.js';

// ── Theme ─────────────────────────────────────────────────────────────────────

export const THEMES = [
  { id: 'dark',       label: '深色',      icon: '🌑' },
  { id: 'dark-blue',  label: '深藍',      icon: '🌌' },
  { id: 'light',      label: '淺色',      icon: '☀️' },
  { id: 'light-warm', label: '暖色',      icon: '🌤' },
  { id: 'sage-gold',  label: '清新金綠',  icon: '🛫' },
  { id: 'impact',     label: 'Impact',   icon: '⚡' },
  { id: 'neuo',       label: '浮凸 2.5D', icon: '🪨' },
];

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('crm-theme', theme);
}

export function initTheme() {
  const saved = localStorage.getItem('crm-theme') || 'dark';
  applyTheme(saved);
}

export function renderThemeGrid() {
  const tg = document.getElementById('settings-theme-grid');
  if (!tg) return;
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  tg.innerHTML = THEMES.map(t => `
    <div class="theme-tile${cur === t.id ? ' active' : ''}" onclick="window.__crmApplyTheme?.('${t.id}')">
      <div class="theme-tile-icon">${t.icon}</div>
      <div class="theme-tile-label">${t.label}</div>
    </div>`).join('');
}

// ── Login / account ───────────────────────────────────────────────────────────

export function renderLoginCard() {
  const login = JSON.parse(localStorage.getItem('crm-login') || '{}');
  const nameEl = document.getElementById('settings-name-input');
  const rankEl = document.getElementById('settings-rank-select');
  if (nameEl) nameEl.value = login.name || '';
  if (rankEl) rankEl.value = login.rank || 'director';
}

export function saveLogin() {
  const name = document.getElementById('settings-name-input')?.value.trim() || '';
  const rank = document.getElementById('settings-rank-select')?.value || 'director';
  localStorage.setItem('crm-login', JSON.stringify({ name, rank }));
  // Sync rank into STORE so CALC picks it up
  localStorage.setItem(K.profileRank, rank);
  toast('帳號資料已儲存');
}

// ── AI Chat Backup ────────────────────────────────────────────────────────────

/**
 * 匯出 AI 對話備份：
 *   - crm-chat-sessions（所有聯絡人 × 所有場景的完整對話）
 *   - crm-chat（目前活躍對話）
 *   - CRM_MEMORIES KV（所有記憶條目，含封存）
 */
export async function exportAiData() {
  const btn = document.getElementById('ai-backup-export-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 匯出中…'; }

  try {
    // 1. localStorage 對話紀錄
    const chatSessions = JSON.parse(localStorage.getItem('crm-chat-sessions') || '{}');
    const activeChat   = JSON.parse(localStorage.getItem('crm-chat') || '[]');

    // 2. 記憶庫（KV）
    let memories = [];
    try {
      const res = await fetch('/api/memories?includeArchived=true');
      if (res.ok) memories = (await res.json()).memories || [];
    } catch { /* 離線時跳過 */ }

    // 3. 統計數字
    let totalMsgs = 0;
    for (const contact of Object.values(chatSessions)) {
      for (const thread of Object.values(contact.threads || {})) {
        totalMsgs += thread.messages?.length || 0;
      }
    }

    const payload = {
      version:   2,
      exportedAt: new Date().toISOString(),
      stats: {
        contacts:    Object.keys(chatSessions).length,
        totalMsgs,
        memories:    memories.length,
      },
      chatSessions,
      activeChat,
      memories,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `crm-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast(`AI 對話備份完成：${Object.keys(chatSessions).length} 位聯絡人，${totalMsgs} 則對話，${memories.length} 條記憶`);
    _renderAiBackupStats(chatSessions, memories.length);
  } catch (e) {
    toast('備份失敗：' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬇ 匯出 AI 對話備份'; }
  }
}

/**
 * 匯入 AI 對話備份（覆寫 chatSessions + activeChat，合併記憶庫）
 */
export async function importAiData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.chatSessions && !data.memories) throw new Error('格式不正確（缺少 chatSessions 或 memories）');

      const sessionCount = Object.keys(data.chatSessions || {}).length;
      const memCount     = (data.memories || []).length;
      if (!confirm(`確定匯入？\n• ${sessionCount} 位聯絡人的對話紀錄\n• ${memCount} 條記憶\n\n對話紀錄會覆蓋，記憶庫為合併新增。`)) return;

      const btn = document.getElementById('ai-backup-import-btn');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ 匯入中…'; }

      // 還原 localStorage
      if (data.chatSessions) localStorage.setItem('crm-chat-sessions', JSON.stringify(data.chatSessions));
      if (data.activeChat)   localStorage.setItem('crm-chat', JSON.stringify(data.activeChat));

      // 合併記憶庫（跳過 summary 超長的）
      let memImported = 0;
      let memSkipped  = 0;
      for (const mem of (data.memories || [])) {
        if (!mem.type || !mem.subject || !mem.summary) { memSkipped++; continue; }
        if ((mem.summary || '').length > 120)          { memSkipped++; continue; }
        try {
          const res = await fetch('/api/memories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type:     mem.type,
              subject:  mem.subject,
              summary:  mem.summary,
              detail:   mem.detail  || null,
              keywords: mem.keywords || [],
              pinned:   mem.pinned   || false,
              source:   'manual',
            }),
          });
          if (res.ok) memImported++;
          else        memSkipped++;
        } catch { memSkipped++; }
      }

      toast(`匯入完成：${sessionCount} 位聯絡人對話，記憶 ${memImported} 條成功 / ${memSkipped} 條略過`);
      _renderAiBackupStats(data.chatSessions || {}, memImported);
      if (btn) { btn.disabled = false; btn.textContent = '⬆ 匯入 AI 對話備份'; }
    } catch (err) {
      toast('匯入失敗：' + err.message);
    }
  };
  reader.readAsText(file);
}

/** 渲染備份統計摘要 */
function _renderAiBackupStats(sessions, memCount) {
  const el = document.getElementById('ai-backup-stats');
  if (!el) return;
  const contacts = Object.values(sessions);
  let totalMsgs = 0, threadList = [];
  for (const c of contacts) {
    for (const [tname, t] of Object.entries(c.threads || {})) {
      const n = t.messages?.length || 0;
      totalMsgs += n;
      threadList.push({ name: c.contactName, thread: tname, count: n, ts: t.updatedAt });
    }
  }
  threadList.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const rows = threadList.slice(0, 8).map(r =>
    `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border)">
       <span><b>${r.name}</b> › ${r.thread}</span>
       <span style="color:var(--text-muted)">${r.count} 則</span>
     </div>`
  ).join('');
  el.innerHTML = `
    <div style="margin-bottom:6px;font-size:12px;color:var(--text-muted)">
      共 <b>${contacts.length}</b> 位聯絡人・<b>${totalMsgs}</b> 則對話・<b>${memCount}</b> 條記憶
    </div>
    ${rows}
    ${threadList.length > 8 ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">…還有 ${threadList.length - 8} 個場景</div>` : ''}`;
}

/** 在設定頁初始化時顯示現有統計 */
export function renderAiBackupCard() {
  const sessions = JSON.parse(localStorage.getItem('crm-chat-sessions') || '{}');
  _renderAiBackupStats(sessions, '—');
}

// ── Export ────────────────────────────────────────────────────────────────────

export function exportData() {
  const data = {
    exportedAt: new Date().toISOString(),
    nodes:       getNodes(),
    events:      getEvents(),
    salesData:   getSalesData(),
    dailyReports: getDailyReports(),
    monthlySalesTargets: getMonthlySalesTargets(),
    docsData:    getDocsData(),
    login:       JSON.parse(localStorage.getItem('crm-login') || '{}'),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `crm-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('資料已匯出');
}

// ── Import ────────────────────────────────────────────────────────────────────

export function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.nodes) throw new Error('格式不正確');
      if (!confirm(`確定匯入？這會覆蓋現有資料（${data.nodes.length} 個節點）`)) return;

      if (data.nodes)        dispatch({ type: 'NODES_LOAD',    payload: data.nodes });
      if (data.events)       dispatch({ type: 'EVENTS_SET',   payload: data.events });
      if (data.salesData)    dispatch({ type: 'SALES_SET',                 payload: data.salesData });
      if (data.dailyReports) dispatch({ type: 'DAILY_REPORTS_SET',        payload: data.dailyReports });
      if (data.monthlySalesTargets) dispatch({ type: 'MONTHLY_SALES_TARGETS_SET', payload: data.monthlySalesTargets });
      if (data.docsData)     dispatch({ type: 'DOCS_SET',                 payload: data.docsData });
      if (data.login)        localStorage.setItem('crm-login', JSON.stringify(data.login));

      toast(`匯入完成（${data.nodes.length} 個節點）`);
      window.__crmFullRefresh?.();
    } catch (err) {
      toast('匯入失敗：' + err.message);
    }
  };
  reader.readAsText(file);
}

// ── Keyboard shortcuts help ───────────────────────────────────────────────────

export const SHORTCUTS_HELP = [
  { keys: 'Ctrl/⌘ + Z',   desc: '復原（Undo）' },
  { keys: 'Ctrl/⌘ + C',   desc: '複製選取節點' },
  { keys: 'Ctrl/⌘ + X',   desc: '剪下選取節點' },
  { keys: 'Ctrl/⌘ + V',   desc: '貼上節點' },
  { keys: 'Delete / ⌫',   desc: '刪除選取節點' },
  { keys: 'Tab',           desc: '新增子節點' },
  { keys: 'Enter',         desc: '新增兄弟節點' },
  { keys: 'Escape',        desc: '關閉面板 / 取消選取' },
  { keys: 'F',             desc: 'Fit View（自動縮放）' },
  { keys: '+/-',           desc: '放大 / 縮小' },
];

export function renderShortcutsHelp() {
  const el = document.getElementById('shortcuts-help-list');
  if (!el) return;
  el.innerHTML = SHORTCUTS_HELP.map(s =>
    `<div class="shortcut-row"><kbd>${s.keys}</kbd><span>${s.desc}</span></div>`
  ).join('');
}

// ── Shortcuts modal ───────────────────────────────────────────────────────────

const DEFAULT_SK = {
  undo: 'z', copy: 'c', cut: 'x', paste: 'v',
  addChild: 'Tab', addSibling: 'Enter', fitView: 'f', zoomIn: '+', zoomOut: '-',
};

function _loadSk() {
  try { return JSON.parse(localStorage.getItem('crm-shortcuts') || 'null') || { ...DEFAULT_SK }; }
  catch { return { ...DEFAULT_SK }; }
}

function _saveSk(sk) { localStorage.setItem('crm-shortcuts', JSON.stringify(sk)); }

export function openSkModal() {
  const modal = document.getElementById('sk-modal');
  if (!modal) return;
  const sk = _loadSk();
  const body = document.getElementById('sk-body');
  if (body) {
    const rows = Object.entries(DEFAULT_SK).map(([action, defaultKey]) => {
      const cur = sk[action] || defaultKey;
      return `<div class="sk-row">
        <span class="sk-action">${action}</span>
        <input class="sk-key-input field-input" data-action="${action}" value="${cur}"
          style="width:80px;text-align:center"
          onfocus="this.select()"
          onkeydown="event.preventDefault();if(event.key&&event.key.length===1||['Tab','Enter','Escape','Delete','Backspace','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){this.value=event.key;window.__crmSaveShortcut?.('${action}',event.key);}">
      </div>`;
    }).join('');
    body.innerHTML = rows;
  }
  modal.classList.add('open');
}

export function closeSkModal() {
  document.getElementById('sk-modal')?.classList.remove('open');
}

export function resetShortcuts() {
  _saveSk({ ...DEFAULT_SK });
  toast('快捷鍵已恢復預設');
  // Re-render if modal is open
  if (document.getElementById('sk-modal')?.classList.contains('open')) openSkModal();
}

export function saveShortcut(action, key) {
  const sk = _loadSk();
  sk[action] = key;
  _saveSk(sk);
}

// ── Commands policy ───────────────────────────────────────────────────────────

export function setCmdMode(mode) {
  localStorage.setItem('crm-cmd-mode', mode);
  renderCmdList();
}

export function resetCmdPolicy() {
  localStorage.removeItem('crm-cmd-mode');
  localStorage.removeItem('crm-disabled-commands');
  toast('指令策略已恢復預設');
  renderCmdList();
}

export function renderCmdList() {
  const el = document.getElementById('cmd-list');
  if (!el) return;
  const filterEl = document.getElementById('cmd-filter');
  const q = (filterEl?.value || '').toLowerCase();
  const mode = localStorage.getItem('crm-cmd-mode') || 'blacklist';
  const modeSel = document.getElementById('cmd-mode-select');
  if (modeSel) modeSel.value = mode;
  const disabled = new Set(JSON.parse(localStorage.getItem('crm-disabled-commands') || '[]'));
  const CMDS = [
    'node.add','node.delete','node.edit','node.copy','node.cut','node.paste','node.status','node.collapse',
    'panel.save','panel.contact','event.open','event.save','event.delete',
    'student.add','student.delete','doc.add','doc.delete','sales.add','sales.delete','ai.send','ai.clear',
  ];
  const filtered = q ? CMDS.filter(k => k.includes(q)) : CMDS;
  el.innerHTML = filtered.map(k => {
    const on = !disabled.has(k);
    return `<div class="cmd-row" style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
      <input type="checkbox" ${on ? 'checked' : ''} onchange="window.__crmToggleCmd?.('${k}',this.checked)">
      <span style="font-size:12px;flex:1">${k}</span>
      <span style="font-size:11px;color:${on?'var(--green)':'var(--red)'}">${on?'啟用':'停用'}</span>
    </div>`;
  }).join('');
}

// ── Google integration stubs ──────────────────────────────────────────────────

export function resetGoogleClientId() {
  if (!confirm('確定清除 Google 授權？')) return;
  fetch('/api/gcal/disconnect', { method: 'POST' }).catch(() => {});
  toast('已清除 Google 日曆授權');
  const el = document.getElementById('gcal-status');
  if (el) { el.textContent = '未連結'; el.className = ''; }
}

export function startSheetsOAuth() {
  toast('Google Sheets 授權（功能開發中）');
}

export function resetSheetsAuth() {
  localStorage.removeItem('crm-gsheets-token');
  const el = document.getElementById('gsheets-status');
  if (el) el.textContent = '未連結';
  toast('已清除 Sheets 授權');
}

export function saveSheetsId() {
  const val = document.getElementById('gsheets-id-input')?.value.trim() || '';
  localStorage.setItem('crm-gsheets-id', val);
  toast('試算表 ID 已儲存');
}

// ── Obsidian path ─────────────────────────────────────────────────────────────

export function saveObsidianPath() {
  const val = document.getElementById('obsidian-path')?.value || '';
  localStorage.setItem('crm-obsidian-path', val);
  localStorage.setItem('crm-obsidian-url', `http://localhost:27123`);
}

export function openObsidianVault() {
  const path = localStorage.getItem('crm-obsidian-path') || '';
  if (!path) { toast('請先填入 Vault 路徑'); return; }
  window.open(`obsidian://open?vault=${encodeURIComponent(path.split('/').pop())}`, '_blank');
}

export function renderObsidianPath() {
  const el = document.getElementById('obsidian-path');
  if (el) el.value = localStorage.getItem('crm-obsidian-path') || '';
}

// ── OB_BACKUP object (File System Access API) ─────────────────────────────────

export const OB_BACKUP = {
  _dirHandle: null,

  async requestDir() {
    try {
      if (!window.showDirectoryPicker) { toast('瀏覽器不支援 File System Access API'); return; }
      this._dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const btn   = document.getElementById('ob-backup-btn');
      const clear = document.getElementById('ob-backup-clear');
      if (btn)   btn.textContent = `✅ ${this._dirHandle.name}`;
      if (clear) clear.style.display = 'inline-flex';
      toast('已授權 Obsidian 資料夾：' + this._dirHandle.name);
    } catch (e) {
      if (e.name !== 'AbortError') toast('授權失敗：' + e.message);
    }
  },

  clear() {
    this._dirHandle = null;
    const btn   = document.getElementById('ob-backup-btn');
    const clear = document.getElementById('ob-backup-clear');
    if (btn)   btn.textContent = '📁 授權 Obsidian 資料夾';
    if (clear) clear.style.display = 'none';
    toast('已清除 Obsidian 資料夾設定');
  },

  async writeBackup(data) {
    if (!this._dirHandle) return false;
    try {
      const filename = `CRM-${new Date().toISOString().slice(0, 10)}.json`;
      const fh = await this._dirHandle.getFileHandle(filename, { create: true });
      const w  = await fh.createWritable();
      await w.write(JSON.stringify(data, null, 2));
      await w.close();
      return true;
    } catch { return false; }
  },
};

// ── Clear all data ────────────────────────────────────────────────────────────

export function clearAllData() {
  if (!confirm('確定清除所有資料？此操作無法復原！')) return;
  if (!confirm('再次確認：這將刪除所有人脈、活動、業績記錄！')) return;
  dispatch({ type: 'NODES_LOAD',    payload: [] });
  dispatch({ type: 'EVENTS_SET',   payload: [] });
  dispatch({ type: 'SALES_SET',                 payload: {} });
  dispatch({ type: 'DAILY_REPORTS_SET',         payload: {} });
  dispatch({ type: 'MONTHLY_SALES_TARGETS_SET', payload: {} });
  dispatch({ type: 'DOCS_SET',                  payload: [] });
  toast('所有資料已清除');
  window.__crmFullRefresh?.();
}
