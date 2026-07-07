# 房多多經營系統 · FDD CRM

> Ryan 蘇泓任的個人業務作戰室 — 人脈樹、日報 KPI、AI 助理、業績追蹤，一個工具搞定。

---

## 產品定位

**房多多** 是站在買方立場的全方位房地產教育平台，提供財商學習、買房顧問、團購服務。
Ryan 是房多多的**置產規劃教練/業務**，工作核心是招募並陪伴學員完成從陌生到成交的完整旅程。

> 他不是房仲，不代理物件買賣。他的「成交」是學員加入房多多的學員/會員方案。

這個 CRM 的目的：讓 Ryan 每天的業務作業在 2 分鐘內完成：

- 日報填寫 < 60 秒
- 所有聯絡人追蹤不遺漏
- 月度業績進度一眼可見
- AI 助理嵌入工作流，而非附加功能

---

## Ryan 的業務流程

```
接觸陌生人 → 定層 → 定錨 → 鬆動信念 → 框架重組 → 異議應對 → 後撤成交
```

**每日三個核心 KPI：**

| KPI | 說明 |
|-----|------|
| 暖線 | 與潛在學員的暖身電話/訊息互動 |
| 見面 | 當面說明、咖啡聊天、簡報 |
| 認識 | 新開發、接觸陌生人 |

**成交類型（業績追蹤）：**

| 類型 | 說明 |
|------|------|
| 新件 | 新學員/會員成交（58K 學員 / 158K 會員） |
| 轉介 | 現有學員轉介帶進的新案 |
| 獎金 | 其他獎勵獎金紀錄 |

---

## 功能頁面

| 頁面 | 說明 |
|------|------|
| 🌳 人脈樹（Canvas） | 視覺化人脈關係圖、節點 CRUD、拖拉排版、狀態循環 |
| 📋 面板（Panel） | 聯絡人詳細資料、互動紀錄、AI 建議 |
| 🤖 AI 對話 | 多 persona 助理，支援 Claude / Gemini / OpenRouter |
| 📅 行事曆 | 活動管理、Google Calendar 雙向同步 |
| 📊 業績追蹤 | 成交紀錄（新件/轉介/獎金），月度報表 |
| 📝 日報表 | 每日 KPI 填報（暖線/見面/認識），雲端同步 Google Sheets |
| 📁 文件管理 | 筆記、簡報素材、話術文件上傳與檢索 |
| 👥 學員管理 | 已成交學員追蹤、里程碑、後續聯絡紀錄 |
| ⚙️ 設定 | 主題、Google 整合、AI 設定、快捷鍵、資料匯出入 |

---

## 技術架構

### 前端

```
Vanilla JavaScript（ES Modules）· HTML5 · CSS3
無打包工具（Cloudflare Pages 直接服務靜態檔）
PWA：純 manifest（無 Service Worker），加主畫面/全螢幕照舊
新鮮度：_headers 對 HTML/JS/CSS 設 no-cache → 部署即生效，不需 bump 版本
```

### 後端（Cloudflare Pages Functions）

```
functions/api/
├── ai.js / chat.js / claude.js   AI 代理（Claude、Gemini、OpenRouter）
├── brain.js / mcp.js             AI 工具呼叫
├── login.js                      登入稽核
├── memories.js / _mem-core.js    AI 長期記憶 CRUD
├── store.js                      KV 資料存取
└── vision.js                     圖片辨識
```

### 資料持久化

| 層級 | 技術 | 說明 |
|------|------|------|
| 本地 | `localStorage` | 主要資料來源，含 5 版快照防遺失 |
| 雲端 | Cloudflare KV | 跨裝置同步，啟動時比較時間戳自動合併 |

| KV Namespace | 用途 |
|---|---|
| `CRM_DATA` | 節點、業績、日報、學員等業務資料 |
| `CRM_MEMORIES` | AI 長期記憶庫 |
| `FDD_LOGINS` | 登入稽核紀錄 |

### 前端模組結構

```
src/
├── contracts/        runtime schema 驗證（NodeSchema、StudentSchema）
├── core/             無依賴底層（state、store、undo、calc、toast、uid）
├── models/           資料工廠（newNode、newStudent）
├── features/
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

**依賴規則（嚴格單向）**：`contracts ← core ← models ← features ← main`

---

## 主題系統

設定頁「🎨 背景主題」一鍵切換，偏好存入 localStorage：

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
3. 切回前景自動偵測新版本並更新，無需手動刷新

---

## 本地開發

```bash
# 啟動靜態伺服器（port 5000）
npx serve . -l 5000

# Cloudflare Pages 本地開發（含 KV / Functions）
npx wrangler pages dev .
```

---

## 部署（Cloudflare Pages）

```bash
npm run deploy
```

需在 Cloudflare Dashboard 建立三個 KV Namespaces，填入 `wrangler.toml`。

---

## AI 設定

設定 → 🤖 AI 模型設定，選擇供應商並填入 API Key：

| 供應商 | 說明 |
|--------|------|
| Claude（Anthropic） | 主力，最推薦 |
| Gemini（Google） | 備用 |
| OpenRouter | 多模型中繼，可用免費額度測試 |

API Key 存於 `localStorage`，不進版控，僅由 Cloudflare Function 代理轉發。

---

## Google 整合

| 功能 | 說明 |
|------|------|
| Google Calendar | OAuth 授權，行程雙向同步 |
| Google Sheets | 填入試算表 ID，日報一鍵同步 |

---

## 資料安全

- API Key 一律存 `localStorage`，不進版控
- Cloudflare KV 走 server-side Function，Key 不暴露前端
- HTTP Headers：`X-Content-Type-Options`、`X-Frame-Options: DENY`、`CSP`、`HSTS`
- 設定頁可匯出完整 JSON 備份

---

## 授權

Private — 個人使用，未開放授權。
