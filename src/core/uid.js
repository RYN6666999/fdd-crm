/**
 * core/uid.js
 * 無依賴的 ID 生成工具
 * FORBIDDEN: no DOM, no localStorage, no imports
 */

/** @returns {string} */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
