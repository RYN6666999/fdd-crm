/**
 * core/migrate.js
 * 舊資料清洗：將 localStorage 中的舊格式資料補齊至當前 schema 預設值
 *
 * 規則：
 * - 只「補齊」缺失欄位，不覆蓋既有值，不丟失任何資料
 * - 清洗過程的異常只 warn，不拋錯（容錯優先）
 * - 清洗是冪等的：對已符合 schema 的資料再跑一次結果不變
 *
 * FORBIDDEN: no DOM, no localStorage, no side effects
 */

import { nodeDefaults } from '../contracts/node.js';
import { studentDefaults, contactDefaults } from '../contracts/student.js';

// ── Node ──────────────────────────────────────────────────────────────────────

/**
 * 補齊單一 Node，確保所有 required 欄位存在
 * @param {object} raw
 * @returns {object}
 */
export function migrateNode(raw) {
  const defaults = nodeDefaults();
  const now = Date.now();

  const node = {
    ...defaults,
    ...raw,
    // required 欄位：型別錯誤時強制修復，不靜默接受
    id:        (raw.id        && typeof raw.id === 'string')     ? raw.id        : `legacy_${now}_${Math.random().toString(36).slice(2)}`,
    nodeType:  (raw.nodeType  === 'contact' || raw.nodeType === 'note') ? raw.nodeType : 'contact',
    name:      (typeof raw.name === 'string' && raw.name.trim()) ? raw.name      : '（無名稱）',
    x:         (typeof raw.x  === 'number'  && !isNaN(raw.x))   ? raw.x         : 0,
    y:         (typeof raw.y  === 'number'  && !isNaN(raw.y))   ? raw.y         : 0,
    createdAt: (typeof raw.createdAt === 'number')               ? raw.createdAt : now,
    updatedAt: (typeof raw.updatedAt === 'number')               ? raw.updatedAt : now,
    // info 物件：深度合併，保留舊欄位
    info: (raw.info && typeof raw.info === 'object' && !Array.isArray(raw.info))
      ? { ...defaults.info, ...raw.info }
      : { ...defaults.info },
  };

  return node;
}

/**
 * 批次清洗 Node 陣列（給 NODES_LOAD 使用）
 * @param {unknown} arr
 * @returns {object[]}
 */
export function migrateNodes(arr) {
  if (!Array.isArray(arr)) {
    console.warn('[migrate] nodes: 預期 array，收到', typeof arr);
    return [];
  }
  let fixed = 0;
  const result = arr.map((raw, i) => {
    if (!raw || typeof raw !== 'object') {
      console.warn(`[migrate] nodes[${i}] 非物件，跳過`);
      return null;
    }
    try {
      const migrated = migrateNode(raw);
      // 補齊了欄位才計入
      if (!raw.updatedAt || !raw.info) fixed++;
      return migrated;
    } catch (e) {
      console.warn(`[migrate] nodes[${i}] 清洗失敗，跳過:`, e);
      return null;
    }
  }).filter(Boolean);

  if (fixed > 0) {
    console.info(`[migrate] nodes: ${result.length} 筆載入，${fixed} 筆補齊欄位`);
  }
  return result;
}

// ── Student ───────────────────────────────────────────────────────────────────

/**
 * 補齊單一 ContactEntry
 * @param {object} raw
 * @returns {object}
 */
function migrateContactEntry(raw) {
  const now = Date.now();
  return {
    ...contactDefaults(),
    ...raw,
    id:        (raw.id && typeof raw.id === 'string')         ? raw.id  : `ce_${now}_${Math.random().toString(36).slice(2)}`,
    date:      (typeof raw.date === 'string' && raw.date)     ? raw.date : new Date().toISOString().slice(0, 10),
    method:    ['電話', 'Line', '面談', '視訊'].includes(raw.method)                ? raw.method : '電話',
    result:    ['未接聽', '接通無進展', '有興趣', '約定下次', '里程碑推進', '其他'].includes(raw.result) ? raw.result : '其他',
    createdAt: (typeof raw.createdAt === 'number') ? raw.createdAt : now,
  };
}

/**
 * 補齊單一 Student，確保所有 required 欄位存在
 * @param {object} raw
 * @returns {object}
 */
export function migrateStudent(raw) {
  const defaults = studentDefaults();
  const now = Date.now();

  return {
    ...defaults,
    ...raw,
    id:       (raw.id && typeof raw.id === 'string')         ? raw.id   : `legacy_s_${now}_${Math.random().toString(36).slice(2)}`,
    name:     (typeof raw.name === 'string' && raw.name.trim()) ? raw.name : '（無名稱）',
    joinDate: (typeof raw.joinDate === 'string' && raw.joinDate) ? raw.joinDate : new Date().toISOString().slice(0, 10),
    tags:       Array.isArray(raw.tags)       ? raw.tags       : [],
    customTags: Array.isArray(raw.customTags) ? raw.customTags : [],
    suite: (raw.suite && typeof raw.suite === 'object' && !Array.isArray(raw.suite))
      ? { ...defaults.suite, ...raw.suite }
      : { ...defaults.suite },
    milestones: (raw.milestones && typeof raw.milestones === 'object' && !Array.isArray(raw.milestones))
      ? { ...defaults.milestones, ...raw.milestones }
      : { ...defaults.milestones },
    contacts: Array.isArray(raw.contacts)
      ? raw.contacts.map(migrateContactEntry)
      : [],
    createdAt: (typeof raw.createdAt === 'number') ? raw.createdAt : now,
  };
}

/**
 * 批次清洗 Student 陣列（給 STUDENTS_SET 載入時使用）
 * @param {unknown} arr
 * @returns {object[]}
 */
export function migrateStudents(arr) {
  if (!Array.isArray(arr)) {
    console.warn('[migrate] students: 預期 array，收到', typeof arr);
    return [];
  }
  let fixed = 0;
  const result = arr.map((raw, i) => {
    if (!raw || typeof raw !== 'object') {
      console.warn(`[migrate] students[${i}] 非物件，跳過`);
      return null;
    }
    try {
      const migrated = migrateStudent(raw);
      if (!raw.suite || !raw.milestones || !Array.isArray(raw.tags)) fixed++;
      return migrated;
    } catch (e) {
      console.warn(`[migrate] students[${i}] 清洗失敗，跳過:`, e);
      return null;
    }
  }).filter(Boolean);

  if (fixed > 0) {
    console.info(`[migrate] students: ${result.length} 筆載入，${fixed} 筆補齊欄位`);
  }
  return result;
}
