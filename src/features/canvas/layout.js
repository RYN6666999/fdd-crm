/**
 * canvas/layout.js
 * Tree layout — 計算節點位置
 * 依賴：core/state.js, core/toast.js, canvas/canvasState.js
 * FORBIDDEN: no direct localStorage, no direct DOM (除 forceLayout 呼叫 renderFn)
 */

import { findNode, getChildren, getRoots, getNodes, dispatch } from '../../core/state.js';
import { toast } from '../../core/toast.js';
import { NODE_W, NODE_H_EST, GAP_H, GAP_V } from './canvasState.js';

export { NODE_W, NODE_H_EST, GAP_H, GAP_V };

// ── Subtree width calculation ─────────────────────────────────────────────────

/** @param {string} id */
export function subtreeW(id) {
  const n = findNode(id);
  if (!n) return NODE_W + GAP_H;
  const kids = getChildren(id).filter(() => !n.collapsed);
  if (!kids.length) return NODE_W + GAP_H;
  return kids.reduce((s, c) => s + subtreeW(c.id), 0);
}

// ── Tree layout ───────────────────────────────────────────────────────────────

/**
 * 遞迴從 id 開始排列，已有位置的節點不覆蓋
 * @param {string} id
 * @param {number} cx  center-x
 * @param {number} y
 */
export function layoutFrom(id, cx, y) {
  const n = findNode(id);
  if (!n) return;

  const noPos = n.x === undefined || n.x === null || (n.x === 0 && n.y === 0 && id !== 'root');
  if (noPos || (id === 'root' && n.x === 0 && n.y === 0)) {
    n.x = cx - NODE_W / 2;
    n.y = y;
  }

  const kids = getChildren(id);
  if (!kids.length) return;
  const totalW = kids.reduce((s, c) => s + subtreeW(c.id), 0);
  let lx = cx - totalW / 2;
  kids.forEach(c => {
    const cw = subtreeW(c.id);
    layoutFrom(c.id, lx + cw / 2, y + NODE_H_EST + GAP_V);
    lx += cw;
  });
}

/**
 * 自動排版（保留已有座標）
 * 呼叫後需 dispatch NODES_SET 讓 state 同步
 */
export function autoLayout() {
  const roots = getRoots();
  const totalW = roots.reduce((s, r) => s + subtreeW(r.id), 0);
  let lx = -(totalW / 2);
  roots.forEach(r => {
    const rw = subtreeW(r.id);
    layoutFrom(r.id, lx + rw / 2, 0);
    lx += rw;
  });
}

/**
 * 強制重新排版（忽略現有座標）
 * @param {Function} renderFn   — renderNodes()
 * @param {Function} fitViewFn  — fitView()
 */
export function forceLayout(renderFn, fitViewFn) {
  function forceFrom(id, cx, y) {
    const n = findNode(id);
    if (!n) return;
    n.x = cx - NODE_W / 2;
    n.y = y;
    const kids = getChildren(id).filter(() => !n.collapsed);
    if (!kids.length) return;
    const totalW = kids.reduce((s, c) => s + subtreeW(c.id), 0);
    let lx = cx - totalW / 2;
    kids.forEach(c => {
      const cw = subtreeW(c.id);
      forceFrom(c.id, lx + cw / 2, y + NODE_H_EST + GAP_V);
      lx += cw;
    });
  }

  const roots = getRoots();
  const totalW = roots.reduce((s, r) => s + subtreeW(r.id), 0);
  let lx = -(totalW / 2);
  roots.forEach(r => {
    const rw = subtreeW(r.id);
    forceFrom(r.id, lx + rw / 2, 0);
    lx += rw;
  });

  // Persist updated positions
  dispatch({ type: 'NODES_SET', payload: getNodes() });
  renderFn?.();
  fitViewFn?.();
  toast('排列已整理');
}
