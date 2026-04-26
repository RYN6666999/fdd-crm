/**
 * features/ai/personas.js
 * Persona 定義 + Memory Service + System Prompt 建立
 * 依賴：core/state.js, core/store.js, features/ai/providers.js
 *
 * rolePrompt / quickPrompts 外移到 personas.json，懶載入
 */

import { getNodes, getEvents, getSalesData, getDailyReports, getMonthlySalesTargets, getDocsData } from '../../core/state.js';
import { STORE } from '../../core/store.js';
import { CALC } from '../../core/calc.js';

// ── Persona config（懶載入）────────────────────────────────────────────────

const PERSONA_SKELETON = {
  assistant:   { label: '通用助理' },
  analyst:     { label: '業績分析師' },
  secretary:   { label: '日報小秘書' },
  scriptforge: { label: '沙盤推演' },
};

let _personaData = null;

async function loadPersonaData() {
  if (_personaData) return _personaData;
  try {
    const res = await fetch('./src/features/ai/personas.json');
    _personaData = await res.json();
  } catch (e) {
    console.warn('[personas] 載入 personas.json 失敗，使用 fallback', e);
    _personaData = Object.fromEntries(
      Object.entries(PERSONA_SKELETON).map(([k, v]) => [k, { ...v, rolePrompt: `你是${v.label}。`, quickPrompts: [] }])
    );
  }
  return _personaData;
}

export const PERSONA_CONFIG = PERSONA_SKELETON;

// ── Persona state ─────────────────────────────────────────────────────────────

let _currentPersona = 'assistant';
let _quickPrompts   = [];

export const getCurrentPersona = () => _currentPersona;

export function setPersona(key, el) {
  _currentPersona = key;
  document.querySelectorAll('.persona-pill').forEach(p => p.classList.remove('active'));
  if (el) el.classList.add('active');
  renderQuickPrompts(key);
}

export async function renderQuickPrompts(key) {
  const bar = document.getElementById('ai-quick-prompts');
  if (!bar) return;
  const data = await loadPersonaData();
  _quickPrompts = (data[key] || data.assistant || {}).quickPrompts || [];
  bar.innerHTML = _quickPrompts.map((p, i) =>
    `<button class="quick-prompt-chip" onclick="window.__crmInjectPrompt?.(${i})">${p}</button>`
  ).join('');
}

export function injectPrompt(idx) {
  const text = typeof idx === 'number' ? (_quickPrompts[idx] || '') : idx;
  const inp = document.getElementById('chat-input');
  if (!inp) return;
  inp.value = text; inp.focus();
  inp.style.height = 'auto';
  inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
}

// ── Memory Service ─────────────────────────────────────────────────────────────

export const memoryService = {
  getMemories() {
    try { return JSON.parse(localStorage.getItem('crm-ai-memories')) || []; }
    catch { return []; }
  },
  saveMemories(mems) {
    localStorage.setItem('crm-ai-memories', JSON.stringify(mems));
    import('../../core/cloud-sync.js').then(m => m.cloudPush('memories', mems)).catch(()=>{});
  },

  async list(opts = {}) {
    let mems = this.getMemories();
    if (opts.subject) mems = mems.filter(m => m.subject.includes(opts.subject));
    if (opts.type)    mems = mems.filter(m => m.type === opts.type);
    if (opts.pinned != null) mems = mems.filter(m => !!m.pinned === !!opts.pinned);
    if (!opts.includeArchived) mems = mems.filter(m => !m.archived);
    return mems;
  },

  async create(mem) {
    const mems = this.getMemories();
    const newMem = { id: Date.now().toString(), createdAt: new Date().toISOString(), ...mem };
    mems.push(newMem);
    this.saveMemories(mems);
    return newMem;
  },

  async update(id, patch) {
    const mems = this.getMemories();
    const idx = mems.findIndex(m => m.id === id);
    if (idx === -1) return null;
    mems[idx] = { ...mems[idx], ...patch, updatedAt: new Date().toISOString() };
    this.saveMemories(mems);
    return mems[idx];
  },

  async delete(id) {
    const mems = this.getMemories();
    const initLen = mems.length;
    const filtered = mems.filter(m => m.id !== id);
    if (filtered.length !== initLen) {
      this.saveMemories(filtered);
      return true;
    }
    return false;
  },

  async retrieve(message, context = {}) {
    // Run KV memories + GBrain knowledge search in parallel
    // Brain fetch has 250ms timeout to avoid blocking on cold start
    const brainTimeout = new Promise(r => setTimeout(() => r({ results: [] }), 250));
    const brainFetch   = fetch('/api/brain', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'search', query: message, limit: 3 }),
    }).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }));

    const mems = this.getMemories().filter(m => !m.archived).slice(-5);
    let promptSnippet = mems.length ? '【相關記憶】\n' + mems.map(m => `- ${m.subject} (${m.type}): ${m.content}`).join('\n') : '';

    const brainResults = await Promise.race([brainFetch, brainTimeout]);

    // Merge: KV snippet first, then brain excerpts (200 chars each)
    const brainHits = (brainResults.results || []).filter(r => r.score > 0.01);
    if (brainHits.length) {
      const brainBlock = brainHits.map(r => `【知識庫：${r.title}】\n${(r.excerpt || '').slice(0, 200)}`).join('\n\n');
      promptSnippet = promptSnippet
        ? `${promptSnippet}\n\n【相關知識庫段落】\n${brainBlock}`
        : `【相關知識庫段落】\n${brainBlock}`;
    }

    return { memories: mems, promptSnippet };
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildFinanceSummary(info) {
  if (!info) return '未填';
  const parts = [];
  if (info.income)      parts.push(`月收${info.income}`);
  if (info.hasProperty) parts.push('有房');
  if (info.hasInvestment) parts.push('有投資');
  if (info.debt)        parts.push(`負債${info.debt}`);
  return parts.length ? parts.join(',') : '未填';
}

const STATUS_EMOJI = { green: '🟢高意願', yellow: '🟡觀察中', red: '🔴冷淡' };

// ── 房多多共用知識庫 ──────────────────────────────────────────────────────────

const FDD_KB = `
【房多多品牌知識庫】
▌公司定位
站在買方立場的全方位買房顧問，以財商教育為核心，透過房屋團購讓小資族買到低於市價的房子。
核心觀念：「借比存快」「殺比賺快」（善用槓桿與議價比慢慢儲蓄更有效）。
使命：讓人便捷獲取房地產知識，用科技讓複雜房地產更簡單。

▌三大商品
①課程（房地產財商課程）
  入口：免費體驗講座/線上說明會 → 成交：報名完整課程 → 升級：→顧問案
  價值：從「不懂房產」→「能自己判斷好壞」→ 渴望：不再為錢焦慮，拿回人生主導權
  坦誠缺陷：上課不等於會賺錢，需實際執行；不適合想明天就致富的人

②顧問規劃案（一對一投資顧問）
  入口：免費30分鐘財務健檢 → 成交：簽約顧問案 → 升級：→經銷商
  價值：量身設計投資路徑，減少試錯 → 渴望：有信得過的人陪做重大財務決策
  坦誠缺陷：不是代操，最終決策還是自己；需配合提供真實財務資訊

③經銷商（合作夥伴招募）
  入口：經銷商說明會/一對一咖啡聊 → 成交：簽約成為夥伴
  價值：從時間換錢轉為系統換錢 → 渴望：有事業、有影響力、能幫助別人
  坦誠缺陷：需投入時間經營，不是加入就自動賺錢
  注意：「直銷/詐騙」疑慮必須提前處理，不可防禦性回應

▌房貸速查（利率2.16%，30年，貸款八成）
400萬→月付9,709/最低月薪16,181　900萬→月付27,192/最低月薪45,320
1,000萬→月付30,214/最低月薪50,357　1,600萬→月付48,342/最低月薪80,570
2,000萬→月付60,427/最低月薪100,711　2,400萬→月付72,512/最低月薪120,853
新北團購：月薪≥7萬　南科：頭期180萬+月薪4-6.5萬
投資邏輯：買低於銀行估價八折→兩年賣出→滾複利
自住邏輯：買市價含稅額減免→六年漲價換房

▌財商生命週期（年齡說服邏輯）
20-40歲→槓桿/創業期，現在最適合行動（團購）
40-60歲→借錢期，八大服務理財
60-80歲→節稅/退休/繼承

▌電話開場標準話術
目標：約到下次見面時間（不是立刻推銷）
開場：「我剛調來這邊支援，新店準備開幕，特別設計了一份問卷，想請您撥15-20分鐘做個電訪。」
對方沒空：「後面哪一天有空檔？平日還是假日？幾點可以？」→ 要到確定時間
對方要電子檔：「我們都是做線上的，電話問卷，你提供的資訊非常重要。」

▌挖癥結三層問法
①「如果沒有錢的壓力，你會想學嗎？為什麼？」
②「如果要讓它變現，你願意付出什麼代價？」
③「你現在最想解決的財務問題是什麼？」

▌常見異議快速應對
「沒時間」→「大概15分鐘，這週哪個時間方便你？」→ 鎖時間，不接受模糊
「是詐騙吧」→「哪個詐騙集團會花這麼多時間幫負債的人翻身？正財曲線長期才恐怖。」
「現在買不起」→「不管市場好壞，先賺到判斷的知識比等待更值錢。重點是培養條件。」
「頭期不夠」→「不是等存到頭期才說，是先培養財商和貸款條件。」
「要考慮」→「你主要在考慮哪部分？時間？費用？還是還不夠了解我們？」→ 挖出具體點再處理
「太貴」→「攤到十年投資決策裡，每個決策多一個專業把關。一次失誤的損失可能是這費用的十倍，你覺得哪個比較貴？」
「自己看YouTube就好」→「資訊不是問題，行動才是。課程最大差別是有人盯你做、幫你覆盤、push你跨出第一步。」
「配偶反對」→「你覺得他/她主要擔心什麼？」→ 幫他預判反駁，提供彈藥讓他自己說服對方
「虧過錢」→ 先接住情緒，再重新詮釋：「那次問題是當時沒有判斷工具，不是你不行。」
「不適合做銷售」→「你當初是怎麼找來的？那個人在做銷售嗎？」

▌成交信號
✅ 開始問細節（頭期多少/月供多少/哪個地段）
✅ 主動帶家人/伴侶來了解
✅ 問「我的條件夠嗎？」

▌轉介紹話術
「你身邊有沒有也想了解房地產的朋友？我可以先幫他做個免費財務健診。」

▌人才篩選三關鍵（招募經銷商時）
①認同：「你覺得學習財商對你有幫助嗎？」
②需求：「你現在最想解決的財務問題是什麼？」
③配合度：「如果有機會，你願意付出什麼代價？」
連接人節點：能介紹3人以上、有廣泛人脈者優先深耕

▌絕對禁止
・不用威脅詞：穩賺/不會虧/一定漲/保證獲利
・不把業績壓力說給客戶聽
・對「直銷/詐騙」疑慮：不防禦，先承認市場確有不靠譜的，再建立信任
・前5分鐘只建立安全感，不推產品
`;

// ── System prompt ─────────────────────────────────────────────────────────────

export async function buildSystemPrompt(personaKey, memSnippet = '', currentContact = null) {
  const data    = await loadPersonaData();
  const persona = data[personaKey || 'assistant'] || data.assistant;
  const login      = JSON.parse(localStorage.getItem('crm-login') || '{}');
  const myRank     = STORE.getMyRank();
  const myRate     = STORE.getMyRate();
  const now        = new Date();
  const today      = now.toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);
  const daysLeft   = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();

  const nodes        = getNodes();
  const contactNodes = nodes.filter(n => n.parentId !== null);
  const green        = contactNodes.filter(n => n.status === 'green');
  const yellow       = contactNodes.filter(n => n.status === 'yellow');
  const red          = contactNodes.filter(n => n.status === 'red');
  const stale        = contactNodes.filter(n => {
    if (!n.info?.lastContact) return false;
    return Math.floor((new Date(today) - new Date(n.info.lastContact)) / 86400000) > 7
      && (n.status === 'green' || n.status === 'yellow');
  }).map(n => `${n.name}（${Math.floor((new Date(today) - new Date(n.info.lastContact)) / 86400000)}天）`);

  const salesData          = getSalesData();
  const dailyReports       = getDailyReports();
  const monthlySalesTargets = getMonthlySalesTargets();
  const docsData           = getDocsData();
  const events             = getEvents();

  const summary     = CALC.monthSummary(salesData, myRate, monthPrefix);
  const salesTarget = monthlySalesTargets[monthPrefix] || 300000;
  const salesPct    = salesTarget > 0 ? Math.round(summary.income / salesTarget * 100) : 0;
  const todayRpt    = dailyReports[today] || {};
  const upcoming    = events.filter(ev => ev.date >= today).slice(0, 5).map(ev => `${ev.date} ${ev.title || ev.name || ''}`);
  const rankLabels  = { director: '主任', asst_mgr: '襄理', manager: '經理', shop_partner: '店股東', shop_head: '店長' };

  const top20 = [...contactNodes]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 20);

  const contactsDetail = top20.map(n => {
    const info = n.info || {};
    const lastC = info.lastContact || '未填';
    const daysDiff = info.lastContact
      ? Math.floor((new Date(today) - new Date(info.lastContact)) / 86400000) : null;
    const daysStr = daysDiff !== null ? `（${daysDiff}天前）` : '';
    const statusStr = STATUS_EMOJI[n.status] || n.status || '未知';
    return `- ${n.name}｜${statusStr}｜電話:${info.phone || '未填'}｜最後聯繫:${lastC}${daysStr}｜備注:${info.notes || '無'}｜財務:${buildFinanceSummary(info)}`;
  }).join('\n');

  const monthSales = salesData
    .filter(s => (s.date || '').startsWith(monthPrefix))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const salesLines = monthSales.map(s =>
    `- ${s.date || '?'} ${s.name || s.clientName || '?'} ${s.product || s.type || ''} $${(s.amount || 0).toLocaleString()}`
  ).join('\n');

  let dailyRptBlock = '';
  if (Object.keys(todayRpt).length > 0) {
    const bigThreeStr = Array.isArray(todayRpt.bigThree)
      ? todayRpt.bigThree.map((t, i) => `${i + 1}.${t}`).join(' ')
      : (todayRpt.bigThree || '');
    const lines = [];
    if (bigThreeStr)        lines.push(`三件大事: ${bigThreeStr}`);
    if (todayRpt.schedule)  lines.push(`時間安排: ${todayRpt.schedule}`);
    const kpiStr = `邀約${todayRpt['act-invite'] ?? todayRpt.invite ?? 0} 電訪${todayRpt['act-calls'] ?? todayRpt.calls ?? 0} 表單${todayRpt['act-forms'] ?? todayRpt.forms ?? 0}`;
    lines.push(`今日實績: ${kpiStr}`);
    if (todayRpt.optimize)  lines.push(`復盤: ${todayRpt.optimize}`);
    if (todayRpt.tomorrow)  lines.push(`明天計劃: ${todayRpt.tomorrow}`);
    dailyRptBlock = `\n【今日日報】\n${lines.join('\n')}`;
  }

  const studentsData = nodes.filter(n => n.type === 'student' || n.isStudent);
  let studentsBlock = '';
  if (studentsData.length > 0) {
    const recentStudents = [...studentsData]
      .sort((a, b) => (a.info?.lastContact || '').localeCompare(b.info?.lastContact || '') * -1)
      .slice(0, 5)
      .map(s => {
        const lc = s.info?.lastContact;
        const days = lc ? Math.floor((new Date(today) - new Date(lc)) / 86400000) : null;
        return `${s.name}(${days !== null ? days + '天前' : '未聯繫'})`;
      });
    studentsBlock = `\n【學員】共${studentsData.length}人｜最近聯繫: ${recentStudents.join(', ')}`;
  }

  const contactCtx = currentContact
    ? `\n【本輪對話對象】${currentContact.name}｜${STATUS_EMOJI[currentContact.status] || '未知'}｜${buildFinanceSummary(currentContact.info)}｜備注:${currentContact.info?.notes?.slice(0, 80) || '無'}\n`
    : '';

  return `${persona.rolePrompt}
${FDD_KB}
${contactCtx}${memSnippet ? '\n' + memSnippet + '\n' : ''}
【使用者】${login.name || '業務員'}｜${rankLabels[myRank] || myRank}｜佣金率 ${(myRate * 100).toFixed(0)}%
【今日】${today}，月底還有 ${daysLeft} 天
【本月業績】$${summary.income.toLocaleString()} / 目標 $${salesTarget.toLocaleString()}（${salesPct}%）稅後 $${summary.net.toLocaleString()}，成交 ${summary.newCount} 件
【人脈概況】共 ${contactNodes.length} 人｜🟢高意願 ${green.length}（${green.map(n => n.name).join('、') || '無'}）｜🟡觀察中 ${yellow.length}｜🔴冷淡 ${red.length}
⚠ 超過7天未聯繫：${stale.join('、') || '無'}
【今日活動量】邀約${todayRpt['act-invite'] ?? todayRpt.invite ?? 0} 電訪${todayRpt['act-calls'] ?? todayRpt.calls ?? 0} 表單${todayRpt['act-forms'] ?? todayRpt.forms ?? 0} 追蹤${todayRpt['act-followup'] ?? todayRpt.followup ?? 0} 成交${todayRpt['act-close'] ?? todayRpt.close ?? 0}
【近期活動】${upcoming.length ? upcoming.join('；') : '無'}

【聯絡人詳情】
${contactsDetail || '（無聯絡人）'}

【本月成交】
${salesLines || '（本月尚無成交記錄）'}
${dailyRptBlock}${studentsBlock}

【知識庫文件】${docsData.length ? docsData.map(d => {
  const icon = { poster: '🖼', form: '📋', link: '🔗', file: '📄' }[d.type] || '📄';
  return `${icon}《${d.name}》${d.url ? '→ ' + d.url : ''}`;
}).join('　') : '尚無文件'}

【可用工具】update_contact_status / add_note / log_contact / get_followup_list / search_docs / calculate_mortgage / read_calendar_events / get_contact_detail / list_contacts / add_event / update_daily_kpi / add_sale / patch_daily_report / add_student / list_students
【重要】當用戶要求「新增學員」、「加到學員頁」、「幫我把 XXX 加為學員」，必須呼叫 add_student 工具，不能只用文字回應。工具執行後才算完成。

【海報生成】當用戶要求製作活動海報，請提取時間與地點，直接回覆以下格式：
👉 [點此預覽並下載海報](https://fdd-crm.pages.dev/poster.html?time=TIME&loc=LOCATION)
然後補充：「海報已帶入時間和地點，點開後直接下載 PNG 即可。」

請用繁體中文回答，語氣專業親切，重點條列清晰。`;
}
