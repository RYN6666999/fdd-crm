/**
 * canvas/interact.js
 * Canvas 互動事件：pan, zoom, node drag, connect, panel resize
 * 依賴：core/state.js, core/toast.js, canvas/canvasState.js,
 *       canvas/select.js, canvas/edges.js, canvas/render.js, canvas/crud.js
 */

import { findNode, gatherSubtree, getNodes, dispatch } from '../../core/state.js';
import { toast } from '../../core/toast.js';
import { newNode } from '../../models/node.js';
import { cam, drag, pan, snap, panelResize, connect, flags, NODE_W, DRAG_THRESHOLD, SNAP_RADIUS } from './canvasState.js';
import { getSelId, selectNode, deselect } from './select.js';
import { drawEdges } from './edges.js';
import { renderNodes } from './render.js';
import { promptDel } from './crud.js';
import { pushUndo } from '../../core/undo.js';

// closePanel 由 main.js 注入
let _closePanelFn  = () => {};
let _openPanelFn   = () => {};
export function setClosePanelFn(fn)  { _closePanelFn  = fn; }
export function setOpenPanelFn(fn)   { _openPanelFn   = fn; }

// ── Canvas coordinate helpers ─────────────────────────────────────────────────

export function toCanvasXY(clientX, clientY) {
  const r = document.getElementById('canvas-container').getBoundingClientRect();
  return { x: (clientX - r.left - cam.panX) / cam.zoom, y: (clientY - r.top - cam.panY) / cam.zoom };
}

// ── Zoom / Pan ────────────────────────────────────────────────────────────────

export function applyTransform() {
  const canvas = document.getElementById('canvas');
  if (canvas) canvas.style.transform = `translate(${cam.panX}px,${cam.panY}px) scale(${cam.zoom})`;
}

export function updateZoomLabel() {
  const el = document.getElementById('zoom-label');
  if (el) el.textContent = Math.round(cam.zoom * 100) + '%';
}

export function zoomBy(f) {
  const c = document.getElementById('canvas-container');
  const cx = c.offsetWidth / 2, cy = c.offsetHeight / 2;
  const nz = Math.max(0.15, Math.min(4, cam.zoom * f));
  cam.panX = cx - (cx - cam.panX) * (nz / cam.zoom);
  cam.panY = cy - (cy - cam.panY) * (nz / cam.zoom);
  cam.zoom = nz;
  applyTransform(); updateZoomLabel();
}

export function fitView() {
  const nodes = getNodes();
  const vis = nodes.filter(n => !window.__crmIsHidden?.(n.id));
  if (!vis.length) return;
  const padding = 80;
  const minX = Math.min(...vis.map(n => n.x));
  const maxX = Math.max(...vis.map(n => n.x + NODE_W));
  const minY = Math.min(...vis.map(n => n.y));
  const maxY = Math.max(...vis.map(n => n.y + 120));
  const c = document.getElementById('canvas-container');
  const cw = c.offsetWidth, ch = c.offsetHeight;
  const nz = Math.min(1.2, Math.min((cw - padding * 2) / (maxX - minX || 1), (ch - padding * 2) / (maxY - minY || 1)));
  cam.zoom = Math.max(0.15, nz);
  cam.panX = (cw - (maxX - minX) * cam.zoom) / 2 - minX * cam.zoom;
  cam.panY = (ch - (maxY - minY) * cam.zoom) / 2 - minY * cam.zoom;
  applyTransform(); updateZoomLabel();
}

// ── Connect (n8n-style edge drag) ─────────────────────────────────────────────

function clearConnectHighlight() {
  document.querySelectorAll('.node-wrap.connect-target').forEach(el => el.classList.remove('connect-target'));
}

export function startConnect(ev, fromId) {
  ev.preventDefault(); ev.stopPropagation();
  if (drag.active) return;
  connect.active   = true;
  connect.fromId   = fromId;
  connect.targetId = null;

  const svg = document.getElementById('edges-svg');
  connect.previewPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  connect.previewPath.setAttribute('stroke', '#388bfd');
  connect.previewPath.setAttribute('stroke-width', '2');
  connect.previewPath.setAttribute('fill', 'none');
  svg.appendChild(connect.previewPath);

  ev.currentTarget.setPointerCapture?.(ev.pointerId);
  document.addEventListener('pointermove', _onConnectMove);
  document.addEventListener('pointerup',   _onConnectEnd);
  _onConnectMove(ev);
}

function _onConnectMove(ev) {
  if (!connect.active || !connect.fromId || !connect.previewPath) return;
  const from   = findNode(connect.fromId);
  const fromEl = document.querySelector(`.node-wrap[data-id="${connect.fromId}"]`);
  if (!from || !fromEl) return;

  const p1x = from.x + NODE_W;
  const p1y = from.y + fromEl.offsetHeight / 2;
  const c   = toCanvasXY(ev.clientX, ev.clientY);
  const my  = (p1y + c.y) / 2;
  connect.previewPath.setAttribute('d', `M ${p1x} ${p1y} C ${p1x} ${my}, ${c.x} ${my}, ${c.x} ${c.y}`);

  clearConnectHighlight();
  connect.targetId = null;
  const hit = (ev.target.closest?.('.node-wrap')) || document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.node-wrap');
  if (hit) {
    const tid = hit.dataset.id;
    if (tid && tid !== connect.fromId) {
      const sub = new Set(gatherSubtree(connect.fromId));
      const tn  = findNode(tid);
      if (!sub.has(tid) && tn && tn.nodeType !== 'note') {
        connect.targetId = tid;
        hit.classList.add('connect-target');
      }
    }
  }
}

function _onConnectEnd(ev) {
  if (!connect.active) return;
  document.removeEventListener('pointermove', _onConnectMove);
  document.removeEventListener('pointerup',   _onConnectEnd);
  if (connect.previewPath?.parentNode) connect.previewPath.remove();
  clearConnectHighlight();

  const fromId = connect.fromId, toId = connect.targetId;
  connect.active = false; connect.fromId = null; connect.targetId = null; connect.previewPath = null;

  if (fromId && toId) {
    const sub = new Set(gatherSubtree(fromId));
    if (sub.has(toId) || fromId === toId) { toast('不可形成環'); return; }
    pushUndo();
    dispatch({ type: 'NODE_UPDATE', payload: { id: toId, patch: { parentId: fromId } } });
    renderNodes();
    selectNode(toId);
    toast('已建立上下階關係');
    return;
  }

  // 在空白處放開 → 建立新節點
  const c = toCanvasXY(ev.clientX, ev.clientY);
  const n = newNode();
  n.parentId = fromId;
  n.x = c.x - NODE_W / 2;
  n.y = c.y - 30;
  pushUndo();
  dispatch({ type: 'NODE_ADD', payload: n });
  renderNodes();
  _openPanelFn(n.id);
  toast('已新增子節點');
}

// ── initCanvas ────────────────────────────────────────────────────────────────

export function initCanvas() {
  const cont = document.getElementById('canvas-container');

  // ── Wheel zoom ──
  cont.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = cont.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const f  = e.deltaY < 0 ? 1.12 : 0.9;
    const nz = Math.max(0.15, Math.min(4, cam.zoom * f));
    cam.panX = mx - (mx - cam.panX) * (nz / cam.zoom);
    cam.panY = my - (my - cam.panY) * (nz / cam.zoom);
    cam.zoom = nz;
    applyTransform(); updateZoomLabel();
  }, { passive: false });

  // ── Pan (background) ──
  cont.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pan.active  = true;
    pan.moved   = false;
    pan.startMX = e.clientX; pan.startMY = e.clientY;
    pan.startPX = cam.panX;  pan.startPY = cam.panY;
    cont.style.cursor = 'grabbing';
  });

  cont.addEventListener('click', e => {
    if (flags.suppressNextCanvasClick) { flags.suppressNextCanvasClick = false; return; }
    if (pan.moved) return;
    deselect();
    _closePanelFn();
  });

  // ── Pointermove (drag nodes + pan) ──
  document.addEventListener('pointermove', e => {
    if (drag.id !== null) {
      const dx = e.clientX - drag.startMX;
      const dy = e.clientY - drag.startMY;
      if (!drag.active && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        drag.active  = true;
        drag.didMove = true;
        document.querySelector(`.node-wrap[data-id="${drag.id}"]`)?.classList.add('dragging');
      }
      if (drag.active) {
        drag.startPositions.forEach((pos, id) => {
          const dn = findNode(id);
          if (dn) {
            dn.x = pos.x + dx / cam.zoom;
            dn.y = pos.y + dy / cam.zoom;
            const el = document.querySelector(`.node-wrap[data-id="${id}"]`);
            if (el) { el.style.left = dn.x + 'px'; el.style.top = dn.y + 'px'; }
          }
        });

        // Snap-target detection
        const dn = findNode(drag.id);
        if (dn) {
          const subtree  = gatherSubtree(drag.id);
          const snapR    = SNAP_RADIUS / cam.zoom;
          const dragCX   = dn.x + NODE_W / 2;
          const dragCY   = dn.y + 60;
          let bestId = null, bestDist = snapR;
          getNodes().forEach(cand => {
            if (subtree.includes(cand.id)) return;
            const dist = Math.hypot(dragCX - (cand.x + NODE_W / 2), dragCY - (cand.y + 60));
            if (dist < bestDist) { bestDist = dist; bestId = cand.id; }
          });
          if (snap.targetId !== bestId) {
            document.querySelector(`.node-wrap[data-id="${snap.targetId}"]`)?.classList.remove('snap-target');
            snap.targetId = bestId;
            document.querySelector(`.node-wrap[data-id="${snap.targetId}"]`)?.classList.add('snap-target');
          }
        }
        drawEdges();
      }
      return;
    }
    if (pan.active) {
      const dx = e.clientX - pan.startMX, dy = e.clientY - pan.startMY;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) pan.moved = true;
      cam.panX = pan.startPX + dx; cam.panY = pan.startPY + dy;
      applyTransform();
    }
  });

  // ── Pointerup ──
  document.addEventListener('pointerup', e => {
    if (panelResize.active) {
      panelResize.active = false;
      document.body.style.cursor = '';
      document.getElementById('panel-resize')?.classList.remove('active');
      return;
    }
    if (drag.id !== null) {
      const wasDragging = drag.active;
      document.querySelector(`.node-wrap[data-id="${drag.id}"]`)?.classList.remove('dragging');
      if (drag.active) {
        if (snap.targetId) {
          pushUndo();
          dispatch({ type: 'NODE_UPDATE', payload: { id: drag.id, patch: { parentId: snap.targetId } } });
          document.querySelector(`.node-wrap[data-id="${snap.targetId}"]`)?.classList.remove('snap-target');
          snap.targetId = null;
          renderNodes();
          toast('節點已連接');
        } else {
          if (snap.targetId) {
            document.querySelector(`.node-wrap[data-id="${snap.targetId}"]`)?.classList.remove('snap-target');
            snap.targetId = null;
          }
          // 持久化拖曳後的位置
          dispatch({ type: 'NODES_SET', payload: getNodes() });
        }
      }
      drag.id = null; drag.active = false;
      if (wasDragging) flags.suppressNextCanvasClick = true;
      return;
    }
    if (pan.active) {
      pan.active = false;
      cont.style.cursor = 'default';
    }
  });

  // ── Pinch-to-zoom ──
  let lastPinchDist = null;
  cont.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      lastPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: true });
  cont.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && lastPinchDist) {
      e.preventDefault();
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const f = dist / lastPinchDist;
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rect = cont.getBoundingClientRect();
      const mx = midX - rect.left, my = midY - rect.top;
      const nz = Math.max(0.15, Math.min(4, cam.zoom * f));
      cam.panX = mx - (mx - cam.panX) * (nz / cam.zoom);
      cam.panY = my - (my - cam.panY) * (nz / cam.zoom);
      cam.zoom = nz; lastPinchDist = dist;
      applyTransform(); updateZoomLabel();
    }
  }, { passive: false });
  cont.addEventListener('touchend', e => { if (e.touches.length < 2) lastPinchDist = null; }, { passive: true });

  // ── Panel resize ──
  const resizeHandle = document.getElementById('panel-resize');
  if (resizeHandle) {
    resizeHandle.addEventListener('mousedown', e => {
      panelResize.active = true;
      panelResize.startX = e.clientX;
      panelResize.startW = document.getElementById('side-panel')?.offsetWidth || 380;
      document.body.style.cursor = 'col-resize';
      resizeHandle.classList.add('active');
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!panelResize.active) return;
      const dx = panelResize.startX - e.clientX;
      const w  = Math.max(280, Math.min(680, panelResize.startW + dx));
      const panel = document.getElementById('side-panel');
      if (panel) panel.style.width = w + 'px';
    });
  }
}
