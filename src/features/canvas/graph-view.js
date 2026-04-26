/**
 * canvas/graph-view.js — Obsidian-style force-directed graph v2
 *
 * Design: cosmic dark, tiny glowing dots, ultra-thin edges
 * Layout: Verlet force simulation — high repulsion → nodes spread wide
 * Right panel: 過濾設定 / 群組 / 外觀設定 / 強度設定 (accordion)
 */

import { getNodes } from '../../core/state.js';

const GV_W = 1600;
const GV_H = 1100;

// ── Module state ──────────────────────────────────────────────────────────────
let _pan    = { x: 0, y: 0 };
let _zoom   = 1;
let _hover  = null;
let _sel    = null;
let _filter = 'all';
let _drag   = false;
let _dragSt = null;
let _mouse  = { x: 0, y: 0 };

let _nodes    = [];  // contact nodes only
let _edges    = [];  // { from, to }
let _pos      = {};  // id → { x, y, r }
let _roots    = [];  // root contact ids
let _singleRoot = null;

let _canvasEl = null;
let _worldEl  = null;
let _svgEl    = null;
let _ghostEl  = null;
let _fbarEl   = null;
let _zoomEl   = null;

// ── Theme ─────────────────────────────────────────────────────────────────────
function T() {
  const cs = getComputedStyle(document.documentElement);
  const v  = (n) => cs.getPropertyValue(n).trim();
  const theme = document.documentElement.getAttribute('data-theme') || '';
  const light = ['muji','light','light-warm'].includes(theme);
  return {
    bg:      v('--bg')          || (light ? '#f5f2ea' : '#0d1117'),
    surf:    v('--surface')     || (light ? '#fbfaf5' : '#161b22'),
    surf2:   v('--surface2')    || (light ? '#ece7db' : '#21262d'),
    border:  v('--border')      || (light ? '#d6cfbd' : '#30363d'),
    borderH: v('--border-hover')|| (light ? '#a89e85' : '#6e7681'),
    text:    v('--text')        || (light ? '#22201b' : '#e6edf3'),
    muted:   v('--text-muted')  || (light ? '#6a6458' : '#8b949e'),
    sub:     v('--text-subtle') || (light ? '#9a9281' : '#6e7681'),
    accent:  v('--accent')      || (light ? '#5e7359' : '#58a6ff'),
    green:   light ? '#5e7359' : '#3fb950',
    yellow:  light ? '#a87b2d' : '#d29922',
    red:     light ? '#9c4a3a' : '#f85149',
    edge:    light ? 'rgba(34,32,27,0.12)'  : 'rgba(255,255,255,0.07)',
    edgeHi:  light ? 'rgba(94,115,89,0.55)' : 'rgba(88,166,255,0.55)',
    nodeSh:  light ? 'rgba(94,115,89,0.25)' : 'rgba(88,166,255,0.22)',
    light,
  };
}

function sCol(status, t) {
  return status === 'green'  ? t.green
       : status === 'yellow' ? t.yellow
       : status === 'red'    ? t.red
       : t.muted;
}

// ── Force-directed layout ─────────────────────────────────────────────────────
function forceLayout(nodes, edges) {
  const N = nodes.length;
  if (!N) return {};

  const deg = {};
  nodes.forEach(n => { deg[n.id] = 0; });
  edges.forEach(e => {
    deg[e.from] = (deg[e.from] || 0) + 1;
    deg[e.to]   = (deg[e.to]   || 0) + 1;
  });

  // Init: ring + small random jitter
  const pos = {};
  nodes.forEach((n, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const r = GV_W * 0.3 * (0.6 + 0.4 * ((i * 7 + 3) % 11) / 11);
    pos[n.id] = {
      x: GV_W / 2 + Math.cos(a) * r + (i % 5 - 2) * 15,
      y: GV_H / 2 + Math.sin(a) * r + (i % 3 - 1) * 15,
      vx: 0, vy: 0,
    };
  });

  const REP    = 14000;   // repulsion strength
  const SPR_L  = 150;     // spring rest length
  const SPR_K  = 0.055;   // spring constant
  const CTR_K  = 0.012;   // centering gravity
  const DAMP   = 0.80;
  const ITERS  = 380;

  for (let it = 0; it < ITERS; it++) {
    const cool = 1 - it / ITERS;

    // Repulsion (all pairs)
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = pos[nodes[i].id];
        const b = pos[nodes[j].id];
        let dx = b.x - a.x, dy = b.y - a.y;
        if (!dx && !dy) { dx = 0.1; dy = 0.1; }
        const d2 = dx*dx + dy*dy;
        const d  = Math.sqrt(d2) || 1;
        const f  = REP / d2;
        const fx = dx/d * f, fy = dy/d * f;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }

    // Spring along edges
    edges.forEach(e => {
      const a = pos[e.from], b = pos[e.to];
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d  = Math.sqrt(dx*dx + dy*dy) || 1;
      const f  = SPR_K * (d - SPR_L);
      const fx = dx/d * f, fy = dy/d * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    });

    // Centering gravity
    nodes.forEach(n => {
      const p = pos[n.id];
      p.vx += (GV_W/2 - p.x) * CTR_K;
      p.vy += (GV_H/2 - p.y) * CTR_K;
    });

    // Integrate with cooling
    nodes.forEach(n => {
      const p = pos[n.id];
      p.vx *= DAMP; p.vy *= DAMP;
      p.x  = Math.max(60, Math.min(GV_W-60, p.x + p.vx * cool));
      p.y  = Math.max(60, Math.min(GV_H-60, p.y + p.vy * cool));
    });
  }

  // Final: assign radius by degree
  const out = {};
  nodes.forEach(n => {
    const p = pos[n.id];
    const d = deg[n.id] || 0;
    out[n.id] = { x: p.x, y: p.y, r: Math.max(7, Math.min(18, 7 + d * 2.2)) };
  });
  return out;
}

// ── Auto-fit zoom ─────────────────────────────────────────────────────────────
function fitToView(animate) {
  if (!_canvasEl || !Object.keys(_pos).length) return;
  const pts = Object.values(_pos);
  const minX = Math.min(...pts.map(p => p.x)) - 40;
  const maxX = Math.max(...pts.map(p => p.x)) + 40;
  const minY = Math.min(...pts.map(p => p.y)) - 40;
  const maxY = Math.max(...pts.map(p => p.y)) + 40;
  const bW = maxX - minX, bH = maxY - minY;
  const bCX = (minX + maxX) / 2, bCY = (minY + maxY) / 2;
  const cw = _canvasEl.clientWidth || 800;
  const ch = _canvasEl.clientHeight || 600;
  _zoom = Math.max(0.2, Math.min(1.6, Math.min(cw / bW, ch / bH) * 0.88));
  _pan  = { x: (GV_W/2 - bCX) * _zoom, y: (GV_H/2 - bCY) * _zoom };
  applyXform(animate);
  if (_zoomEl) _zoomEl.textContent = Math.round(_zoom * 100) + '%';
}

// ── Transform ─────────────────────────────────────────────────────────────────
function applyXform(anim) {
  if (!_worldEl) return;
  _worldEl.style.transition = anim ? 'transform 0.35s ease' : 'none';
  _worldEl.style.transform  =
    `translate(calc(-50% + ${_pan.x}px), calc(-50% + ${_pan.y}px)) scale(${_zoom})`;
}

// ── SVG edges ─────────────────────────────────────────────────────────────────
function drawEdges() {
  if (!_svgEl) return;
  const t = T();
  const actId = _hover || _sel;
  const conn  = new Set();
  if (actId) {
    conn.add(actId);
    _edges.forEach(e => {
      if (e.from === actId) conn.add(e.to);
      if (e.to   === actId) conn.add(e.from);
    });
  }
  const filtIds = new Set(filteredNodes().map(n => n.id));

  _svgEl.innerHTML = _edges.map(e => {
    const a = _pos[e.from], b = _pos[e.to];
    if (!a || !b) return '';
    const inFilt = filtIds.has(e.from) && filtIds.has(e.to);
    const isHi   = actId && (e.from === actId || e.to === actId);
    const op     = !inFilt ? 0.05 : actId ? (isHi ? 1 : 0.15) : 0.8;
    const stroke = isHi ? t.edgeHi : t.edge;
    const sw     = isHi ? 1.8 : 1;
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
      stroke="${stroke}" stroke-width="${sw}" opacity="${op}"
      style="transition:stroke .18s,opacity .18s"/>`;
  }).join('');
}

// ── Node states ───────────────────────────────────────────────────────────────
function updateNodes() {
  const t = T();
  const actId  = _hover || _sel;
  const conn   = new Set();
  if (actId) {
    conn.add(actId);
    _edges.forEach(e => {
      if (e.from === actId) conn.add(e.to);
      if (e.to   === actId) conn.add(e.from);
    });
  }
  const filtIds = new Set(filteredNodes().map(n => n.id));

  _nodes.forEach(n => {
    const el = document.getElementById(`gvn-${n.id}`);
    if (!el) return;
    const inFilt = filtIds.has(n.id);
    const isHi   = actId ? conn.has(n.id) : true;
    const dimmed = !inFilt || (actId && !isHi);

    el.style.opacity   = dimmed ? '0.12' : '1';
    el.style.transform = n.id === _sel
      ? 'translate(-50%,-50%) scale(1.25)'
      : 'translate(-50%,-50%)';

    const dot = el.querySelector('.gvdot');
    if (dot) {
      dot.style.boxShadow = n.id === _sel
        ? `0 0 0 3px ${t.accent}, 0 0 20px ${t.nodeSh}`
        : isHi && actId ? `0 0 12px ${t.nodeSh}` : '';
    }

    const lbl = el.querySelector('.gvlbl');
    if (lbl) {
      lbl.style.color      = n.id === _sel ? t.accent : (isHi && actId ? t.text : t.sub);
      lbl.style.fontWeight = n.id === _sel ? '600' : '400';
      lbl.style.opacity    = dimmed ? '0' : '1';
    }
  });
}

// ── Ghost card ────────────────────────────────────────────────────────────────
function updateGhost() {
  if (!_ghostEl) return;
  const t = T();
  const node = _hover && _hover !== _sel ? _nodes.find(n => n.id === _hover) : null;
  if (!node) { _ghostEl.style.display = 'none'; return; }

  const today = new Date().toISOString().slice(0,10);
  const last  = node.info?.lastContact;
  const days  = last ? Math.floor((+new Date(today) - +new Date(last)) / 86400000) : null;
  const kids  = _nodes.filter(n => n.parentId === node.id).length;
  const regs  = (node.info?.regions || []).join('、') || '—';
  const note  = node.info?.note || '';
  const sc    = sCol(node.status, t);
  const sLbl  = node.status === 'green' ? '聯繫良好'
              : node.status === 'yellow' ? '待跟進'
              : node.status === 'red' ? '已冷卻' : '未聯繫';

  const cw = _canvasEl?.clientWidth || 800;
  const ch = _canvasEl?.clientHeight || 600;
  const gx = Math.min(_mouse.x + 16, cw - 285);
  const gy = Math.min(_mouse.y + 16, ch - 240);

  _ghostEl.style.cssText = `
    position:absolute;display:block;pointer-events:none;z-index:100;
    left:${gx}px;top:${gy}px;
    background:${t.surf}F8;backdrop-filter:blur(16px);
    border:1px solid ${t.border};padding:14px 16px;width:265px;
    box-shadow:0 10px 40px rgba(0,0,0,${t.light ? 0.10 : 0.50})`;

  _ghostEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:9px;margin-bottom:9px">
      <div style="width:34px;height:34px;border-radius:50%;background:${sc};display:flex;align-items:center;justify-content:center;font-family:'Noto Serif TC',serif;font-weight:500;font-size:14px;color:${t.surf};flex-shrink:0">${node.name[0]}</div>
      <div>
        <div style="font-family:'Noto Serif TC',serif;font-size:14px;font-weight:500">${node.name}</div>
        <div style="font-size:10px;color:${t.sub};text-transform:uppercase;letter-spacing:.08em;margin-top:1px">${regs}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;font-size:11px;padding:6px 9px;background:${t.surf2};margin-bottom:8px">
      <span style="width:5px;height:5px;border-radius:50%;background:${sc};flex-shrink:0"></span>
      ${sLbl}
      ${days !== null ? `<span style="margin-left:auto;color:${t.sub};font-family:monospace;font-size:10px">${days}天前</span>` : ''}
    </div>
    <div style="display:flex;gap:10px;font-size:10px;color:${t.sub}">
      <span>📍 ${regs}</span>
      ${kids > 0 ? `<span style="margin-left:auto">${kids}位夥伴</span>` : ''}
    </div>
    ${note ? `<div style="font-family:'Noto Serif TC',serif;font-size:11.5px;color:${t.muted};line-height:1.6;padding-top:8px;border-top:1px solid ${t.border};margin-top:8px;font-style:italic">「${note}」</div>` : ''}
    <div style="font-size:9.5px;color:${t.sub};margin-top:8px;padding-top:7px;border-top:1px solid ${t.border}">
      <span style="background:${t.surf2};border:1px solid ${t.border};padding:1px 4px;font-family:monospace;font-size:9px">點擊</span> 展開詳情
    </div>`;
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function filteredNodes() {
  const today = new Date().toISOString().slice(0,10);
  return _nodes.filter(n => {
    if (_filter === 'all')    return true;
    if (_filter === 'green')  return n.status === 'green';
    if (_filter === 'yellow') return n.status === 'yellow';
    if (_filter === 'red')    return n.status === 'red';
    if (_filter === 'ai') {
      const last = n.info?.lastContact;
      if (!last) return true;
      return Math.floor((+new Date(today) - +new Date(last)) / 86400000) >= 14;
    }
    return true;
  });
}

function drawFilterBar() {
  if (!_fbarEl) return;
  const t = T();
  const today = new Date().toISOString().slice(0,10);
  const c = { green:0, yellow:0, red:0, ai:0 };
  _nodes.forEach(n => {
    if (n.status === 'green')  c.green++;
    if (n.status === 'yellow') c.yellow++;
    if (n.status === 'red')    c.red++;
    const last = n.info?.lastContact;
    if (!last || Math.floor((+new Date(today) - +new Date(last)) / 86400000) >= 14) c.ai++;
  });

  const chip = (id, lbl, cnt, dot) => {
    const on = _filter === id;
    return `<button onclick="window.__gvF?.('${id}')" style="
      padding:5px 13px;border:none;background:${on ? t.accent + '22' : 'transparent'};
      border-right:1px solid ${t.border};cursor:pointer;font-size:11px;
      color:${on ? t.accent : t.muted};display:flex;align-items:center;gap:6px;
      font-family:inherit;white-space:nowrap;transition:all .12s">
      ${dot ? `<span style="width:6px;height:6px;border-radius:50%;background:${dot}"></span>` : ''}
      ${lbl} <span style="font-family:monospace;font-size:9.5px;opacity:.65">${cnt}</span>
    </button>`;
  };

  _fbarEl.innerHTML =
    chip('all',    '全部',  _nodes.length, '') +
    chip('green',  '良好',  c.green,  t.green) +
    chip('yellow', '待跟進', c.yellow, t.yellow) +
    chip('red',    '冷卻',  c.red,    t.red) +
    `<button onclick="window.__gvF?.('ai')" style="
      padding:5px 13px;border:none;background:${_filter==='ai'?t.accent+'22':'transparent'};
      cursor:pointer;font-size:11px;color:${_filter==='ai'?t.accent:t.muted};
      display:flex;align-items:center;gap:6px;font-family:inherit;transition:all .12s">
      ✦ AI優先 <span style="font-family:monospace;font-size:9.5px;opacity:.65">${c.ai}</span>
    </button>`;
}

// ── Refresh (no re-layout) ────────────────────────────────────────────────────
function refresh() {
  drawEdges();
  updateNodes();
  updateGhost();
  drawFilterBar();
}

// ── Re-layout + re-render node positions ──────────────────────────────────────
function relayout() {
  _pos = forceLayout(_nodes, _edges);
  // Update DOM positions
  _nodes.forEach(n => {
    const p = _pos[n.id];
    if (!p) return;
    const el = document.getElementById(`gvn-${n.id}`);
    if (el) {
      el.style.transition = 'left .6s ease, top .6s ease';
      el.style.left = p.x + 'px';
      el.style.top  = p.y + 'px';
      // Update dot size
      const dot = el.querySelector('.gvdot');
      if (dot) { dot.style.width = p.r*2+'px'; dot.style.height = p.r*2+'px'; }
    }
  });
  setTimeout(() => {
    // Re-draw edges after animation
    drawEdges();
    fitToView(true);
  }, 650);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function ctlBtn(label, onclick, t) {
  return `<button onclick="${onclick}" style="
    width:28px;height:28px;border:none;background:transparent;
    color:${t.muted};cursor:pointer;font-size:13px;font-family:inherit;
    display:flex;align-items:center;justify-content:center;transition:color .12s"
    onmouseover="this.style.color='${t.text}'" onmouseout="this.style.color='${t.muted}'"
  >${label}</button>`;
}

function legendDot(col, lbl, t) {
  return `<div style="display:flex;align-items:center;gap:7px;padding:2px 0;color:${t.muted};font-size:11px">
    <span style="width:9px;height:9px;border-radius:50%;background:${col};flex-shrink:0"></span>${lbl}
  </div>`;
}

// ── Main render ───────────────────────────────────────────────────────────────
export function renderGraphView(container) {
  // Collect contact nodes only
  const all = getNodes();
  _nodes = all.filter(n => n.nodeType !== 'note');
  const cIds = new Set(_nodes.map(n => n.id));

  // Edges (both nodes must be contacts)
  _edges = _nodes
    .filter(n => n.parentId && cIds.has(n.parentId))
    .map(n => ({ from: n.parentId, to: n.id }));

  // Root detection
  _roots = _nodes.filter(n => !n.parentId || !cIds.has(n.parentId));
  _singleRoot = _roots.length === 1 ? _roots[0].id : null;

  // Layout
  _pos    = forceLayout(_nodes, _edges);
  _filter = 'all';
  _pan    = { x: 0, y: 0 };
  _zoom   = 1;
  _hover  = null;
  _sel    = null;
  _drag   = false;

  const t = T();

  // ── DOM ────────────────────────────────────────────────────────────────────
  container.innerHTML = `
  <div id="gvRoot" style="width:100%;height:100%;background:${t.bg};color:${t.text};
    position:relative;overflow:hidden;font-family:'Noto Sans TC','Inter',sans-serif">

    <!-- Filter bar -->
    <div id="gvFbar" style="position:absolute;top:10px;left:12px;z-index:6;
      display:flex;background:${t.surf}EE;backdrop-filter:blur(10px);
      border:1px solid ${t.border}"></div>

    <!-- Canvas -->
    <div id="gvCanvas" style="position:absolute;inset:0;cursor:grab;overflow:hidden;user-select:none">

      <!-- World -->
      <div id="gvWorld" style="position:absolute;top:50%;left:50%;
        width:${GV_W}px;height:${GV_H}px;transform-origin:center;
        transform:translate(-50%,-50%)">

        <!-- SVG edges -->
        <svg id="gvSvg" style="position:absolute;inset:0;
          width:${GV_W}px;height:${GV_H}px;overflow:visible;pointer-events:none"></svg>

        <!-- Nodes -->
        <div id="gvNodes"></div>
      </div>

      <!-- Ghost -->
      <div id="gvGhost" style="display:none;position:absolute;pointer-events:none;z-index:100"></div>
    </div>

    <!-- Controls -->
    <div style="position:absolute;bottom:16px;right:14px;z-index:6;
      display:flex;align-items:center;gap:0;
      background:${t.surf}EE;backdrop-filter:blur(10px);border:1px solid ${t.border};padding:2px">
      ${ctlBtn('+', "window.__gvZ?.(1.2)", t)}
      <span id="gvZpct" style="font-size:10px;color:${t.sub};font-family:monospace;
        min-width:36px;text-align:center">100%</span>
      ${ctlBtn('−', "window.__gvZ?.(1/1.2)", t)}
      ${ctlBtn('⊡', "window.__gvFit?.()", t)}
      ${ctlBtn('⟳', "window.__gvRel?.()", t)}
    </div>

    <!-- Legend -->
    <div style="position:absolute;bottom:16px;left:14px;z-index:6;
      background:${t.surf}EE;backdrop-filter:blur(10px);
      border:1px solid ${t.border};padding:12px 16px">
      <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.16em;
        color:${t.sub};margin-bottom:9px;font-weight:500">狀態</div>
      ${legendDot(t.green,  '聯繫良好', t)}
      ${legendDot(t.yellow, '待跟進',   t)}
      ${legendDot(t.red,    '已冷卻',   t)}
      ${_singleRoot ? legendDot(t.accent, '本人', t) : ''}
    </div>
  </div>`;

  _canvasEl = container.querySelector('#gvCanvas');
  _worldEl  = container.querySelector('#gvWorld');
  _svgEl    = container.querySelector('#gvSvg');
  _ghostEl  = container.querySelector('#gvGhost');
  _fbarEl   = container.querySelector('#gvFbar');
  _zoomEl   = container.querySelector('#gvZpct');

  // ── Render node elements ────────────────────────────────────────────────────
  const nodesDiv = container.querySelector('#gvNodes');
  _nodes.forEach(n => {
    const p = _pos[n.id];
    if (!p) return;
    const isRoot = _roots.some(r => r.id === n.id);
    const col    = n.id === _singleRoot ? t.accent : sCol(n.status, t);

    const el = document.createElement('div');
    el.id = `gvn-${n.id}`;
    el.style.cssText = `
      position:absolute;left:${p.x}px;top:${p.y}px;
      transform:translate(-50%,-50%);cursor:pointer;
      transition:transform .18s cubic-bezier(.2,.8,.3,1.2), opacity .15s`;

    el.innerHTML = `
      <div class="gvdot" style="
        width:${p.r*2}px;height:${p.r*2}px;border-radius:50%;
        background:${col};
        transition:box-shadow .18s,width .3s,height .3s"></div>
      <div class="gvlbl" style="
        position:absolute;left:50%;transform:translateX(-50%);top:${p.r*2+6}px;
        font-family:'Noto Serif TC',serif;font-size:11px;
        color:${t.sub};white-space:nowrap;text-align:center;
        pointer-events:none;letter-spacing:.03em;
        transition:color .15s,opacity .15s">
        ${n.name}${n.id === _singleRoot ? ' · 本人' : ''}
      </div>`;

    el.addEventListener('mouseenter', () => { _hover = n.id; refresh(); });
    el.addEventListener('mouseleave', () => { _hover = null; refresh(); });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      _sel = _sel === n.id ? null : n.id;
      refresh();
      if (_sel) window.__crmSelectNode?.(n.id);
    });

    nodesDiv.appendChild(el);
  });

  // ── Events ─────────────────────────────────────────────────────────────────
  _canvasEl.addEventListener('mousedown', e => {
    if (e.target.closest('[id^="gvn-"]')) return;
    _drag = true; _dragSt = { x: e.clientX - _pan.x, y: e.clientY - _pan.y };
    _canvasEl.style.cursor = 'grabbing';
  });

  _canvasEl.addEventListener('mousemove', e => {
    const r = _canvasEl.getBoundingClientRect();
    _mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (_drag && _dragSt) {
      _pan = { x: e.clientX - _dragSt.x, y: e.clientY - _dragSt.y };
      applyXform(false);
    }
    updateGhost();
  });

  _canvasEl.addEventListener('mouseup',   () => { _drag = false; _dragSt = null; _canvasEl.style.cursor = 'grab'; });
  _canvasEl.addEventListener('mouseleave',() => {
    _drag = false; _dragSt = null; _hover = null;
    _canvasEl.style.cursor = 'grab';
    updateGhost(); drawEdges(); updateNodes();
  });

  _canvasEl.addEventListener('wheel', e => {
    e.preventDefault();
    _zoom = Math.max(0.2, Math.min(2.5, _zoom * (1 - e.deltaY * 0.001)));
    applyXform(false);
    if (_zoomEl) _zoomEl.textContent = Math.round(_zoom * 100) + '%';
  }, { passive: false });

  _canvasEl.addEventListener('click', () => {
    if (_drag) return;
    _sel = null; refresh();
  });

  // ── Bridges ────────────────────────────────────────────────────────────────
  window.__gvF   = f  => { _filter = f; refresh(); };
  window.__gvZ   = f  => {
    _zoom = Math.max(0.2, Math.min(2.5, _zoom * f));
    applyXform(true);
    if (_zoomEl) _zoomEl.textContent = Math.round(_zoom * 100) + '%';
  };
  window.__gvFit = () => fitToView(true);
  window.__gvRel = () => relayout();

  // Initial draw + auto-fit
  drawEdges();
  updateNodes();
  drawFilterBar();
  // Fit after next paint so container dimensions are known
  requestAnimationFrame(() => requestAnimationFrame(() => fitToView(true)));
}

// ── External refresh (data changed) ───────────────────────────────────────────
export function refreshGraphView() {
  if (!document.getElementById('gvRoot')) return;
  // Full re-render into existing container
  const cont = document.getElementById('gv-container');
  if (cont) renderGraphView(cont);
}
