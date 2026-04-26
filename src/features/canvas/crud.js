/**
 * canvas/crud.js
 * Node CRUD 操作：建立、刪除、狀態切換、剪貼簿
 * 依賴：core/state.js, core/undo.js, core/toast.js,
 *       models/node.js, canvas/canvasState.js, canvas/select.js, canvas/render.js
 *
 * @public 函式在 main.js 掛至 window.__crm* 供 render.js HTML inline onclick 呼叫
 */

import { findNode, getChildren, getNodes, gatherSubtree, dispatch } from '../../core/state.js';
import { pushUndo } from '../../core/undo.js';
import { toast } from '../../core/toast.js';
import { newNode, newNoteNode, nextStatus, STATUS_LABELS, STATUS_ORDER } from '../../models/node.js';
import { uid } from '../../core/uid.js';
import { NODE_W, NODE_H_EST, GAP_H, GAP_V, cam } from './canvasState.js';
import { getSelId, selectNode, deselect } from './select.js';
import { renderNodes } from './render.js';

// openPanel 由 main.js 注入（避免循環依賴）
let _openPanelFn   = () => {};
let _closePanelFn  = () => {};
let _getPanelNodeId = () => null;
export function setOpenPanelFn(fn)    { _openPanelFn   = fn; }
export function setClosePanelFn(fn)   { _closePanelFn  = fn; }
export function setPanelNodeIdFn(fn)  { _getPanelNodeId = fn; }

// ── Clipboard ──────────────────────────────────────────────────────────────────

let _clipboard = null;

export function copySelected() {
  const selId = getSelId();
  if (!selId) return;
  const n = findNode(selId);
  if (!n) return;
  _clipboard = JSON.parse(JSON.stringify(n));
  toast('已複製：' + n.name);
}

export function cutSelected() {
  if (!getSelId()) return;
  copySelected();
  promptDel(getSelId());
}

export function pasteClipboard() {
  if (!_clipboard) return;
  const n = JSON.parse(JSON.stringify(_clipboard));
  n.id = uid();
  n.parentId = getSelId() || null;
  n.x += 30;
  n.y += 30;
  pushUndo();
  dispatch({ type: 'NODE_ADD', payload: n });
  selectNode(n.id);
  renderNodes();
  toast('已貼上：' + n.name);
}

// ── Node creation ─────────────────────────────────────────────────────────────

export function createNodeAt(cx, cy) {
  const n = newNode();
  n.parentId = null;
  n.x = cx - NODE_W / 2;
  n.y = cy - 30;
  pushUndo();
  dispatch({ type: 'NODE_ADD', payload: n });
  renderNodes();
  selectNode(n.id);
  _openPanelFn(n.id);
  toast('已新增節點 — 點擊姓名編輯');
}

export function createNoteNodeAt(cx, cy) {
  const n = newNoteNode(cx - NODE_W / 2, cy - 30, null);
  pushUndo();
  dispatch({ type: 'NODE_ADD', payload: n });
  renderNodes();
  selectNode(n.id);
  setTimeout(() => {
    const el = document.querySelector(`.node-wrap[data-id="${n.id}"] .note-content`);
    if (el) {
      el.focus();
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }, 50);
  toast('已新增文字便條');
}

export function addChild(parentId) {
  const parent = findNode(parentId);
  if (!parent) return;
  const siblings = getChildren(parentId);
  const n = newNode();
  n.parentId = parentId;
  n.x = parent.x + siblings.length * (NODE_W + GAP_H);
  n.y = parent.y + NODE_H_EST + GAP_V;
  pushUndo();
  dispatch({ type: 'NODE_UPDATE', payload: { id: parentId, patch: { collapsed: false } } });
  dispatch({ type: 'NODE_ADD', payload: n });
  renderNodes();
  selectNode(n.id);
  _openPanelFn(n.id);
}

export function addSibling(id) {
  const n = findNode(id);
  if (!n) return;
  if (n.parentId) {
    addChild(n.parentId);
  } else {
    const c = document.getElementById('canvas-container');
    if (!c) return;
    const cx = (c.offsetWidth / 2 - cam.panX) / cam.zoom;
    const cy = (c.offsetHeight / 2 - cam.panY) / cam.zoom;
    createNodeAt(cx, cy);
  }
}

export function headerAddNode(CMD) {
  if (CMD && !CMD.allowed('node.add')) { toast('此指令已被停用'); return; }
  const selId = getSelId();
  const c = document.getElementById('canvas-container');
  if (!c) return;
  if (selId) {
    addChild(selId);
  } else {
    const cx = (c.offsetWidth / 2 - cam.panX) / cam.zoom;
    const cy = (c.offsetHeight / 2 - cam.panY) / cam.zoom;
    createNodeAt(cx, cy);
  }
}

export function headerAddNote(CMD) {
  if (CMD && !CMD.allowed('note.add')) { toast('此指令已被停用'); return; }
  const c = document.getElementById('canvas-container');
  if (!c) return;
  const cx = (c.offsetWidth / 2 - cam.panX) / cam.zoom;
  const cy = (c.offsetHeight / 2 - cam.panY) / cam.zoom;
  createNoteNodeAt(cx, cy);
}

// ── Node mutations ────────────────────────────────────────────────────────────

export function cycleStatus(id) {
  const n = findNode(id);
  if (!n || n.status === null) return; // root 不切換
  const newStatus = nextStatus(n.status);
  dispatch({ type: 'NODE_UPDATE', payload: { id, patch: { status: newStatus } } });

  // 精準 DOM 更新（不重新整頁，避免拖曳中斷）
  const wrap = document.querySelector(`.node-wrap[data-id="${id}"]`);
  if (wrap) {
    wrap.className = 'node-wrap status-' + newStatus + (getSelId() === id ? ' selected' : '');
    const pill = wrap.querySelector('.status-pill');
    if (pill) pill.innerHTML = `<span class="status-dot"></span>${STATUS_LABELS[newStatus] || ''}`;
  }
  window.__crmUpdateStats?.();
  if (_getPanelNodeId() === id) selectNode(id);
}

export function toggleCollapse(id) {
  const n = findNode(id);
  if (!n) return;
  pushUndo();
  dispatch({ type: 'NODE_UPDATE', payload: { id, patch: { collapsed: !n.collapsed } } });
  renderNodes();
}

export function promptDel(id) {
  const n = findNode(id);
  if (!n) return;
  const kids = gatherSubtree(id);
  const msg = kids.length > 1
    ? `確定刪除「${n.name}」及其 ${kids.length - 1} 個子節點？`
    : `確定刪除「${n.name}」？`;
  if (!confirm(msg)) return;

  pushUndo();
  const selId = getSelId();
  kids.forEach(kid => dispatch({ type: 'NODE_DELETE', payload: kid }));
  if (selId === id || kids.includes(selId)) deselect();
  if (_getPanelNodeId() === id) _closePanelFn();
  renderNodes();
  toast('已刪除');
}

// ── Note content ──────────────────────────────────────────────────────────────

export function setNoteColor(id, colorId) {
  dispatch({ type: 'NODE_UPDATE', payload: { id, patch: { noteColor: colorId } } });
  renderNodes();
}

export function setNoteFontSize(id, size) {
  dispatch({ type: 'NODE_UPDATE', payload: { id, patch: { noteFontSize: Math.max(10, Math.min(20, size)) } } });
  renderNodes();
}

export function saveNoteContent(el) {
  const id = el.dataset.id;
  if (!id) return;
  dispatch({ type: 'NODE_UPDATE', payload: { id, patch: { content: el.innerText.trim() } } });
}
