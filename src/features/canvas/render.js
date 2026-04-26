/**
 * canvas/render.js
 * 節點 DOM 渲染
 * 依賴：core/state.js, models/node.js, canvas/canvasState.js, canvas/select.js, canvas/edges.js
 *
 * HTML inline onclick 呼叫的函式（cycleStatus, openPanel 等）透過 window.xxx 橋接，
 * 在 main.js 初始化後掛上。此模組不直接 import 這些函式以避免循環依賴。
 */

import { getNodes, findNode, getChildren, isHidden } from '../../core/state.js';
import { NOTE_COLORS, STATUS_LABELS } from '../../models/node.js';
import { drag } from './canvasState.js';
import { NODE_W } from './canvasState.js';
import { getSelId } from './select.js';
import { drawEdges } from './edges.js';

// updateStats 由 main.js 注入
let _updateStatsFn = () => {};
export function setUpdateStatsFn(fn) { _updateStatsFn = fn; }

/** HTML encode — 節點內容安全輸出 */
function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── _attachNodeDrag ───────────────────────────────────────────────────────────

/**
 * 為節點 wrap 掛上拖曳 + click 事件
 * crud.js 中的函式透過 window.xxx 存取
 * @param {HTMLElement} wrap
 * @param {object} n  Node
 */
export function _attachNodeDrag(wrap, n) {
  wrap.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.classList.contains('note-content')) return;
    e.stopPropagation();

    window.__crmSelectNode?.(n.id);

    drag.id         = n.id;
    drag.startMX    = e.clientX;
    drag.startMY    = e.clientY;
    drag.startPositions = new Map();
    drag.active     = false;
    drag.didMove    = false;

    // 收集整個子樹的起始位置
    window.__crmGatherSubtree?.(n.id)?.forEach(sid => {
      const sn = findNode(sid);
      if (sn) drag.startPositions.set(sid, { x: sn.x, y: sn.y });
    });
  });

  wrap.addEventListener('click', e => {
    e.stopPropagation();
    if (drag.active) return;
    const a = e.target.closest('[data-a]');
    if (a) {
      const act = a.dataset.a, id = a.dataset.id;
      if (act === 'open')          window.__crmOpenPanel?.(id);
      else if (act === 'status')   window.__crmCycleStatus?.(id);
      else if (act === 'add')      window.__crmAddChild?.(id);
      else if (act === 'del')      window.__crmPromptDel?.(id);
      else if (act === 'collapse') window.__crmToggleCollapse?.(id);
      return;
    }
    // 再次點擊已選取的節點 → 開啟資訊表單
    if (getSelId() === n.id) window.__crmOpenPanel?.(n.id);
  });

  wrap.addEventListener('dblclick', e => {
    e.stopPropagation();
    if (n.nodeType === 'note') return;
    window.__crmOpenPanel?.(n.id);
  });
}

// ── renderNodes ───────────────────────────────────────────────────────────────

export function renderNodes() {
  const layer = document.getElementById('nodes-layer');
  if (!layer) return;
  layer.innerHTML = '';

  const selId = getSelId();
  const nodes = getNodes();

  nodes.forEach(n => {
    if (isHidden(n.id)) return;

    const isRoot = !n.parentId && n.status === null;
    const kids   = getChildren(n.id);
    const hasKids = kids.length > 0;

    const wrap = document.createElement('div');
    wrap.dataset.id = n.id;
    wrap.style.cssText = `left:${n.x}px;top:${n.y}px`;

    const collapseHtml = hasKids
      ? `<button class="collapse-btn" data-a="collapse" data-id="${n.id}">${n.collapsed ? '▼ 展開(' + kids.length + ')' : '▲ 收合'}</button>`
      : '';

    // ── 便條節點 ──────────────────────────────────────────────
    if (n.nodeType === 'note') {
      const nc = NOTE_COLORS.find(c => c.id === (n.noteColor || 'yellow')) || NOTE_COLORS[0];
      const nfs = Math.max(10, Math.min(20, n.noteFontSize || 12));
      wrap.className = 'node-wrap note-node' + (selId === n.id ? ' selected' : '');
      wrap.innerHTML = `
        <div class="node-card note-card" style="background:${nc.bg};border-color:${nc.border}${selId === n.id ? ';box-shadow:0 0 0 2px ' + nc.text + '55' : ''}">
          <div class="node-drag-handle" title="拖曳移動">⠿</div>
          <div class="note-content" style="color:${nc.text};font-size:${nfs}px"
               contenteditable="true"
               data-id="${n.id}"
               onblur="window.__crmSaveNoteContent?.(this)"
               onkeydown="if(event.key==='Escape')this.blur()"
               spellcheck="false">${escHtml(n.content || '').replace(/\n/g, '<br>')}</div>
          <div class="node-footer">
            <div class="note-footer-tools">
              <div class="note-color-picker">
                ${NOTE_COLORS.map(c => `<div class="note-color-dot${(n.noteColor || 'yellow') === c.id ? ' active' : ''}" style="background:${c.text}" onclick="window.__crmSetNoteColor?.('${n.id}','${c.id}');event.stopPropagation()" title="${c.id}"></div>`).join('')}
              </div>
              <div class="note-font-ctrl">
                <button class="note-font-btn" onclick="window.__crmSetNoteFontSize?.('${n.id}',${nfs}-1);event.stopPropagation()" title="縮小">A−</button>
                <button class="note-font-btn" onclick="window.__crmSetNoteFontSize?.('${n.id}',${nfs}+1);event.stopPropagation()" title="放大">A+</button>
              </div>
            </div>
          </div>
          ${collapseHtml}
        </div>`;
      layer.appendChild(wrap);
      _attachNodeDrag(wrap, n);
      return;
    }

    // ── 一般聯繫人節點 ────────────────────────────────────────
    const meta = n.info.company || (n.info.tags && n.info.tags[0]) || '';
    const ROLE_MAP = { 潛在客戶: 'role-prospect', 轉介紹中心: 'role-referral', 學員: 'role-student', 從業人員: 'role-agent' };
    const roleHtml = n.info.role ? `<div class="node-role-pill ${ROLE_MAP[n.info.role] || ''}">${n.info.role}</div>` : '';
    const regionsHtml = (n.info.regions && n.info.regions.length)
      ? `<div class="node-region-tags">${n.info.regions.map(r => `<span class="node-region-tag">${r}</span>`).join('')}</div>` : '';

    wrap.className = 'node-wrap' + (n.status && !isRoot ? ' status-' + n.status : '') + (selId === n.id ? ' selected' : '');

    const statusHtml = isRoot
      ? `<div class="node-root-pill">根節點</div>`
      : `<div class="status-pill" onclick="event.stopPropagation();if(!window.__crmDrag?.active)window.__crmCycleStatus?.('${n.id}')" title="點擊切換狀態"><span class="status-dot"></span>${STATUS_LABELS[n.status] || ''}</div>`;

    wrap.innerHTML = `
      <div class="node-card">
        <div class="node-drag-handle" title="拖曳移動">⠿</div>
        <div class="node-header">
          <div class="node-avatar">${(n.name || '?')[0]}</div>
          <div class="node-name" data-a="open" data-id="${n.id}" title="${n.name}">${n.name}</div>
        </div>
        ${statusHtml}
        ${roleHtml}
        ${regionsHtml}
        <div class="node-footer">
          <div class="node-meta">${meta}</div>
          <div class="node-actions">
            <button class="act-btn" data-a="add" data-id="${n.id}" title="新增子節點">+</button>
            <button class="act-btn del" data-a="del" data-id="${n.id}" title="刪除">🗑</button>
          </div>
        </div>
        ${collapseHtml}
        <button class="node-port-add" title="拖線建立關係" data-id="${n.id}"
          onclick="event.stopPropagation()"
          onpointerdown="window.__crmStartConnect?.(event,'${n.id}')">+</button>
      </div>`;

    _attachNodeDrag(wrap, n);
    layer.appendChild(wrap);
  });

  setTimeout(drawEdges, 0);
  _updateStatsFn();
}
