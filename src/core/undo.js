/**
 * core/undo.js
 * Nodes undo stack（最多 50 步）
 * 依賴：core/state.js, core/toast.js
 * FORBIDDEN: no DOM (except via toast)
 */

import { getNodes, dispatch } from './state.js';
import { toast } from './toast.js';

const UNDO_MAX = 50;
const _stack = [];
let _restoring = false;

/** 在任何 nodes 變更前呼叫（由 canvas/crud.js 負責） */
export function pushUndo() {
  if (_restoring) return;
  _stack.push(JSON.stringify(getNodes()));
  if (_stack.length > UNDO_MAX) _stack.shift();
}

/** 回復上一步 */
export function undoLast(renderFn, deselectFn) {
  if (!_stack.length) { toast('沒有可恢復的動作'); return; }
  _restoring = true;
  const nodes = JSON.parse(_stack.pop());
  dispatch({ type: 'NODES_SET', payload: nodes });
  _restoring = false;
  renderFn?.();
  deselectFn?.();
  toast('↩ 已恢復上一動作');
}

/** 清空 undo stack（例如匯入資料後） */
export function clearUndo() {
  _stack.length = 0;
}

export const undoSize = () => _stack.length;
