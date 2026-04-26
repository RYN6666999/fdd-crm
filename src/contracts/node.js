/**
 * contracts/node.js
 * Node 資料契約：Schema 定義 + runtime validate()
 * FORBIDDEN: no DOM, no localStorage, no side effects
 */

import { STATUS_VALUES, NODE_TYPES } from './types.js';

// ── Schema ─────────────────────────────────────────────────────────────────

export const NodeInfoSchema = {
  age: 'string', zodiac: 'string', hometown: 'string',
  personality: 'string', interests: 'string',
  howMet: 'string', background: 'string',
  currentJob: 'string', jobDuration: 'string',
  prevJob: 'string', prevJobLevel: 'string',
  income: 'string', salaryTransfer: 'string',
  hasProperty: 'string', familyProperty: 'string',
  hasInvestment: 'string', hasInsurance: 'string',
  creditCard: 'string', debt: 'string',
  invitationMethod: 'string', knowsVenueFee: 'string', knowsTuition: 'string',
  keyQuestions: 'string', needs: 'array', canDecide: 'string', payOnSite: 'string',
  eventDate: 'string', eventName: 'string',
  referrer: 'string', recommender: 'string', formNotes: 'string',
  company: 'string', phone: 'string', email: 'string', lastContact: 'string',
  source: 'string', priority: 'string', tags: 'array', notes: 'string',
  role: 'string', regions: 'array',
};

export const NodeSchema = {
  id:            { type: 'string',  required: true },
  parentId:      { type: 'string',  nullable: true },
  nodeType:      { type: 'enum',    values: NODE_TYPES, required: true },
  status:        { type: 'enum',    values: [...STATUS_VALUES, null], nullable: true },
  name:          { type: 'string',  required: true, maxLen: 200 },
  x:             { type: 'number',  required: true },
  y:             { type: 'number',  required: true },
  collapsed:     { type: 'boolean' },
  createdAt:     { type: 'number',  required: true },
  updatedAt:     { type: 'number',  required: true },
  lastContactAt: { type: 'number',  nullable: true },
  info:          { type: 'object',  required: true },
  // note-only optional fields
  noteColor:     { type: 'string',  optional: true },
  noteFontSize:  { type: 'number',  optional: true },
  noteContent:   { type: 'string',  optional: true },
};

// ── validate() ──────────────────────────────────────────────────────────────

/**
 * @param {unknown} obj
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateNode(obj) {
  const errors = [];

  if (!obj || typeof obj !== 'object') {
    return { ok: false, errors: ['Node must be an object'] };
  }

  for (const [field, rule] of Object.entries(NodeSchema)) {
    const val = obj[field];
    const missing = val === undefined || val === null;

    if (rule.required && missing) {
      errors.push(`"${field}" is required`);
      continue;
    }
    if (missing && rule.nullable) continue;
    if (missing && rule.optional) continue;
    if (missing) continue;

    if (rule.type === 'enum') {
      if (!rule.values.includes(val)) {
        errors.push(`"${field}" must be one of [${rule.values.join(', ')}], got "${val}"`);
      }
    } else if (rule.type === 'number') {
      if (typeof val !== 'number' || isNaN(val)) {
        errors.push(`"${field}" must be a number`);
      }
    } else if (rule.type === 'string') {
      if (typeof val !== 'string') {
        errors.push(`"${field}" must be a string`);
      } else if (rule.maxLen && val.length > rule.maxLen) {
        errors.push(`"${field}" exceeds maxLen ${rule.maxLen}`);
      }
    } else if (rule.type === 'boolean') {
      if (typeof val !== 'boolean') {
        errors.push(`"${field}" must be a boolean`);
      }
    } else if (rule.type === 'object') {
      if (typeof val !== 'object' || Array.isArray(val)) {
        errors.push(`"${field}" must be an object`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// ── defaults() ──────────────────────────────────────────────────────────────

/** 安全預設值 — 用於 loadData() fallback 與 newNode() */
export function nodeDefaults() {
  return {
    parentId: null,
    nodeType: 'contact',
    status: 'yellow',
    collapsed: false,
    lastContactAt: null,
    info: {
      age: '', zodiac: '', hometown: '', personality: '', interests: '',
      howMet: '', background: '',
      currentJob: '', jobDuration: '', prevJob: '', prevJobLevel: '',
      income: '', salaryTransfer: '', hasProperty: '', familyProperty: '',
      hasInvestment: '', hasInsurance: '', creditCard: '', debt: '',
      invitationMethod: '', knowsVenueFee: '', knowsTuition: '',
      keyQuestions: '', needs: [], canDecide: '', payOnSite: '',
      eventDate: '', eventName: '', referrer: '', recommender: '',
      formNotes: '',
      company: '', phone: '', email: '', lastContact: '',
      source: '', priority: '', tags: [], notes: '',
      role: '', regions: [],
    },
  };
}
