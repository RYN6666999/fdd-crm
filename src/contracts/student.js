/**
 * contracts/student.js
 * Student + ContactEntry 資料契約
 * FORBIDDEN: no DOM, no localStorage, no side effects
 */

import { CONTACT_METHODS, CONTACT_RESULTS } from './types.js';

// ── Schema ─────────────────────────────────────────────────────────────────

export const ContactEntrySchema = {
  id:        { type: 'string',  required: true },
  date:      { type: 'string',  required: true },  // YYYY-MM-DD
  method:    { type: 'enum',    values: CONTACT_METHODS, required: true },
  result:    { type: 'enum',    values: CONTACT_RESULTS, required: true },
  mood:      { type: 'number'  },   // 1–5
  content:   { type: 'string'  },
  nextDate:  { type: 'string'  },   // YYYY-MM-DD or ''
  reminder:  { type: 'boolean' },
  createdAt: { type: 'number',  required: true },
};

export const StudentSchema = {
  id:           { type: 'string',  required: true },
  name:         { type: 'string',  required: true },
  phone:        { type: 'string'  },
  source:       { type: 'string'  },
  sourceNodeId: { type: 'string',  nullable: true },
  joinDate:     { type: 'string',  required: true },   // YYYY-MM-DD
  tags:         { type: 'array',   required: true },   // string[] from STUDENT_FIXED_TAGS ids
  customTags:   { type: 'array',   required: true },   // string[]
  suite:        { type: 'object',  required: true },
  milestones:   { type: 'object',  required: true },
  goals:        { type: 'string'  },
  notes:        { type: 'string'  },
  contacts:     { type: 'array',   required: true },   // ContactEntry[]
  createdAt:    { type: 'number',  required: true },
};

// ── validate() ──────────────────────────────────────────────────────────────

function _typeCheck(val, rule, field, errors) {
  if (rule.type === 'enum') {
    if (!rule.values.includes(val)) {
      errors.push(`"${field}" must be one of [${rule.values.join(', ')}], got "${val}"`);
    }
  } else if (rule.type === 'number') {
    if (typeof val !== 'number' || isNaN(val)) errors.push(`"${field}" must be a number`);
  } else if (rule.type === 'string') {
    if (typeof val !== 'string') errors.push(`"${field}" must be a string`);
  } else if (rule.type === 'boolean') {
    if (typeof val !== 'boolean') errors.push(`"${field}" must be a boolean`);
  } else if (rule.type === 'array') {
    if (!Array.isArray(val)) errors.push(`"${field}" must be an array`);
  } else if (rule.type === 'object') {
    if (typeof val !== 'object' || Array.isArray(val) || val === null) {
      errors.push(`"${field}" must be a plain object`);
    }
  }
}

/**
 * @param {unknown} obj
 * @param {object} schema
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateAgainstSchema(obj, schema) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['Must be an object'] };

  for (const [field, rule] of Object.entries(schema)) {
    const val = obj[field];
    const missing = val === undefined || val === null;
    if (rule.required && missing) { errors.push(`"${field}" is required`); continue; }
    if (missing && rule.nullable) continue;
    if (missing) continue;
    _typeCheck(val, rule, field, errors);
  }
  return { ok: errors.length === 0, errors };
}

export function validateStudent(obj) {
  return validateAgainstSchema(obj, StudentSchema);
}

export function validateContactEntry(obj) {
  return validateAgainstSchema(obj, ContactEntrySchema);
}

// ── defaults() ──────────────────────────────────────────────────────────────

export function studentDefaults() {
  return {
    phone: '', source: '', sourceNodeId: null,
    tags: [], customTags: [],
    suite: {
      financialPlan: false, onlineCourse: false,
      offlineCourse: false, handbook: false, coachGroup: false,
    },
    milestones: {
      formFilled: false, paymentDone: false,
      finDataReady: false, internalTraining: false,
    },
    goals: '', notes: '', contacts: [],
  };
}

export function contactDefaults() {
  return {
    mood: 3, content: '', nextDate: '', reminder: false,
  };
}
