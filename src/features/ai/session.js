/**
 * features/ai/session.js
 * Per-contact, per-thread conversation session (localStorage)
 *
 * Structure:
 *   sessions[contactId] = {
 *     contactName,
 *     threads: { [threadName]: { messages, updatedAt } },
 *     activeThread
 *   }
 */

const STORE_KEY   = 'crm-chat-sessions';
const MAX_MSG     = 60;
const MAX_THREADS = 10; // per contact

// ── Preset thread names ───────────────────────────────────────────────────────

export const PRESET_THREADS = ['邀約推演', '學習課程', '會員', '從業', '學習進度', '其他'];

// ── Storage helpers ───────────────────────────────────────────────────────────

function loadAll() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
}
function saveAll(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /**/ }
}

// ── Current state ─────────────────────────────────────────────────────────────

let _contactId   = null;
let _contactName = '';
let _thread      = '邀約推演';

export function getCurrentThread() { return _thread; }
export function getCurrentContactId() { return _contactId; }

// ── Public API ────────────────────────────────────────────────────────────────

/** Save messages to current contact + thread */
export function saveSession(contactId, contactName, messages) {
  if (!contactId) return;
  const all = loadAll();
  if (!all[contactId]) all[contactId] = { contactName, threads: {}, activeThread: _thread };
  all[contactId].contactName = contactName;
  all[contactId].activeThread = _thread;

  const t = _thread || '邀約推演';
  all[contactId].threads[t] = { messages: messages.slice(-MAX_MSG), updatedAt: Date.now() };

  // Prune threads if over limit
  const tkeys = Object.keys(all[contactId].threads);
  if (tkeys.length > MAX_THREADS) {
    tkeys.sort((a, b) => (all[contactId].threads[a].updatedAt || 0) - (all[contactId].threads[b].updatedAt || 0));
    tkeys.slice(0, tkeys.length - MAX_THREADS).forEach(k => delete all[contactId].threads[k]);
  }
  saveAll(all);
}

/** Load messages for a contact + thread. Returns []. */
export function loadSession(contactId, thread) {
  if (!contactId) return [];
  const all = loadAll();
  const s = all[contactId];
  if (!s) return [];
  const t = thread || s.activeThread || '邀約推演';
  return s.threads[t]?.messages || [];
}

/** Switch to a contact. Returns saved thread name. */
export function switchContact(contactId, contactName) {
  _contactId   = contactId;
  _contactName = contactName;
  const all = loadAll();
  _thread = all[contactId]?.activeThread || '邀約推演';
  return _thread;
}

/** Switch thread within the same contact. Returns messages. */
export function switchThread(threadName) {
  _thread = threadName;
  // Update activeThread in storage
  const all = loadAll();
  if (_contactId && all[_contactId]) {
    all[_contactId].activeThread = threadName;
    saveAll(all);
  }
  return loadSession(_contactId, threadName);
}

/** Get all thread names for current contact, sorted by recency. */
export function getThreadList(contactId) {
  const all = loadAll();
  const s = all[contactId || _contactId];
  if (!s?.threads) return [];
  return Object.entries(s.threads)
    .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
    .map(([name, t]) => ({ name, msgCount: t.messages?.length || 0, updatedAt: t.updatedAt }));
}

/** List contacts that have any sessions, sorted by recency. */
export function listContacts() {
  const all = loadAll();
  return Object.entries(all)
    .map(([id, s]) => {
      const lastTs = Math.max(0, ...Object.values(s.threads || {}).map(t => t.updatedAt || 0));
      return { id, contactName: s.contactName, lastTs, threadCount: Object.keys(s.threads || {}).length };
    })
    .sort((a, b) => b.lastTs - a.lastTs);
}

// ── Session Bar UI ────────────────────────────────────────────────────────────

let _onThreadSwitch   = null; // (threadName, messages) => void
let _onContactSwitch  = null; // (contactId) => void

export function initSessionPicker({ onThreadSwitch, onContactSwitch }) {
  _onThreadSwitch  = onThreadSwitch;
  _onContactSwitch = onContactSwitch;
  renderSessionBar(null, null);
}

export function renderSessionBar(contactId, contactName) {
  const bar = document.getElementById('chat-session-bar');
  if (!bar) return;

  if (!contactId) {
    bar.innerHTML = '<div class="session-current session-none">💬 選擇聯絡人開始對話</div>';
    return;
  }

  const threads = getThreadList(contactId);
  const otherContacts = listContacts().filter(c => c.id !== contactId);

  bar.innerHTML = `
    <div class="session-label" onclick="window.__sessionToggle?.()">
      <span class="session-contact">${contactName}</span>
      <span class="session-sep">›</span>
      <span class="session-thread">${_thread}</span>
      <span class="session-arrow">▾</span>
    </div>
    <div class="session-dropdown" id="session-dropdown" style="display:none">
      <div class="session-section-title">場景（${contactName}）</div>
      ${PRESET_THREADS.map(t => {
        const info = threads.find(th => th.name === t);
        const isActive = t === _thread;
        return `<div class="session-item ${isActive ? 'active' : ''}" onclick="window.__sessionThreadSelect?.('${t}')">
          <span class="session-name">${isActive ? '✓ ' : ''}${t}</span>
          <span class="session-meta">${info ? `${info.msgCount}則 · ${fmtTime(info.updatedAt)}` : '未開始'}</span>
        </div>`;
      }).join('')}
      <div class="session-item session-new" onclick="window.__sessionNewThread?.()">
        <span class="session-name">＋ 自定義場景</span>
      </div>
      ${otherContacts.length ? `
        <div class="session-section-title" style="margin-top:8px">其他聯絡人</div>
        ${otherContacts.slice(0, 5).map(c => `
          <div class="session-item" onclick="window.__sessionContactSelect?.('${c.id}')">
            <span class="session-name">${c.contactName}</span>
            <span class="session-meta">${c.threadCount} 場景</span>
          </div>`).join('')}` : ''}
    </div>`;

  // Wire up handlers
  window.__sessionToggle = () => {
    const dd = document.getElementById('session-dropdown');
    if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
  };

  window.__sessionThreadSelect = (name) => {
    closeDropdown();
    if (name === _thread) return;
    const msgs = switchThread(name);
    _onThreadSwitch?.(name, msgs);
    renderSessionBar(_contactId, _contactName);
  };

  window.__sessionNewThread = () => {
    closeDropdown();
    const name = prompt('場景名稱：', '');
    if (!name?.trim()) return;
    const msgs = switchThread(name.trim());
    _onThreadSwitch?.(name.trim(), msgs);
    renderSessionBar(_contactId, _contactName);
  };

  window.__sessionContactSelect = (id) => {
    closeDropdown();
    _onContactSwitch?.(id);
  };

  document.addEventListener('click', (e) => {
    if (!bar.contains(e.target)) closeDropdown();
  }, { capture: false });
}

function closeDropdown() {
  const dd = document.getElementById('session-dropdown');
  if (dd) dd.style.display = 'none';
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const diffH = (now - d) / 3600000;
  if (diffH < 24)  return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  if (diffH < 168) return d.toLocaleDateString('zh-TW', { weekday: 'short' });
  return d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
}
