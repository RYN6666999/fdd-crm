/**
 * canvas/canvasState.js
 * Canvas 共用可變狀態 — 打破 edges/render/interact 之間的循環依賴
 * 所有 canvas 子模組都從這裡讀寫，不直接持有自己的 state 副本
 *
 * FORBIDDEN: no DOM access, no imports from other canvas/ modules
 */

// ── Layout constants ──────────────────────────────────────────────────────────
export const NODE_W       = 160;
export const NODE_H_EST   = 120;
export const GAP_H        = 40;
export const GAP_V        = 80;
export const DRAG_THRESHOLD = 4;
export const SNAP_RADIUS    = 60;   // screen-pixels

// ── Pan / Zoom ────────────────────────────────────────────────────────────────
export const cam = {
  panX: 0,
  panY: 0,
  zoom: 1,
};

// ── Drag state ────────────────────────────────────────────────────────────────
export const drag = {
  id:             null,   // string | null — id of node being dragged
  startMX:        0,
  startMY:        0,
  startPositions: new Map(),  // Map<id, {x, y}>
  active:         false,  // true once threshold exceeded
  didMove:        false,
};

// ── Pan state ─────────────────────────────────────────────────────────────────
export const pan = {
  active:   false,
  startMX:  0,
  startMY:  0,
  startPX:  0,
  startPY:  0,
  moved:    false,  // true if pointer moved enough to count as a pan
};

// ── Snap target ───────────────────────────────────────────────────────────────
export const snap = {
  targetId: null,   // string | null
};

// ── Panel resize ──────────────────────────────────────────────────────────────
export const panelResize = {
  active:   false,
  startX:   0,
  startW:   380,
};

// ── Connect (n8n-style edge drag) ─────────────────────────────────────────────
export const connect = {
  active:      false,
  fromId:      null,
  targetId:    null,
  previewPath: null,   // SVGPathElement | null
};

// ── Misc flags ────────────────────────────────────────────────────────────────
export const flags = {
  suppressNextCanvasClick: false,
  nodeWasMousedDown:       false,
};
