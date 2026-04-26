/**
 * models/student.js
 * Student + ContactEntry 資料工廠
 * 依賴：core/uid.js, contracts/student.js, contracts/types.js
 * FORBIDDEN: no DOM, no localStorage
 */

import { uid } from '../core/uid.js';
import { studentDefaults, contactDefaults } from '../contracts/student.js';
import {
  STUDENT_FIXED_TAGS,
  CONTACT_METHODS,
  CONTACT_RESULTS,
} from '../contracts/types.js';

export { STUDENT_FIXED_TAGS, CONTACT_METHODS, CONTACT_RESULTS };

/**
 * @returns {Student}
 */
export function newStudent() {
  return {
    id: uid(),
    name: '',
    joinDate: new Date().toISOString().slice(0, 10),
    createdAt: Date.now(),
    ...studentDefaults(),
  };
}

/**
 * @returns {ContactEntry}
 */
export function newContact() {
  return {
    id: uid(),
    date: new Date().toISOString().slice(0, 10),
    method: CONTACT_METHODS[0],
    result: CONTACT_RESULTS[1],
    createdAt: Date.now(),
    ...contactDefaults(),
  };
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** @param {string} s */
export function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const _RESULT_SLUG = {
  '未接聽': 'no-answer', '接通無進展': 'no-progress', '有興趣': 'interested',
  '約定下次': 'scheduled', '里程碑推進': 'milestone', '其他': 'other',
};

/** @param {string} s */
export function slugResult(s) {
  return _RESULT_SLUG[s] || 'other';
}

/** @param {Student} student - @returns {string|null} YYYY-MM-DD */
export function getNextFollowUp(student) {
  const today = new Date().toISOString().slice(0, 10);
  const dates = student.contacts
    .filter(c => c.nextDate && c.nextDate >= today)
    .map(c => c.nextDate)
    .sort();
  return dates[0] || null;
}

/** @param {Student} student - @returns {string|null} YYYY-MM-DD */
export function getLastContact(student) {
  if (!student.contacts.length) return null;
  return student.contacts.map(c => c.date).sort().slice(-1)[0];
}
