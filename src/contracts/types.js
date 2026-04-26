/**
 * contracts/types.js
 * 所有共用常數與列舉 — 單一真理源
 * FORBIDDEN: no DOM, no localStorage, no side effects
 */

// Node 狀態
export const STATUS_VALUES = ['green', 'yellow', 'red', 'gray'];
export const STATUS_LABELS = {
  green:  '高意願',
  yellow: '觀察中',
  red:    '冷淡',
  gray:   '無效',
  null:   '根節點',
};
export const STATUS_ORDER = ['green', 'yellow', 'red', 'gray'];

// Node 類型
export const NODE_TYPES = ['contact', 'note'];

// 便條顏色選盤
export const NOTE_COLORS = [
  { id: 'yellow', bg: '#1a1600', border: '#4a4200', text: '#e8d87e' },
  { id: 'blue',   bg: '#001526', border: '#003a6e', text: '#7eb8e8' },
  { id: 'green',  bg: '#001a06', border: '#00452a', text: '#7ee8a0' },
  { id: 'pink',   bg: '#1a000f', border: '#6e0030', text: '#e87eb8' },
  { id: 'purple', bg: '#0a001a', border: '#42006e', text: '#c07ee8' },
  { id: 'gray',   bg: '#111418', border: '#2c3038', text: '#b0bec5' },
];

// 業績計算
export const SALES_TAX = 0.02;
export const BATCH_ANCHORS = {
  asst_mgr_pkg: 0.10,
  manager_pkg:  0.15,
};
export const RANK_RATES = {
  associate:  0.08,
  senior:     0.10,
  supervisor: 0.12,
  director:   0.15,
  manager:    0.20,
};

// 學員相關
export const STUDENT_FIXED_TAGS = [
  { id: 'vip',       label: 'VIP' },
  { id: 'cold',      label: '冷淡' },
  { id: 'potential', label: '潛力' },
  { id: 'followup',  label: '跟進中' },
  { id: 'closed',    label: '已成交' },
];
export const CONTACT_METHODS  = ['電話', 'Line', '面談', '視訊'];
export const CONTACT_RESULTS  = ['未接聽', '接通無進展', '有興趣', '約定下次', '里程碑推進', '其他'];

// localStorage key map（單一真理源，STORE 直接 import）
export const STORE_KEYS = {
  nodes:               'crm-v3',
  events:              'crm-events',
  tasks:               'crm-tasks',
  chat:                'crm-chat',
  sales:               'crm-sales',
  dailyReports:        'crm-daily-reports',
  monthlyGoals:        'crm-monthly-goals',
  monthlySalesTargets: 'crm-monthly-sales-targets',
  theme:               'crm-theme',
  shortcuts:           'crm-shortcuts',
  docs:                'crm-docs',
  cmdMode:             'crm-cmd-mode',
  cmdWhite:            'crm-cmd-white',
  cmdBlack:            'crm-cmd-black',
  profileRank:         'crm-profile-rank',
  obsidianPath:        'crm-obsidian-path',
  aiProvider:          'crm-ai-provider',
  aiModel:             'crm-ai-model',
  apiKey:              'crm-apikey',
  aiEndpoint:          'crm-ai-endpoint',
  students:            'crm-students',
  drafts:              'crm-drafts',
  aiMemories:          'crm-ai-memories',
};
