# FDD CRM — 模組化架構 Spec

> 軍工級原則參考：`/Users/ryan/vibe-coding-template/README.md`
> 架構債分析參考：`/Users/ryan/meta-agent/docs/architecture-debt-analysis.md`
> 版本：v1.0 · 2026-04-13

---

## 核心哲學（對標軍工級模板）

| # | 原則 | 現況缺口 | 目標 |
|---|------|---------|------|
| 1 | No spec, no code | 無 spec，直接堆碼 | 此文件先行 |
| 2 | Runtime contracts for all external I/O | localStorage 讀寫無驗證 | 每個 model 有 contract |
| 3 | Fault isolation per section | 5062 行單檔，任一錯誤毀全頁 | Feature 模組獨立 boundary |
| 4 | Reducers over state sprawl | 全域 `let nodes/events/tasks/…` 散落 | 集中 state + reducer |
| 5 | AI output must be traceable | AI 呼叫直接在 crm.js 內 | 抽出 ai/ 模組，明確 in/out |
| 6 | Guard pipeline | 無型別驗證、無 schema 驗證 | contracts/ 層 runtime guard |
| 7 | Minimal, auditable, extensible | 所有東西互相耦合 | 明確 export，無隱式全域 |

---

## 現況診斷

```
crm.js    5,062 行  ← 主要問題：30 個邏輯區塊混在一起
crm.css   1,755 行  ← 可接受，暫不拆
index.html  604 行  ← UI markup，無邏輯
functions/api/      ← 已模組化，維持現狀
```

### 識別出的邏輯區塊（按 `/* ══ */` 區段）

| 行號 | 區塊 | 擬放模組 |
|------|------|---------|
| 1–11 | Utility (uid, toast) | `core/uid.js`, `core/toast.js` |
| 12–130 | Data Model + State + Undo | `core/state.js`, `core/undo.js`, `models/node.js` |
| 130–215 | CALC + STORE | `core/calc.js`, `core/store.js` |
| 216–340 | COMMANDS + DRAFT | `commands.js` |
| 341–422 | Demo data | `core/demo.js` |
| 423–622 | Canvas layout (subtreeW, layoutFrom, autoLayout, forceLayout) | `features/canvas/layout.js` |
| 483–623 | Canvas interaction (pan/zoom, drag) | `features/canvas/interact.js` |
| 624–685 | Edge rendering (drawEdges) | `features/canvas/edges.js` |
| 686–829 | Node render (_attachNodeDrag, renderNodes) | `features/canvas/render.js` |
| 830–1034 | Node CRUD (createNodeAt, addChild, cycleStatus, clipboard) | `features/canvas/crud.js` |
| 1035–1156 | Shortcuts (sk, DEFAULT_SHORTCUTS, skModal) | `features/settings/shortcuts.js` |
| 1157–1453 | Stats + Panel (openPanel, renderPanel, savePanel) | `features/panel/index.js` |
| 1454–1994 | AI Chat (personas, tool defs, sendChat) | `features/ai/chat.js`, `features/ai/personas.js` |
| 1995–2289 | Events / Calendar UI | `features/events/index.js` |
| 2289–2607 | Tasks UI | `features/tasks/index.js` |
| 2608–3022 | Sales tracking | `features/sales/index.js` |
| 3023–3529 | Daily report | `features/daily/index.js` |
| 3530–3695 | Docs management | `features/docs/index.js` |
| 3696–3713 | Obsidian path | `integrations/obsidian.js` |
| 3714–3824 | Settings page + export/import | `features/settings/index.js` |
| 3825–4006 | Google Calendar (GCAL, OAuth, sync) | `integrations/gcal.js` |
| 4007–4485 | Google Sheets (GSHEETS, sync) | `integrations/gsheets.js` |
| 4486–4604 | Themes + Obsidian Backup | `features/settings/themes.js`, `integrations/obsidian.js` |
| 4605–4674 | init() + navigation | `main.js` |
| 4675–5062 | Students management | `features/students/index.js` |

---

## 目標模組結構

```
tools/crm/
├── src/
│   ├── contracts/           ← 軍工核心：runtime schema 驗證
│   │   ├── node.js          # NodeSchema + validate()
│   │   ├── student.js       # StudentSchema + validate()
│   │   ├── event.js         # EventSchema + TaskSchema
│   │   └── types.js         # 共用常數 (STATUS, NODE_TYPES, etc.)
│   │
│   ├── core/                ← 無依賴，最底層
│   │   ├── uid.js           # uid()
│   │   ├── toast.js         # toast()
│   │   ├── store.js         # STORE (localStorage key map + save/load)
│   │   ├── state.js         # 全域狀態 + reducer (nodes/events/tasks/…)
│   │   ├── undo.js          # undoStack, pushUndo, undoLast
│   │   ├── calc.js          # CALC helpers (date, stats)
│   │   └── demo.js          # buildDemoData()
│   │
│   ├── models/              ← 資料工廠，依賴 contracts + core
│   │   ├── node.js          # STATUS_LABELS, newNode(), NOTE_COLORS
│   │   └── student.js       # newStudent(), newContact(), STUDENT_FIXED_TAGS
│   │
│   ├── features/            ← UI 功能模組，依賴 core + models
│   │   ├── canvas/
│   │   │   ├── layout.js    # subtreeW, layoutFrom, autoLayout, forceLayout
│   │   │   ├── edges.js     # drawEdges (SVG)
│   │   │   ├── render.js    # renderNodes, _attachNodeDrag
│   │   │   ├── interact.js  # pan/zoom state, initCanvas, drag, connect
│   │   │   ├── crud.js      # createNodeAt, addChild, cycleStatus, clipboard
│   │   │   └── select.js    # selectNode, deselect, selId
│   │   ├── panel/
│   │   │   └── index.js     # openPanel, closePanel, renderPanel, savePanel
│   │   ├── ai/
│   │   │   ├── chat.js      # chatHistory, sendChat, AI API call
│   │   │   └── personas.js  # PERSONAS def, tool definitions (Phase 2)
│   │   ├── events/
│   │   │   └── index.js     # renderEventsPage, event CRUD
│   │   ├── tasks/
│   │   │   └── index.js     # renderTasksPage, task CRUD
│   │   ├── daily/
│   │   │   └── index.js     # renderDailyPage, saveDailyReport, monthly stats
│   │   ├── docs/
│   │   │   └── index.js     # renderDocs, doc modal, file upload/drop
│   │   ├── students/
│   │   │   └── index.js     # renderStudentsPage, student CRUD, reminders
│   │   └── settings/
│   │       ├── index.js     # renderSettingsPage, export/import, clearAllData
│   │       ├── shortcuts.js # sk, DEFAULT_SHORTCUTS, skModal
│   │       └── themes.js    # THEMES, applyTheme, loadTheme
│   │
│   ├── integrations/        ← 外部系統，依賴 core，不依賴 features
│   │   ├── gcal.js          # GCAL object, OAuth, syncScheduleToCalendar
│   │   ├── gsheets.js       # GSHEETS object, sheetsReq, syncDailyToSheets
│   │   └── obsidian.js      # OB_BACKUP, openObsidianVault, saveObsidianPath
│   │
│   ├── commands.js          # COMMANDS array, CMD object, DRAFT
│   └── main.js              # init(), page navigation, loadData, entry point
│
├── functions/api/           ← 已模組化，維持現狀
│   ├── _mem-core.js
│   ├── ai.js
│   ├── login.js
│   ├── memories.js
│   └── memories/
│       ├── [id].js
│       └── retrieve.js
│
├── index.html               ← 改為 <script type="module" src="src/main.js">
├── crm.css                  ← 暫維持單檔（Phase 2 再拆）
├── sw.js                    ← Service Worker（維持）
├── manifest.json
└── wrangler.toml
```

---

## 依賴圖（單向，無循環）

```
contracts/  ←─────────────────────────────────────────────
core/       ← contracts/
models/     ← core/ + contracts/
integrations/ ← core/
features/   ← core/ + models/ + integrations/
commands.js ← core/
main.js     ← core/ + models/ + features/ + commands.js
```

**規則：下層不得 import 上層（嚴格單向）**

---

## Contracts 層設計（最高優先）

每個 contract 提供：
1. **Schema** — 欄位定義 + 型別
2. **validate(obj)** — runtime 驗證，回傳 `{ ok, errors[] }`
3. **defaults()** — 安全預設值

```js
// contracts/node.js 範例
export const NodeSchema = {
  id:           { type: 'string',  required: true },
  parentId:     { type: 'string',  nullable: true },
  nodeType:     { type: 'enum',    values: ['contact', 'note'] },
  status:       { type: 'enum',    values: ['green', 'yellow', 'red', 'gray', null] },
  name:         { type: 'string',  maxLen: 100 },
  x:            { type: 'number',  required: true },
  y:            { type: 'number',  required: true },
  createdAt:    { type: 'number',  required: true },
  updatedAt:    { type: 'number',  required: true },
  info:         { type: 'object',  required: true },
};

export function validateNode(obj) {
  const errors = [];
  // ... validate against NodeSchema
  return { ok: errors.length === 0, errors };
}
```

---

## State 層設計（Reducer 模式）

取代散落在全域的 `let nodes = []`, `let events = []`：

```js
// core/state.js
const _state = {
  nodes: [],
  events: [],
  tasks: [],
  chatHistory: [],
  studentsData: [],
};

export function getState() { return { ..._state }; }
export function getNodes() { return _state.nodes; }

export function dispatch(action) {
  switch (action.type) {
    case 'NODES_SET':    _state.nodes = action.payload; break;
    case 'NODE_ADD':     _state.nodes.push(action.payload); break;
    case 'NODE_UPDATE':  /* ... */ break;
    case 'NODE_DELETE':  /* ... */ break;
    // events, tasks, students...
  }
}
```

---

## 實作順序（分 Phase）

### Phase 1 — Contracts + Core（基礎，不破壞現有功能）
- [ ] 建立 `src/` 目錄
- [ ] `contracts/types.js` — 所有常數
- [ ] `contracts/node.js` — NodeSchema + validate
- [ ] `contracts/student.js` — StudentSchema + validate
- [ ] `core/uid.js`, `core/toast.js` — 零依賴 utils
- [ ] `core/store.js` — STORE object
- [ ] `core/state.js` — 全域狀態 + reducer
- [ ] `core/undo.js` — undo stack

### Phase 2 — Models + Features 拆分
- [ ] `models/node.js`, `models/student.js`
- [ ] `features/canvas/` — 5 個子模組
- [ ] `features/panel/`, `features/ai/`
- [ ] `features/daily/`, `features/docs/`, `features/students/`
- [ ] `features/settings/` — 3 個子模組

### Phase 3 — Integrations + 切換 entry point
- [ ] `integrations/gcal.js`, `integrations/gsheets.js`, `integrations/obsidian.js`
- [ ] `commands.js`
- [ ] `main.js` — 統一 init()
- [ ] `index.html` 改為 `<script type="module" src="src/main.js">`
- [ ] 刪除 `crm.js`（或保留 `.bak`）

### Phase 4 — Guards（選做）
- [ ] 每個 feature 模組的 export 入口加 contract 驗證
- [ ] `loadData()` 讀取後 validate，錯誤時 fallback to demo

---

## 技術決策

| 決策 | 選擇 | 原因 |
|------|------|------|
| 模組系統 | ES Modules (`type="module"`) | Cloudflare Pages 直接服務靜態檔，無需 bundler |
| Build step | 無（Phase 1-3）| 降低導入門檻；Phase 4 可加 esbuild |
| TypeScript | 否（現階段）| 已是 vanilla JS；加 JSDoc 為替代 |
| CSS 拆分 | Phase 2 後 | 優先完成 JS 模組化 |
| 全域變數 | 禁止（新碼）| 所有狀態走 state.js |
| `window.xxx` | 僅 HTML onclick 需要的保留，加 `/* @public */` 標注 | 逐步消除 |

---

## 驗收標準

每個 Phase 完成後：
1. `wrangler pages dev .` 正常啟動
2. 所有 8 個頁面可切換
3. 人脈樹 CRUD 正常
4. AI 對話正常
5. localStorage 資料不遺失

---

## 參考資源

- 軍工級模板：`/Users/ryan/vibe-coding-template/README.md`
- 架構債分析：`/Users/ryan/meta-agent/docs/architecture-debt-analysis.md`
- 零信任架構圖：`/Users/ryan/meta-agent/docs/zero-trust-plan-architecture.html`
- 零信任 TDD/BDD：`/Users/ryan/meta-agent/docs/zero-trust-full-closure-tdd-bdd.md`
