/**
 * canvas/edges.js
 * SVG 邊線繪製
 * 依賴：core/state.js, canvas/canvasState.js, canvas/layout.js
 */

import { getNodes, findNode, isHidden } from '../../core/state.js';
import { drag, snap } from './canvasState.js';
import { NODE_W, NODE_H_EST } from './canvasState.js';

/** 重繪所有邊線（一般 + snap preview） */
export function drawEdges() {
  const svg = document.getElementById('edges-svg');
  if (!svg) return;
  svg.innerHTML = '';

  const nodes = getNodes();

  // ── 正常邊線 ─────────────────────────────────────────────
  nodes.forEach(n => {
    if (!n.parentId) return;
    if (isHidden(n.id)) return;
    if (drag.active && n.id === drag.id) return; // 拖曳中跳過舊邊

    const parent = findNode(n.parentId);
    if (!parent || isHidden(parent.id) || parent.collapsed) return;

    const pEl = document.querySelector(`.node-wrap[data-id="${parent.id}"]`);
    const nEl = document.querySelector(`.node-wrap[data-id="${n.id}"]`);
    if (!pEl || !nEl) return;

    const px = parent.x + NODE_W / 2;
    const py = parent.y + pEl.offsetHeight;
    const cx = n.x + NODE_W / 2;
    const cy = n.y;
    const my = (py + cy) / 2;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${px} ${py} C ${px} ${my}, ${cx} ${my}, ${cx} ${cy}`);
    path.setAttribute('stroke', '#30363d');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('fill', 'none');
    svg.appendChild(path);
  });

  // ── Snap preview（拖曳中虛線預覽）──────────────────────────
  if (drag.active && drag.id && snap.targetId) {
    const dn = findNode(drag.id);
    const sn = findNode(snap.targetId);
    const snEl = document.querySelector(`.node-wrap[data-id="${snap.targetId}"]`);
    if (dn && sn && snEl) {
      const px = sn.x + NODE_W / 2;
      const py = sn.y + snEl.offsetHeight;
      const cx = dn.x + NODE_W / 2;
      const cy = dn.y;
      const my = (py + cy) / 2;

      const preview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      preview.setAttribute('d', `M ${px} ${py} C ${px} ${my}, ${cx} ${my}, ${cx} ${cy}`);
      preview.setAttribute('stroke', '#388bfd');
      preview.setAttribute('stroke-width', '2.5');
      preview.setAttribute('stroke-dasharray', '8 4');
      preview.setAttribute('fill', 'none');
      preview.setAttribute('opacity', '0.85');
      preview.classList.add('snap-preview-edge');
      svg.appendChild(preview);
    }
  }
}
