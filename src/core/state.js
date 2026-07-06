/**
 * core/state.js
 * 全域狀態中心 + Reducer
 *
 * 規則：
 * - 所有狀態讀取走 get*() accessor
 * - 所有狀態寫入走 dispatch(action)
 * - STORE 持久化由 dispatch 負責（寫入 action 時同步 localStorage）
 * - features 不得直接操作 _state
 *
 * FORBIDDEN: no DOM
 */

import { STORE, autoSnapshot } from './store.js';
import { cloudPush } from './cloud-sync.js';
import { migrateNodes, migrateStudents } from './migrate.js';
import { validateNode } from '../contracts/node.js';
import { validateStudent } from '../contracts/student.js';

// 每 10 次寫入觸發一次本地快照 + 遠端備份
let _writeCount = 0;
function _maybeSnapshot() {
  _writeCount++;
  if (_writeCount % 10 === 0) {
    autoSnapshot();
    _maybeBackup(true); // 滿 10 次強制備份
  }
}

// ── Auto backup to Cloudflare KV ────────────────────────────────────────────
// 每 5 次寫入觸發一次遠端備份（fire-and-forget）
let _backupCount = 0;
function _maybeBackup(force) {
  if (!force) {
    _backupCount++;
    if (_backupCount % 5 !== 0) return;
  }
  try {
    const payload = {
      _schema: 1,
      nodes:               _state.nodes,
      events:              _state.events,
      tasks:               _state.tasks,
      chatHistory:         _state.chatHistory,
      studentsData:        _state.studentsData,
      salesData:           _state.salesData,
      dailyReports:        _state.dailyReports,
      monthlyGoals:        _state.monthlyGoals,
      monthlySalesTargets: _state.monthlySalesTargets,
      docsData:            _state.docsData,
    };
    const deviceId = localStorage.getItem('crm-device-id') || '';
    fetch('/api/backup', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId },
      body: JSON.stringify(payload),
    }).catch(() => {}); // fire-and-forget
  } catch (e) {
    console.warn('[AutoBackup]', e);
  }
}

// ── Internal state ────────────────────────────────────────────────────────────

const _state = {
  nodes:               [],
  events:              [],
  tasks:               [],
  chatHistory:         [],
  studentsData:        [],
  salesData:           [],
  dailyReports:        {},
  monthlyGoals:        {},
  monthlySalesTargets: {},
  docsData:            [],
};

// ── Accessors ─────────────────────────────────────────────────────────────────

export const getNodes               = () => _state.nodes;
export const getEvents              = () => _state.events;
export const getTasks               = () => _state.tasks;
export const getChatHistory         = () => _state.chatHistory;
export const getStudentsData        = () => _state.studentsData;
export const getSalesData           = () => _state.salesData;
export const getDailyReports        = () => _state.dailyReports;
export const getMonthlyGoals        = () => _state.monthlyGoals;
export const getMonthlySalesTargets = () => _state.monthlySalesTargets;
export const getDocsData            = () => _state.docsData;

// Node helpers（純查詢，不修改狀態）
export const findNode    = (id) => _state.nodes.find(n => n.id === id) || null;
export const getChildren = (id) => _state.nodes.filter(n => n.parentId === id);
export const getRoots    = ()   => _state.nodes.filter(n => !n.parentId);

export function isHidden(id) {
  const n = findNode(id);
  if (!n || !n.parentId) return false;
  const p = findNode(n.parentId);
  if (!p) return false;
  return p.collapsed || isHidden(p.id);
}

export function gatherSubtree(id) {
  const ids = [id];
  getChildren(id).forEach(c => gatherSubtree(c.id).forEach(x => ids.push(x)));
  return ids;
}

// ── Reducer ───────────────────────────────────────────────────────────────────

/**
 * Action types:
 *   NODES_LOAD          payload: Node[]
 *   NODE_ADD            payload: Node
 *   NODE_UPDATE         payload: { id, patch: Partial<Node> }
 *   NODE_DELETE         payload: string (id)
 *   NODES_SET           payload: Node[]          (bulk replace, e.g. undo)
 *
 *   EVENTS_SET          payload: Event[]
 *   EVENT_ADD           payload: Event
 *   EVENT_UPDATE        payload: { id, patch }
 *   EVENT_DELETE        payload: string
 *
 *   TASKS_SET           payload: Task[]
 *   TASK_ADD            payload: Task
 *   TASK_UPDATE         payload: { id, patch }
 *   TASK_DELETE         payload: string
 *
 *   CHAT_SET            payload: Message[]
 *   CHAT_PUSH           payload: Message
 *   CHAT_CLEAR          (no payload)
 *
 *   STUDENTS_SET        payload: Student[]
 *   STUDENT_ADD         payload: Student
 *   STUDENT_UPDATE      payload: { id, patch }
 *   STUDENT_DELETE      payload: string
 *
 *   SALES_SET           payload: Sale[]
 *   SALE_ADD            payload: Sale
 *   SALE_UPDATE         payload: { id, patch }
 *   SALE_DELETE         payload: string
 *
 *   DAILY_REPORTS_SET   payload: object
 *   DAILY_REPORT_PATCH  payload: { date, patch }
 *
 *   MONTHLY_GOALS_SET   payload: object
 *   MONTHLY_SALES_TARGETS_SET payload: object
 *
 *   DOCS_SET            payload: Doc[]
 *   DOC_ADD             payload: Doc
 *   DOC_UPDATE          payload: { id, patch }
 *   DOC_DELETE          payload: string
 */
export function dispatch(action) {
  switch (action.type) {
    // ── Nodes ──
    case 'NODES_LOAD':
      // 讀取時：寬容模式 — 補齊舊欄位，不丟失資料
      _state.nodes = migrateNodes(action.payload);
      STORE.saveNodes(_state.nodes);
      _maybeSnapshot();
      break;
    case 'NODES_SET':
      _state.nodes = action.payload;
      STORE.saveNodes(_state.nodes);
      cloudPush('nodes', _state.nodes);
      _maybeSnapshot();
      break;
    case 'NODE_ADD': {
      // 寫入時：嚴格驗證，拒絕壞資料
      const addResult = validateNode(action.payload);
      if (!addResult.ok) {
        console.error('[state] NODE_ADD 驗證失敗，拒絕寫入:', addResult.errors, action.payload);
        break;
      }
      _state.nodes.push(action.payload);
      STORE.saveNodes(_state.nodes);
      cloudPush('nodes', _state.nodes);
      _maybeSnapshot();
      break;
    }
    case 'NODE_UPDATE': {
      const idx = _state.nodes.findIndex(n => n.id === action.payload.id);
      if (idx !== -1) {
        const updated = { ..._state.nodes[idx], ...action.payload.patch, updatedAt: Date.now() };
        // 寫入時：嚴格驗證
        const updateResult = validateNode(updated);
        if (!updateResult.ok) {
          console.error('[state] NODE_UPDATE 驗證失敗，拒絕寫入:', updateResult.errors, updated);
          break;
        }
        _state.nodes[idx] = updated;
        STORE.saveNodes(_state.nodes);
        cloudPush('nodes', _state.nodes);
        _maybeSnapshot();
      }
      break;
    }
    case 'NODE_DELETE':
      _state.nodes = _state.nodes.filter(n => n.id !== action.payload);
      STORE.saveNodes(_state.nodes);
      cloudPush('nodes', _state.nodes);
      _maybeSnapshot();
      break;

    // ── Events ──
    case 'EVENTS_SET':   _state.events = action.payload; STORE.saveEvents(_state.events); _maybeBackup(); break;
    case 'EVENT_ADD':    _state.events.push(action.payload); STORE.saveEvents(_state.events); cloudPush('events', _state.events); _maybeBackup(); break;
    case 'EVENT_UPDATE': _updateById(_state.events, action.payload); STORE.saveEvents(_state.events); cloudPush('events', _state.events); _maybeBackup(); break;
    case 'EVENT_DELETE': _state.events = _state.events.filter(e => e.id !== action.payload); STORE.saveEvents(_state.events); cloudPush('events', _state.events); _maybeBackup(); break;

    // ── Tasks ──
    case 'TASKS_SET':   _state.tasks = action.payload; STORE.saveTasks(_state.tasks); _maybeBackup(); break;
    case 'TASK_ADD':    _state.tasks.push(action.payload); STORE.saveTasks(_state.tasks); _maybeBackup(); break;
    case 'TASK_UPDATE': _updateById(_state.tasks, action.payload); STORE.saveTasks(_state.tasks); _maybeBackup(); break;
    case 'TASK_DELETE': _state.tasks = _state.tasks.filter(t => t.id !== action.payload); STORE.saveTasks(_state.tasks); _maybeBackup(); break;

    // ── Chat ──
    case 'CHAT_SET':   _state.chatHistory = action.payload; STORE.saveChat(_state.chatHistory); _maybeBackup(); break;
    case 'CHAT_PUSH':  _state.chatHistory.push(action.payload); STORE.saveChat(_state.chatHistory); _maybeBackup(); break;
    case 'CHAT_CLEAR': _state.chatHistory = []; STORE.saveChat([]); _maybeBackup(); break;

    // ── Students ──
    case 'STUDENTS_SET':
      _state.studentsData = migrateStudents(action.payload);
      STORE.saveStudents(_state.studentsData);
      _maybeBackup();
      break;
    case 'STUDENT_ADD': {
      const sAddResult = validateStudent(action.payload);
      if (!sAddResult.ok) {
        console.error('[state] STUDENT_ADD 驗證失敗，拒絕寫入:', sAddResult.errors, action.payload);
        break;
      }
      _state.studentsData.push(action.payload);
      STORE.saveStudents(_state.studentsData);
      _maybeBackup();
      break;
    }
    case 'STUDENT_UPDATE': {
      const sIdx = _state.studentsData.findIndex(s => s.id === action.payload.id);
      if (sIdx !== -1) {
        const sUpdated = { ..._state.studentsData[sIdx], ...action.payload.patch };
        const sUpdateResult = validateStudent(sUpdated);
        if (!sUpdateResult.ok) {
          console.error('[state] STUDENT_UPDATE 驗證失敗，拒絕寫入:', sUpdateResult.errors, sUpdated);
          break;
        }
        _state.studentsData[sIdx] = sUpdated;
        STORE.saveStudents(_state.studentsData);
        _maybeBackup();
      }
      break;
    }
    case 'STUDENT_DELETE': _state.studentsData = _state.studentsData.filter(s => s.id !== action.payload); STORE.saveStudents(_state.studentsData); _maybeBackup(); break;

    // ── Sales ──
    case 'SALES_SET':   _state.salesData = action.payload; STORE.saveSales(_state.salesData); _maybeBackup(); break;
    case 'SALE_ADD':    _state.salesData.push(action.payload); STORE.saveSales(_state.salesData); cloudPush('sales', _state.salesData); _maybeBackup(); break;
    case 'SALE_UPDATE': _updateById(_state.salesData, action.payload); STORE.saveSales(_state.salesData); cloudPush('sales', _state.salesData); _maybeBackup(); break;
    case 'SALE_DELETE': _state.salesData = _state.salesData.filter(s => s.id !== action.payload); STORE.saveSales(_state.salesData); cloudPush('sales', _state.salesData); _maybeBackup(); break;

    // ── Daily ──
    case 'DAILY_REPORTS_SET':
      _state.dailyReports = action.payload;
      STORE.saveDailyReports(_state.dailyReports);
      _maybeBackup();
      break;
    case 'DAILY_REPORT_PATCH':
      _state.dailyReports[action.payload.date] = {
        ...(_state.dailyReports[action.payload.date] || {}),
        ...action.payload.patch,
      };
      STORE.saveDailyReports(_state.dailyReports);
      cloudPush('dailyReports', _state.dailyReports);
      _maybeBackup();
      break;

    // ── Monthly goals / targets ──
    case 'MONTHLY_GOALS_SET':
      _state.monthlyGoals = action.payload;
      STORE.saveMonthlyGoals(_state.monthlyGoals);
      break;
    case 'MONTHLY_GOALS_PATCH':
      _state.monthlyGoals = { ..._state.monthlyGoals, ...action.payload };
      STORE.saveMonthlyGoals(_state.monthlyGoals);
      break;
    case 'MONTHLY_SALES_TARGETS_SET':
      _state.monthlySalesTargets = action.payload;
      STORE.saveMonthlySalesTargets(_state.monthlySalesTargets);
      break;
    case 'MONTHLY_SALES_TARGETS_PATCH':
      _state.monthlySalesTargets = { ..._state.monthlySalesTargets, ...action.payload };
      STORE.saveMonthlySalesTargets(_state.monthlySalesTargets);
      break;

    // ── Docs ──
    case 'DOCS_SET':   _state.docsData = action.payload; STORE.saveDocs(_state.docsData); _maybeBackup(); break;
    case 'DOC_ADD':    _state.docsData.push(action.payload); STORE.saveDocs(_state.docsData); _maybeBackup(); break;
    case 'DOC_UPDATE': _updateById(_state.docsData, action.payload); STORE.saveDocs(_state.docsData); _maybeBackup(); break;
    case 'DOC_DELETE': _state.docsData = _state.docsData.filter(d => d.id !== action.payload); STORE.saveDocs(_state.docsData); _maybeBackup(); break;

    default:
      console.warn('[state] Unknown action:', action.type);
  }
}

// ── Internal helper ───────────────────────────────────────────────────────────

function _updateById(arr, { id, patch }) {
  const idx = arr.findIndex(item => item.id === id);
  if (idx !== -1) arr[idx] = { ...arr[idx], ...patch };
}
