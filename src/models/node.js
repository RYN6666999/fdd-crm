/**
 * models/node.js
 * Node 資料工廠
 * 依賴：core/uid.js, contracts/node.js, contracts/types.js
 * FORBIDDEN: no DOM, no localStorage
 */

import { uid } from '../core/uid.js';
import { nodeDefaults } from '../contracts/node.js';
import { STATUS_LABELS, STATUS_ORDER, NOTE_COLORS, STATUS_VALUES } from '../contracts/types.js';

// Re-export constants so features only need to import from models/node.js
export { STATUS_LABELS, STATUS_ORDER, NOTE_COLORS, STATUS_VALUES };

/**
 * 建立新 Node，帶完整安全預設值
 * @param {string} [name]
 * @returns {import('../contracts/node.js').Node}
 */
export function newNode(name = '新聯繫人') {
  const now = Date.now();
  return {
    id: uid(),
    name,
    x: 0,
    y: 0,
    createdAt: now,
    updatedAt: now,
    ...nodeDefaults(),
  };
}

/**
 * 建立便條節點
 * @param {number} x
 * @param {number} y
 * @param {string} [parentId]
 * @returns {Node}
 */
export function newNoteNode(x = 0, y = 0, parentId = null) {
  const now = Date.now();
  return {
    id: uid(),
    name: '便條',
    nodeType: 'note',
    status: null,
    parentId,
    x,
    y,
    collapsed: false,
    createdAt: now,
    updatedAt: now,
    lastContactAt: null,
    noteColor: 'yellow',
    noteFontSize: 14,
    noteContent: '',
    info: { ...nodeDefaults().info },
  };
}

/**
 * 取得下一個狀態（循環）
 * @param {string|null} currentStatus
 * @returns {string}
 */
export function nextStatus(currentStatus) {
  const idx = STATUS_ORDER.indexOf(currentStatus);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
}
