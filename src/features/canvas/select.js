/**
 * canvas/select.js
 * 節點選取狀態
 * FORBIDDEN: no localStorage, no state.js writes
 */

let _selId = null;

/** @returns {string|null} */
export const getSelId = () => _selId;

/**
 * 選取節點（更新 DOM class）
 * @param {string} id
 */
export function selectNode(id) {
  if (_selId === id) return;
  _selId = id;
  document.querySelectorAll('.node-wrap').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id);
  });
}

/** 取消選取 */
export function deselect() {
  _selId = null;
  document.querySelectorAll('.node-wrap.selected').forEach(el => el.classList.remove('selected'));
}
