/**
 * core/toast.js
 * 輕量 toast 通知 — 唯一允許存取 DOM 的 core 模組
 * 依賴：index.html 中存在 id="toast" 元素
 */

/**
 * @param {string} msg
 * @param {number} dur  milliseconds
 */
export function toast(msg, dur = 2200) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), dur);
}
