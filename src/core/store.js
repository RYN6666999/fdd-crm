/**
 * core/store.js
 * localStorage 存取層 — 單一真理源
 * 依賴：contracts/types.js (STORE_KEYS), contracts/types.js (RANK_RATES)
 * FORBIDDEN: no DOM, no calculations, no business logic
 */

import { STORE_KEYS, RANK_RATES } from '../contracts/types.js';

// Re-export for convenience
export const K = STORE_KEYS;

// ── Generic helpers ──────────────────────────────────────────────────────────

/** 從 localStorage 讀取 JSON，失敗回傳 fallback */
export function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
}

/** 將值序列化寫入 localStorage */
export function saveJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

// ── Typed save helpers（供 state.js / features 呼叫）────────────────────────

// ── Snapshot ring buffer（防資料遺失，保留最近 5 份）───────────────────────
const SNAP_SIZE = 5;
const _SNAP_KEY_MAP = () => ({
  nodes:               K.nodes,
  events:              K.events,
  sales:               K.sales,
  dailyReports:        K.dailyReports,
  monthlyGoals:        K.monthlyGoals,
  monthlySalesTargets: K.monthlySalesTargets,
  docs:                K.docs,
  students:            K.students,
});

/** 將目前 localStorage 全量快照寫入環形緩衝 */
export function autoSnapshot() {
  try {
    const ptr = (parseInt(localStorage.getItem('crm-snap-ptr') || '0')) % SNAP_SIZE;
    const snap = { ts: Date.now(), data: {} };
    for (const [name, lsKey] of Object.entries(_SNAP_KEY_MAP())) {
      const raw = localStorage.getItem(lsKey);
      if (raw && raw !== 'null' && raw !== '[]' && raw !== '{}') snap.data[name] = raw;
    }
    if (!snap.data.nodes) return; // 沒有節點資料不值得快照
    localStorage.setItem('crm-snap-' + ptr, JSON.stringify(snap));
    localStorage.setItem('crm-snap-ptr', String((ptr + 1) % SNAP_SIZE));
  } catch (e) {
    console.warn('[Snapshot]', e);
  }
}

/** 列出所有快照（由新到舊） */
export function listSnapshots() {
  const snaps = [];
  for (let i = 0; i < SNAP_SIZE; i++) {
    const raw = localStorage.getItem('crm-snap-' + i);
    if (!raw) continue;
    try {
      const s = JSON.parse(raw);
      let nodeCount = 0;
      try { nodeCount = JSON.parse(s.data?.nodes || '[]')?.length ?? 0; } catch {}
      snaps.push({ idx: i, ts: s.ts, label: new Date(s.ts).toLocaleString('zh-TW'), nodeCount });
    } catch {}
  }
  return snaps.sort((a, b) => b.ts - a.ts);
}

/** 還原指定快照到 localStorage（還原後需 reload） */
export function restoreSnapshot(idx) {
  const raw = localStorage.getItem('crm-snap-' + idx);
  if (!raw) return false;
  const snap = JSON.parse(raw);
  for (const [name, lsKey] of Object.entries(_SNAP_KEY_MAP())) {
    if (snap.data?.[name]) localStorage.setItem(lsKey, snap.data[name]);
  }
  return true;
}

export const STORE = {
  K,

  // ── Readers ──
  getMyRank() { return localStorage.getItem(K.profileRank) || 'director'; },
  getMyRate() { return RANK_RATES[STORE.getMyRank()] || 0.15; },

  // ── Writers（接收當下值，不自行存取全域狀態）──
  saveNodes(nodes)                 { saveJSON(K.nodes,               nodes); },
  saveEvents(events)               { saveJSON(K.events,              events); },
  saveTasks(tasks)                 { saveJSON(K.tasks,               tasks); },
  saveChat(chatHistory)            { saveJSON(K.chat,                chatHistory); },
  saveSales(salesData)             { saveJSON(K.sales,               salesData); },
  saveDailyReports(dailyReports)   { saveJSON(K.dailyReports,        dailyReports); },
  saveMonthlyGoals(monthlyGoals)   { saveJSON(K.monthlyGoals,        monthlyGoals); },
  saveMonthlySalesTargets(targets) { saveJSON(K.monthlySalesTargets, targets); },
  saveShortcuts(sk)                { saveJSON(K.shortcuts,           sk); },
  saveDocs(docsData)               { saveJSON(K.docs,                docsData); },
  saveStudents(studentsData)       { saveJSON(K.students,            studentsData); },
  saveMemories(memories)           { saveJSON(K.aiMemories,          memories); },

  saveCmd(mode, white, black) {
    localStorage.setItem(K.cmdMode,  mode);
    saveJSON(K.cmdWhite, [...white]);
    saveJSON(K.cmdBlack, [...black]);
  },

  // ── Loaders（回傳解析後資料，失敗回傳安全預設）──
  loadNodes()                { return loadJSON(K.nodes,               null); },
  loadEvents()               { return loadJSON(K.events,              []); },
  loadTasks()                { return loadJSON(K.tasks,               []); },
  loadChat()                 { return loadJSON(K.chat,                []); },
  loadSales()                { return loadJSON(K.sales,               []); },
  loadDailyReports()         { return loadJSON(K.dailyReports,        {}); },
  loadMonthlyGoals()         { return loadJSON(K.monthlyGoals,        {}); },
  loadMonthlySalesTargets()  { return loadJSON(K.monthlySalesTargets, {}); },
  loadShortcuts()            { return loadJSON(K.shortcuts,           null); },
  loadDocs()                 { return loadJSON(K.docs,                []); },
  loadStudents()             { return loadJSON(K.students,            []); },
  loadDrafts()               { return loadJSON(K.drafts,              {}); },
  loadMemories()             { return loadJSON(K.aiMemories,          []); },

  loadCmdMode()  { return localStorage.getItem(K.cmdMode)  || 'blacklist'; },
  loadCmdWhite() { return new Set(loadJSON(K.cmdWhite, [])); },
  loadCmdBlack() { return new Set(loadJSON(K.cmdBlack, [])); },
};
