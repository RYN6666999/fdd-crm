# 房多多經營系統 · FDD CRM

> 台灣房仲業務員的全能作戰室 — 人脈樹、日報 KPI、AI 助理、業績追蹤，一個頁面搞定。

---

## 產品定位

為 **Ryan（台灣房仲業務員）** 量身打造的 CRM 工具。目標是讓每日作業在 2 分鐘內完成：

- 日報表填寫 < 60 秒
- 所有聯絡人一眼看清、不遺漏
- 月度業績進度隨時可見
- AI 助理嵌入流程中，非附加功能

---

## 功能頁面

| 頁面 | 說明 |
|------|------|
| 🌳 人脈樹（Canvas） | 視覺化人脈關係圖、節點 CRUD、拖拉排版、狀態循環 |
| 📋 面板（Panel） | 聯絡人詳細資料、互動紀錄、AI 建議 |
| 🤖 AI 對話 | 多 persona AI 助理，支援 Claude / Gemini / OpenRouter |
| 📅 行事曆 | 活動管理、Google Calendar 雙向同步 |
| 📊 業績追蹤 | 成交紀錄、新件/轉介/獎金分類，月度報表 |
| 📝 日報表 | 每日 KPI 填報、雲端同步 Google Sheets |
| 📁 文件管理 | 筆記與文件上傳、分類檢索 |
| 👥 學員管理 | 轉化客戶追蹤、里程碑、聯絡紀錄 |
| ⚙️ 設定 | 主題、Google 整合、AI 設定、快捷鍵、資料匯出入 |

---

## 技術架構

### 前端
```
Vanilla JavaScript（ES Modules）· HTML5 · CSS3
無打包工具（直接由 Cloudflare Pages 服務靜態檔）
PWA：Service Worker 自動更新、離線可用
```

### 後端（Cloudflare Pages Functions）
```
functions/api/
├── ai.js / chat.js / claude.js   AI 代理（Claude、Gemini、OpenRouter）
├── brain.js / mcp.js             AI 工具呼叫
├── login.js                      登入紀錄
├── memories.js / _mem-core.js    記憶庫（長期記憶 CRUD）
├── store.js                      KV 資料存取
└── vision.js                     圖片辨識
```

### 資料持久化
| 層級 | 技術 | 說明 |
|------|------|------|
| 本地 | `localStorage` | 主要資料來源，含 5 版快照防遺失 |
| 雲端同步 | Cloudflare KV | 跨裝置同步，啟動時比較時間戳合併 |
| KV Namespaces | `CRM_DATA` / `CRM_MEMORIES` / `FDD_LOGINS` | 業務資料 / AI 記憶 / 登入紀錄 |

### 前端模組結構
```
src/
├── contracts/        runtime schema 驗證（NodeSchema、StudentSchema）
├── core/             無依賴底層（state、store、undo、calc、toast、uid）
├── models/           資料工廠（newNode、newStudent）
├── features/         UI 功能模組
│   ├── canvas/       人脈樹（layout、render、edges、interact、crud）
│   ├── panel/        節點詳細面板
│   ├── ai/           AI 對話、記憶、persona
│   ├── events/       行事曆
│   ├── daily/        日報表
│   ├── sales/        業績追蹤
│   ├── docs/         文件管理
│   ├── students/     學員管理
│   └── settings/     設定、主題、快捷鍵
├── integrations/     Google Calendar / Sheets / Obsidian
└── main.js           入口、頁面導航、初始化
```

**依賴規則（嚴格單向）**：`contracts ← core ← models ← features ← main`，下層不得 import 上層。

---

## 主題系統

設定頁「🎨 背景主題」可一鍵切換，偏好存入 localStorage：

| 主題 ID | 名稱 | 風格 |
|---------|------|------|
| `dark` | 深色 | 預設深色（主力主題） |
| `dark-blue` | 深藍 | 深海藍調 |
| `light` | 淺色 | 標準亮色 |
| `light-warm` | 暖色 | 暖米白 |
| `sage-gold` | 清新金綠 | 清新自然感 |
| `impact` | Impact | 高對比紅 accent |
| `neuo` | 浮凸 2.5D | Neumorphism 立體感 |
| `nature` | 🌿 奶油有機 | 山湖底圖 + 薄荷/霧藍/蜜桃漸層色塊，大圓角 |
| `nature-glass` | 🏔 霧面玻璃 | 山湖底圖重度模糊 + 毛玻璃 surface |

---

## PWA 安裝

1. 用 Chrome / Safari 開啟部署網址
2. 「加入主畫面」/ 「安裝應用程式」
3. 往後每次切回前景自動偵測新版本並更新（無需手動刷新）

---

## 本地開發

```bash
# 安裝依賴
npm install

# 啟動靜態伺服器（port 5000）
npx serve . -l 5000

# 驗證模組 import/export 完整性
npm run verify

# Cloudflare Pages 本地開發（含 KV / Functions）
npx wrangler pages dev .
```

---

## 部署（Cloudflare Pages）

```bash
# 部署前自動執行 check-imports.mjs 驗證
npm run deploy
```

需在 Cloudflare Dashboard 建立以下 KV Namespaces 並填入 `wrangler.toml`：

| Binding | 用途 |
|---------|------|
| `CRM_DATA` | 節點、業績、日報等業務資料 |
| `CRM_MEMORIES` | AI 長期記憶庫 |
| `FDD_LOGINS` | 使用者登入稽核紀錄 |

---

## AI 設定

在「設定 → 🤖 AI 模型設定」選擇供應商並填入 API Key：

| 供應商 | 說明 |
|--------|------|
| Claude（Anthropic） | 主力，最推薦 |
| Gemini（Google） | 備用 |
| OpenRouter | 多模型中繼，可用免費額度測試 |

API Key 存於 `localStorage`，**不會上傳至任何伺服器**，僅由 `/api/ai` Cloudflare Function 代理轉發。

---

## Google 整合

| 功能 | 設定位置 | 說明 |
|------|----------|------|
| Google Calendar | 設定 → 📅 Google 日曆 | OAuth 授權，活動雙向同步 |
| Google Sheets | 設定 → 📊 Google 試算表 | 填入試算表 ID，日報一鍵同步 |

---

## 資料安全

- 所有 API Key 一律存 `localStorage`，不進版控
- Cloudflare KV 同步走 server-side Function，Key 不暴露前端
- HTTP Headers 已設定：`X-Content-Type-Options`、`X-Frame-Options: DENY`、`CSP`、`HSTS`
- 資料匯出：設定頁可匯出完整 JSON 備份（節點、業績、日報、學員、AI 對話）

---

## 設計原則

1. **日報表是首頁** — 每日第一件事是填報，不是翻人脈樹
2. **一步一動作** — 每個操作至多一次點擊
3. **摘要在上、細節在下** — Header 顯示今日 KPI，細節點進去看
4. **AI 是副駕，不是功能** — 嵌入資料流程中，非獨立分頁
5. **手機優先** — 每頁可在手機螢幕使用，無需橫向捲動

---

## 授權

Private — 個人使用，未開放授權。
