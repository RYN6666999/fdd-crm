/**
 * features/ai/memory-local.js
 * 本地記憶服務 — 使用 localStorage 實作完整 CRUD + 檢索
 * 替換 personas.js 中原本打 /api/memories 的 memoryService（後端 API 不存在）
 * 依賴：core/store.js (K), core/cloud-sync.js (cloudPush)
 * FORBIDDEN: no DOM
 */

import { K } from '../../core/store.js';
import { cloudPush } from '../../core/cloud-sync.js';

const MEM_KEY = K.aiMemories || 'crm-ai-memories';

function load() {
  try { return JSON.parse(localStorage.getItem(MEM_KEY) || '[]'); }
  catch { return []; }
}
function save(mems) {
  localStorage.setItem(MEM_KEY, JSON.stringify(mems));
  // 有設 token 才會真的推，fire-and-forget
  cloudPush('memories', mems);
}

export const localMemoryService = {
  async list(opts = {}) {
    let mems = load();
    if (opts.type) mems = mems.filter(m => m.type === opts.type);
    if (opts.subject) {
      const q = opts.subject.toLowerCase();
      mems = mems.filter(m =>
        (m.subject || '').toLowerCase().includes(q) ||
        (m.content || '').toLowerCase().includes(q)
      );
    }
    return mems.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },

  async create(mem) {
    const mems = load();
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      subject: mem.subject || '',
      type: mem.type || 'fact',
      content: mem.content || '',
      createdAt: Date.now(),
    };
    mems.push(entry);
    save(mems);
    return entry;
  },

  async update(id, patch) {
    const mems = load();
    const idx = mems.findIndex(m => m.id === id);
    if (idx === -1) return null;
    mems[idx] = { ...mems[idx], ...patch };
    save(mems);
    return mems[idx];
  },

  async delete(id) {
    const mems = load();
    const filtered = mems.filter(m => m.id !== id);
    if (filtered.length === mems.length) return false;
    save(filtered);
    return true;
  },

  async retrieve(message, context = {}) {
    const mems = load();
    if (!mems.length) return { memories: [], promptSnippet: '' };
    const q = (message || '').toLowerCase();
    const relevant = mems
      .map(m => ({
        ...m,
        score: [m.subject, m.content].filter(Boolean)
          .reduce((s, t) => s + (t.toLowerCase().includes(q) ? 2 : 0), 0)
          + (m.type === 'rule' ? 1 : 0),
      }))
      .filter(m => m.score > 0 || m.type === 'rule')
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const promptSnippet = relevant.length
      ? '【長期記憶】\n' + relevant.map(m => `[${m.type}] ${m.subject}: ${m.content}`).join('\n')
      : '';
    return { memories: relevant, promptSnippet };
  },
};
