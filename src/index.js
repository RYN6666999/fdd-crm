/**
 * src/index.js
 * Phase 1 公開 API — 供 crm.js 逐步遷移時 import 使用
 *
 * 使用方式（crm.js 頂部加入）：
 *   import { uid, toast, STORE, dispatch, getNodes, ... } from './src/index.js';
 *
 * 待 Phase 3 完成後此檔改為 main.js 的入口。
 */

// ── Contracts ─────────────────────────────────────────────────────────────────
export * from './contracts/types.js';
export { validateNode, nodeDefaults }       from './contracts/node.js';
export { validateStudent, validateContactEntry, studentDefaults, contactDefaults } from './contracts/student.js';

// ── Core ──────────────────────────────────────────────────────────────────────
export { uid }                              from './core/uid.js';
export { toast }                            from './core/toast.js';
export { STORE, K, loadJSON, saveJSON }     from './core/store.js';
export {
  dispatch,
  getNodes, getEvents, getTasks, getChatHistory,
  getStudentsData, getSalesData, getDailyReports,
  getMonthlyGoals, getMonthlySalesTargets, getDocsData,
  findNode, getChildren, getRoots, isHidden, gatherSubtree,
} from './core/state.js';
export { pushUndo, undoLast, clearUndo, undoSize } from './core/undo.js';
export { CALC }                             from './core/calc.js';

// ── Models ────────────────────────────────────────────────────────────────────
export {
  newNode, newNoteNode, nextStatus,
  STATUS_LABELS, STATUS_ORDER, NOTE_COLORS,
} from './models/node.js';
export {
  newStudent, newContact,
  escHtml, slugResult, getNextFollowUp, getLastContact,
  STUDENT_FIXED_TAGS, CONTACT_METHODS, CONTACT_RESULTS,
} from './models/student.js';
