/**
 * commands.js
 * 指令守門員：CMD guard + COMMANDS registry + DRAFT feature flag
 * 依賴：無（純邏輯）
 */

// ── Feature flags (DRAFT = 未上線功能) ────────────────────────────────────────

export const DRAFT = {
  studentPage:   false,
  gsheets:       false,
  obsidianSync:  false,
  posterGen:     true,    // 海報生成（beta）
};

// ── Command registry ──────────────────────────────────────────────────────────
// key → { label, defaultEnabled }

export const COMMANDS = {
  // Canvas
  'node.add':       { label: '新增節點',     defaultEnabled: true },
  'node.delete':    { label: '刪除節點',     defaultEnabled: true },
  'node.edit':      { label: '編輯節點',     defaultEnabled: true },
  'node.copy':      { label: '複製節點',     defaultEnabled: true },
  'node.cut':       { label: '剪下節點',     defaultEnabled: true },
  'node.paste':     { label: '貼上節點',     defaultEnabled: true },
  'node.status':    { label: '切換狀態',     defaultEnabled: true },
  'node.collapse':  { label: '折疊節點',     defaultEnabled: true },
  // Panel
  'panel.save':     { label: '儲存面板',     defaultEnabled: true },
  'panel.contact':  { label: '記錄聯繫',     defaultEnabled: true },
  // Events
  'event.open':     { label: '開啟活動',     defaultEnabled: true },
  'event.save':     { label: '儲存活動',     defaultEnabled: true },
  'event.delete':   { label: '刪除活動',     defaultEnabled: true },
  // Students
  'student.add':    { label: '新增學員',     defaultEnabled: true },
  'student.delete': { label: '刪除學員',     defaultEnabled: true },
  // Docs
  'doc.add':        { label: '新增文件',     defaultEnabled: true },
  'doc.delete':     { label: '刪除文件',     defaultEnabled: true },
  // Sales
  'sales.add':      { label: '新增業績',     defaultEnabled: true },
  'sales.delete':   { label: '刪除業績',     defaultEnabled: true },
  // AI
  'ai.send':        { label: '發送 AI 訊息', defaultEnabled: true },
  'ai.clear':       { label: '清除對話',     defaultEnabled: true },
};

// ── CMD guard object ──────────────────────────────────────────────────────────

const _disabled = new Set(
  JSON.parse(localStorage.getItem('crm-disabled-commands') || '[]')
);

export const CMD = {
  allowed(key) {
    if (!COMMANDS[key]) return true;       // unknown command → allow
    return !_disabled.has(key);
  },

  disable(key) {
    _disabled.add(key);
    _persist();
  },

  enable(key) {
    _disabled.delete(key);
    _persist();
  },

  toggle(key) {
    if (_disabled.has(key)) this.enable(key); else this.disable(key);
  },

  isDisabled(key) { return _disabled.has(key); },

  listAll() {
    return Object.entries(COMMANDS).map(([k, v]) => ({
      key: k, label: v.label, enabled: !_disabled.has(k),
    }));
  },
};

function _persist() {
  localStorage.setItem('crm-disabled-commands', JSON.stringify([..._disabled]));
}
