/**
 * canvas/views.js
 * CRM 人脈視圖切換：tree(畫布) / graph / region / status / contact
 * 依賴：core/state.js, canvas/render.js, canvas/edges.js
 */

import { getNodes } from '../../core/state.js';
import { renderGraphView, refreshGraphView } from './graph-view.js';

let _currentView  = 'tree';
let _sortAsc      = false;

export function getCurrentView() { return _currentView; }

export function setCrmView(view) {
  _currentView = view;
  document.querySelectorAll('.crm-view-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`vbtn-${view}`);
  if (btn) btn.classList.add('active');

  const sortBtn = document.getElementById('crm-sort-dir-btn');
  const canvasCont = document.getElementById('canvas-container');
  const listCont   = document.getElementById('crm-list-view');

  const graphCont = document.getElementById('gv-container');

  if (view === 'tree') {
    if (canvasCont) canvasCont.style.display = '';
    if (listCont)   listCont.style.display   = 'none';
    if (graphCont)  graphCont.style.display  = 'none';
    if (sortBtn)    sortBtn.style.display     = 'none';
    window.__crmRenderNodes?.();
    window.__crmDrawEdges?.();
  } else if (view === 'graph') {
    if (canvasCont) canvasCont.style.display = 'none';
    if (listCont)   listCont.style.display   = 'none';
    if (sortBtn)    sortBtn.style.display     = 'none';
    // create container if needed
    let gc = document.getElementById('gv-container');
    if (!gc) {
      gc = document.createElement('div');
      gc.id = 'gv-container';
      gc.style.cssText = 'flex:1;position:relative;overflow:hidden;height:100%';
      canvasCont?.parentNode?.insertBefore(gc, canvasCont.nextSibling);
    }
    gc.style.display = '';
    renderGraphView(gc);
  } else {
    if (canvasCont) canvasCont.style.display = 'none';
    if (graphCont)  graphCont.style.display  = 'none';
    if (sortBtn)    sortBtn.style.display     = '';
    renderListView(view);
  }
}

export function toggleCrmSortDir() {
  _sortAsc = !_sortAsc;
  const btn = document.getElementById('crm-sort-dir-btn');
  if (btn) btn.textContent = _sortAsc ? '↑ 升冪' : '↓ 降冪';
  renderListView(_currentView);
}

export function renderListView(view) {
  let cont = document.getElementById('crm-list-view');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'crm-list-view';
    cont.style.cssText = 'flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px';
    document.getElementById('canvas-container')?.parentNode?.appendChild(cont);
  }
  cont.style.display = '';

  const nodes = getNodes().filter(n => n.parentId !== null && n.name && n.name !== '新聯繫人');

  let sorted;
  if (view === 'region') {
    sorted = [...nodes].sort((a, b) => {
      const ra = (a.info?.regions || []).join(',');
      const rb = (b.info?.regions || []).join(',');
      return _sortAsc ? ra.localeCompare(rb) : rb.localeCompare(ra);
    });
  } else if (view === 'status') {
    const order = { green: 0, yellow: 1, red: 2, gray: 3 };
    sorted = [...nodes].sort((a, b) => {
      const d = (order[a.status] ?? 9) - (order[b.status] ?? 9);
      return _sortAsc ? -d : d;
    });
  } else if (view === 'contact') {
    sorted = [...nodes].sort((a, b) => {
      const da = a.info?.lastContact || '0000';
      const db = b.info?.lastContact || '0000';
      return _sortAsc ? da.localeCompare(db) : db.localeCompare(da);
    });
  } else {
    sorted = nodes;
  }

  const today = new Date().toISOString().slice(0, 10);
  cont.innerHTML = sorted.map(n => {
    const region  = (n.info?.regions || []).join(', ') || '—';
    const last    = n.info?.lastContact || '未聯繫';
    const days    = n.info?.lastContact
      ? Math.floor((new Date(today) - new Date(n.info.lastContact)) / 86400000)
      : null;
    const daysStr = days !== null ? `${days}天前` : '';
    const statusDot = n.status ? `<span class="sdot ${n.status}" style="width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px"></span>` : '';
    return `<div class="list-node-row" onclick="window.__crmOpenPanel?.('${n.id}')" style="
      display:flex;align-items:center;gap:12px;padding:10px 14px;
      background:var(--surface1);border-radius:8px;cursor:pointer;
      border:1px solid var(--border)">
      ${statusDot}
      <span style="flex:1;font-weight:500">${n.name}</span>
      ${view === 'region'  ? `<span style="color:var(--text-muted);font-size:12px">📍 ${region}</span>` : ''}
      ${view === 'contact' ? `<span style="color:var(--text-muted);font-size:12px">📅 ${last} ${daysStr}</span>` : ''}
      ${view === 'status'  ? `<span style="color:var(--text-muted);font-size:12px">${last}</span>` : ''}
    </div>`;
  }).join('');
}
