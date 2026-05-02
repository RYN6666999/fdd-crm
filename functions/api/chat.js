/* ═══════════════════════════════════════
   CRM AI Chat — 完整能力版
   眼睛＋手腳＋記憶，按需載入
═══════════════════════════════════════ */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

// ── 基礎工具 ───────────────────────────────────────────────────────────────────

async function authOk(request, env) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return false;
  const stored = await env.CRM_DATA.get('__api_token__');
  return stored && stored === token;
}

async function kvGet(env, key) {
  try { const r = await env.CRM_DATA.get(key); return r ? JSON.parse(r) : null; } catch { return null; }
}
async function kvPut(env, key, val) { await env.CRM_DATA.put(key, JSON.stringify(val)); }

async function getDailyOtp(secret) {
  const day = Math.floor(Date.now() / 86_400_000);
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(String(day)));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,10);
}

async function gbrainSearch(env, query, limit = 4) {
  const BASE = env.GBRAIN_BASE_URL, SECRET = env.GBRAIN_TOTP_SECRET;
  if (!BASE || !SECRET) return [];
  try {
    const otp = await getDailyOtp(SECRET);
    const r = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}&otp=${otp}`);
    if (!r.ok) return [];
    const d = await r.json();
    return d.results || [];
  } catch { return []; }
}

// ── Tool 定義（完整）─────────────────────────────────────────────────────────

const TOOLS = [

  // ════════ 聯絡人 ════════

  {
    name: 'get_contacts',
    description: '取得聯絡人列表。狀態：green=高意願/積極跟進，yellow=觀察中/暖身，red=冷淡/拒絕，gray=成交/結案。可篩選或關鍵字搜尋。',
    input_schema: { type:'object', properties: {
      status: { type:'string', enum:['green','yellow','red','gray'] },
      search: { type:'string', description:'姓名/電話/備注/公司關鍵字' },
      limit:  { type:'number', description:'筆數，預設20' },
      sort:   { type:'string', enum:['recent','name'], description:'recent=最近更新（預設），name=姓名' },
      missing_field: { type:'string', description:'篩選某欄位為空的聯絡人，如 phone/income/lastContact' },
    }},
  },

  {
    name: 'get_contact',
    description: '取得單一聯絡人所有欄位（含空白欄位）。查任何人詳細資料時用此工具。',
    input_schema: { type:'object', required:['name'], properties: {
      name: { type:'string', description:'姓名（模糊比對）' },
    }},
  },

  {
    name: 'add_contact',
    description: '新增聯絡人。路開新人、認識新客戶時使用。',
    input_schema: { type:'object', required:['name'], properties: {
      name:       { type:'string',  description:'姓名' },
      status:     { type:'string',  enum:['green','yellow','red','gray'], description:'初始狀態，預設 yellow' },
      phone:      { type:'string',  description:'電話' },
      email:      { type:'string',  description:'電郵' },
      line:       { type:'string',  description:'Line ID' },
      birthday:   { type:'string',  description:'生日 YYYY-MM-DD 或 MM-DD' },
      company:    { type:'string',  description:'公司/任職' },
      occupation: { type:'string',  description:'職業/職稱' },
      income:     { type:'string',  description:'月收入，如「5萬」' },
      hasProperty:{ type:'boolean', description:'有無房產' },
      notes:      { type:'string',  description:'備注' },
      source:     { type:'string',  description:'認識來源，如「路開」「轉介」「課程」' },
      referrer:   { type:'string',  description:'介紹人姓名' },
    }},
  },

  {
    name: 'update_contact',
    description: `更新聯絡人資料。欄位速查：
status: green高意願/yellow觀察/red冷淡/gray成交
聯絡: phone電話 email信箱 line微信wechat
個人: birthday生日 company公司 occupation職業 address地址
財務: income月收入 hasProperty有房 hasInvestment有投資 debt負債
跟進: lastContact最後聯繫(YYYY-MM-DD) notes備注 source來源 referrer介紹人
⚠️ 追加備注時請先 get_contact 取舊值再合併`,
    input_schema: { type:'object', required:['name'], properties: {
      name:   { type:'string' },
      status: { type:'string', enum:['green','yellow','red','gray'] },
      info: { type:'object', properties: {
        phone:         { type:'string'  },
        email:         { type:'string'  },
        line:          { type:'string'  },
        wechat:        { type:'string'  },
        birthday:      { type:'string'  },
        company:       { type:'string'  },
        occupation:    { type:'string'  },
        address:       { type:'string'  },
        income:        { type:'string'  },
        hasProperty:   { type:'boolean' },
        hasInvestment: { type:'boolean' },
        debt:          { type:'string'  },
        lastContact:   { type:'string'  },
        notes:         { type:'string'  },
        source:        { type:'string'  },
        referrer:      { type:'string'  },
      }},
    }},
  },

  // ════════ 行事曆 ════════

  {
    name: 'get_events',
    description: '取得行事曆活動。不傳參數 = 未來30天。',
    input_schema: { type:'object', properties: {
      from:    { type:'string', description:'開始日期 YYYY-MM-DD' },
      to:      { type:'string', description:'結束日期 YYYY-MM-DD' },
      contact: { type:'string', description:'篩選關聯某聯絡人' },
    }},
  },

  {
    name: 'add_event',
    description: '新增行事曆活動、提醒、預約。',
    input_schema: { type:'object', required:['title','date'], properties: {
      title:   { type:'string' },
      date:    { type:'string', description:'YYYY-MM-DD' },
      time:    { type:'string', description:'HH:MM（選填）' },
      type:    { type:'string', description:'電訪/邀約/帶看/成交/其他' },
      contact: { type:'string', description:'關聯聯絡人姓名' },
      link:    { type:'string', description:'地點或連結' },
      notes:   { type:'string', description:'備注' },
    }},
  },

  {
    name: 'delete_event',
    description: '刪除行事曆活動（活動已完成或取消時使用）。',
    input_schema: { type:'object', properties: {
      id:    { type:'string', description:'活動 ID（從 get_events 取得）' },
      title: { type:'string', description:'若無 ID，用標題模糊比對刪除' },
      date:  { type:'string', description:'配合 title 縮小範圍' },
    }},
  },

  // ════════ 業績 ════════

  {
    name: 'get_sales',
    description: '取得業績記錄。產品：transfer=轉移/房貸轉保單($75,440) student=學員($79,800) member=會員($200,000) vip=VIP買房($300,000) asst_mgr_pkg=襄理批貨($478,800) manager_pkg=經理批貨($1,197,000) consult=協談($2,394/人)',
    input_schema: { type:'object', properties: {
      month:   { type:'string', description:'YYYY-MM，不填=本月' },
      product: { type:'string', description:'篩選特定產品' },
    }},
  },

  {
    name: 'add_sale',
    description: '新增成交記錄。金額留空自動帶入單價。',
    input_schema: { type:'object', required:['product','clientName','date'], properties: {
      product:    { type:'string', enum:['transfer','student','member','vip','asst_mgr_pkg','manager_pkg','consult'] },
      clientName: { type:'string' },
      date:       { type:'string', description:'YYYY-MM-DD' },
      amount:     { type:'number', description:'留空=自動帶單價' },
      qty:        { type:'number', description:'協談人數' },
      notes:      { type:'string' },
    }},
  },

  // ════════ 日報表 ════════

  {
    name: 'get_daily_report',
    description: '取得日報表。KPI欄位：act-invite=邀約 act-calls=電訪 act-forms=表單 act-followup=追蹤 act-close=成交。文字欄位：bigThree=三件大事 schedule=時間安排 optimize=復盤 tomorrow=明日計劃',
    input_schema: { type:'object', properties: {
      date: { type:'string', description:'YYYY-MM-DD，不填=今天' },
    }},
  },

  {
    name: 'update_daily_report',
    description: '更新日報表任何欄位。KPI傳數字，bigThree傳陣列（最多3項）。',
    input_schema: { type:'object', required:['data'], properties: {
      date: { type:'string', description:'YYYY-MM-DD，不填=今天' },
      data: { type:'object', properties: {
        'act-invite':   { type:'number', description:'邀約次數' },
        'act-calls':    { type:'number', description:'電訪次數' },
        'act-forms':    { type:'number', description:'表單次數' },
        'act-followup': { type:'number', description:'追蹤次數' },
        'act-close':    { type:'number', description:'成交次數' },
        bigThree:       { type:'array',  items:{ type:'string' }, description:'三件大事，最多3項' },
        schedule:       { type:'string', description:'時間安排' },
        optimize:       { type:'string', description:'復盤/反思' },
        tomorrow:       { type:'string', description:'明天計劃' },
      }},
    }},
  },

  // ════════ 月目標 ════════

  {
    name: 'get_monthly_goals',
    description: '取得月度 KPI 目標與業績目標。對照：mg-invite=邀約目標 mg-calls=電訪目標 mg-forms=表單目標 mg-followup=追蹤目標 mg-close=成交目標 mg-sales=業績金額目標',
    input_schema: { type:'object', properties: {
      month: { type:'string', description:'YYYY-MM，不填=本月' },
    }},
  },

  {
    name: 'update_monthly_goals',
    description: '設定月度 KPI 目標。',
    input_schema: { type:'object', required:['data'], properties: {
      month: { type:'string', description:'YYYY-MM，不填=本月' },
      data:  { type:'object', properties: {
        'mg-invite':   { type:'number', description:'邀約月目標次數' },
        'mg-calls':    { type:'number', description:'電訪月目標次數' },
        'mg-forms':    { type:'number', description:'表單月目標次數' },
        'mg-followup': { type:'number', description:'追蹤月目標次數' },
        'mg-close':    { type:'number', description:'成交月目標次數' },
        'mg-sales':    { type:'number', description:'業績金額目標（元）' },
      }},
    }},
  },

  // ════════ 學員管理 ════════

  {
    name: 'get_students',
    description: '取得學員列表與進度。學員是已成交 student 產品的客戶，需要持續追蹤學習進度。',
    input_schema: { type:'object', properties: {
      search:  { type:'string', description:'姓名或電話關鍵字' },
      status:  { type:'string', enum:['active','completed','paused'], description:'進度狀態' },
    }},
  },

  {
    name: 'update_student',
    description: '更新學員資料、進度、下次聯繫時間。',
    input_schema: { type:'object', required:['name'], properties: {
      name:        { type:'string', description:'學員姓名（模糊比對）' },
      status:      { type:'string', enum:['active','completed','paused'], description:'active=進行中 completed=完成 paused=暫停' },
      progress:    { type:'string', description:'學習進度描述' },
      nextContact: { type:'string', description:'下次聯繫日期 YYYY-MM-DD' },
      notes:       { type:'string', description:'追加備注（直接追加，不覆蓋）' },
      sessions:    { type:'number', description:'已完成課程次數' },
    }},
  },

  // ════════ gbrain 記憶 ════════

  {
    name: 'search_memory',
    description: '搜尋長期記憶（gbrain）。查歷史互動、客戶情報、有效話術、過往決策。',
    input_schema: { type:'object', required:['query'], properties: {
      query: { type:'string' },
      limit: { type:'number', description:'預設5' },
    }},
  },

  {
    name: 'remember',
    description: `寫入值得長期保留的資訊（gbrain）。
✅ 記：客戶情報（預算/時間/顧慮）、有效話術、成交/失敗原因、重要決策、業務規律
❌ 不記：例行查詢、打招呼、資料列表`,
    input_schema: { type:'object', required:['content','tags'], properties: {
      content: { type:'string', description:'一句話含足夠上下文，50字內' },
      tags:    { type:'array', items:{ type:'string', enum:['preference','fact','method','project','person','decision'] } },
      slug:    { type:'string', description:'選填，如 crm/contacts/陳大明/budget-2026-05' },
    }},
  },
];

// ── Tool 執行器 ───────────────────────────────────────────────────────────────

const STATUS_LABEL   = { green:'🟢高意願', yellow:'🟡觀察中', red:'🔴冷淡', gray:'⚫成交/結案' };
const PRODUCT_PRICE  = { transfer:75440, student:79800, member:200000, vip:300000, asst_mgr_pkg:478800, manager_pkg:1197000, consult:2394 };

function fuzzyFind(arr, name, key = 'name') {
  const q = (name||'').toLowerCase();
  return arr.find(x => (x[key]||'').toLowerCase().includes(q));
}

function fuzzyFindIdx(arr, name, key = 'name') {
  const q = (name||'').toLowerCase();
  return arr.findIndex(x => (x[key]||'').toLowerCase().includes(q));
}

function unwrapArr(v) { if (!v) return []; if (Array.isArray(v)) return v; if (Array.isArray(v.data)) return v.data; return []; }

async function executeTool(name, input, env) {
  const nodesRaw       = await kvGet(env, 'nodes');
  const nodes          = unwrapArr(nodesRaw);
  const events         = unwrapArr(await kvGet(env, 'events'));
  const sales          = unwrapArr(await kvGet(env, 'sales'));
  const dailyReports   = await kvGet(env, 'daily-reports')        || {};
  const monthlyGoals   = await kvGet(env, 'monthly-goals')        || {};
  const salesTargets   = await kvGet(env, 'monthly-sales-targets')|| {};
  const students       = unwrapArr(await kvGet(env, 'students'));

  // ─── 聯絡人 ──────────────────────────────────────────────────────────────────

  if (name === 'get_contacts') {
    let contacts = nodes.filter(n => n.parentId !== null);
    if (input.status) contacts = contacts.filter(n => n.status === input.status);
    if (input.search) {
      const q = input.search.toLowerCase();
      contacts = contacts.filter(n =>
        (n.name||'').toLowerCase().includes(q) ||
        (n.info?.notes||'').toLowerCase().includes(q) ||
        (n.info?.phone||'').includes(q) ||
        (n.info?.company||'').toLowerCase().includes(q)
      );
    }
    if (input.missing_field) {
      const f = input.missing_field;
      contacts = contacts.filter(n => {
        const v = n.info?.[f];
        return v === undefined || v === null || v === '' || v === '未填';
      });
    }
    if (input.sort === 'name') contacts.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
    else contacts.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    return contacts.slice(0, input.limit||20).map(n => {
      const i = n.info||{};
      const days = i.lastContact ? Math.floor((Date.now()-new Date(i.lastContact).getTime())/86400000) : null;
      return { name:n.name, status:STATUS_LABEL[n.status]||'未分類', phone:i.phone||'未填', lastContact:i.lastContact||'未填', daysSince:days!==null?`${days}天前`:null, income:i.income||'未填', hasProperty:i.hasProperty??'未填', company:i.company||'未填', notes:(i.notes||'').slice(0,80) };
    });
  }

  if (name === 'get_contact') {
    const n = fuzzyFind(nodes.filter(n=>n.parentId!==null), input.name);
    if (!n) return { error:`找不到：${input.name}` };
    const i = n.info||{};
    const days = i.lastContact ? Math.floor((Date.now()-new Date(i.lastContact).getTime())/86400000) : null;
    return {
      name:n.name, status:STATUS_LABEL[n.status]||'未分類',
      phone:i.phone||'未填', email:i.email||'未填', line:i.line||'未填', wechat:i.wechat||'未填',
      birthday:i.birthday||'未填', company:i.company||'未填', occupation:i.occupation||'未填', address:i.address||'未填',
      income:i.income||'未填', hasProperty:i.hasProperty??'未填', hasInvestment:i.hasInvestment??'未填', debt:i.debt||'未填',
      lastContact:i.lastContact||'未填', daysSinceContact:days!==null?`${days}天前`:'從未聯繫',
      notes:i.notes||'未填', source:i.source||'未填', referrer:i.referrer||'未填',
      createdAt:n.createdAt?new Date(n.createdAt).toISOString().slice(0,10):'未知',
      updatedAt:n.updatedAt?new Date(n.updatedAt).toISOString().slice(0,10):'未知',
    };
  }

  if (name === 'add_contact') {
    const exists = fuzzyFind(nodes.filter(n=>n.parentId!==null), input.name);
    if (exists) return { error:`已存在同名聯絡人：${exists.name}，請確認是否要更新現有資料` };
    const rootNode = nodes.find(n => n.parentId === null);
    const newNode = {
      id: Date.now().toString(36)+Math.random().toString(36).slice(2,6),
      name: input.name,
      status: input.status || 'yellow',
      parentId: rootNode?.id || '0',
      info: {
        phone:input.phone||'', email:input.email||'', line:input.line||'',
        birthday:input.birthday||'', company:input.company||'', occupation:input.occupation||'',
        income:input.income||'', hasProperty:input.hasProperty??false,
        notes:input.notes||'', source:input.source||'', referrer:input.referrer||'',
      },
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    nodes.push(newNode);
    await kvPut(env, 'nodes', { data: nodes });
    return { ok:true, message:`已新增聯絡人：${input.name}` };
  }

  if (name === 'update_contact') {
    const realIdx = nodes.findIndex(n => n.parentId!==null && (n.name||'').toLowerCase().includes((input.name||'').toLowerCase()));
    if (realIdx===-1) return { error:`找不到：${input.name}` };
    if (input.status) nodes[realIdx].status = input.status;
    if (input.info)   nodes[realIdx].info = { ...(nodes[realIdx].info||{}), ...input.info };
    nodes[realIdx].updatedAt = Date.now();
    await kvPut(env, 'nodes', { data: nodes });
    return { ok:true, updated:nodes[realIdx].name, fields:[...Object.keys(input.info||{}), ...(input.status?['status']:[])].join(', ') };
  }

  // ─── 行事曆 ───────────────────────────────────────────────────────────────────

  if (name === 'get_events') {
    const today = new Date().toISOString().slice(0,10);
    const from  = input.from || today;
    const to    = input.to   || new Date(Date.now()+30*86400000).toISOString().slice(0,10);
    let evs = events.filter(e => e.date>=from && e.date<=to);
    if (input.contact) { const q=input.contact.toLowerCase(); evs=evs.filter(e=>(e.contact||'').toLowerCase().includes(q)); }
    return evs.sort((a,b)=>a.date.localeCompare(b.date)).map(e=>({ id:e.id, title:e.title||e.name, date:e.date, time:e.time||'', type:e.type||'', contact:e.contact||'', notes:e.notes||'' }));
  }

  if (name === 'add_event') {
    const ev = { id:Date.now().toString(36)+Math.random().toString(36).slice(2,5), title:input.title, date:input.date, time:input.time||'', type:input.type||'', contact:input.contact||'', link:input.link||'', notes:input.notes||'', createdAt:Date.now() };
    events.push(ev);
    await kvPut(env, 'events', events);
    return { ok:true, message:`已新增：${input.title} @ ${input.date}${input.time?' '+input.time:''}` };
  }

  if (name === 'delete_event') {
    let idx = -1;
    if (input.id) idx = events.findIndex(e => e.id === input.id);
    if (idx===-1 && input.title) {
      const q = input.title.toLowerCase();
      idx = events.findIndex(e => (e.title||e.name||'').toLowerCase().includes(q) && (!input.date || e.date===input.date));
    }
    if (idx===-1) return { error:'找不到該活動' };
    const removed = events.splice(idx, 1)[0];
    await kvPut(env, 'events', events);
    return { ok:true, message:`已刪除：${removed.title||removed.name} @ ${removed.date}` };
  }

  // ─── 業績 ─────────────────────────────────────────────────────────────────────

  if (name === 'get_sales') {
    const prefix = input.month || new Date().toISOString().slice(0,7);
    let s = sales.filter(x=>(x.date||'').startsWith(prefix));
    if (input.product) s=s.filter(x=>x.product===input.product);
    const total = s.reduce((a,x)=>a+(x.amount||0),0);
    const mkey  = prefix;
    const target = salesTargets[mkey] || 0;
    return { month:prefix, total, target, gap:target-total, pct:target?Math.round(total/target*100):null, count:s.length, records:s.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(x=>({ date:x.date, client:x.name||x.clientName, product:x.product, amount:x.amount, notes:x.notes||'' })) };
  }

  if (name === 'add_sale') {
    const amount = input.amount || PRODUCT_PRICE[input.product] * (input.qty||1);
    const record = { id:Date.now().toString(36), product:input.product, name:input.clientName, clientName:input.clientName, date:input.date, amount, qty:input.qty||1, notes:input.notes||'', createdAt:Date.now() };
    sales.push(record);
    await kvPut(env, 'sales', sales);
    return { ok:true, message:`已新增成交：${input.clientName} ${input.product} NT$${amount.toLocaleString()}` };
  }

  // ─── 日報表 ───────────────────────────────────────────────────────────────────

  if (name === 'get_daily_report') {
    const date = input.date || new Date().toISOString().slice(0,10);
    const r = dailyReports[date] || {};
    return { date, kpi:{ invite:r['act-invite']??0, calls:r['act-calls']??0, forms:r['act-forms']??0, followup:r['act-followup']??0, close:r['act-close']??0 }, bigThree:r.bigThree||[], schedule:r.schedule||'未填', optimize:r.optimize||'未填', tomorrow:r.tomorrow||'未填' };
  }

  if (name === 'update_daily_report') {
    const date = input.date || new Date().toISOString().slice(0,10);
    dailyReports[date] = { ...(dailyReports[date]||{}), ...input.data };
    await kvPut(env, 'daily-reports', dailyReports);
    return { ok:true, date, updated:Object.keys(input.data) };
  }

  // ─── 月目標 ───────────────────────────────────────────────────────────────────

  if (name === 'get_monthly_goals') {
    const mkey = input.month || new Date().toISOString().slice(0,7);
    const g = monthlyGoals[mkey] || {};
    const st = salesTargets[mkey] || 0;
    // Calculate actual progress from daily reports
    const days = Object.keys(dailyReports).filter(d => d.startsWith(mkey));
    const actuals = days.reduce((acc, d) => {
      const r = dailyReports[d];
      acc.invite   += r['act-invite']   || 0;
      acc.calls    += r['act-calls']    || 0;
      acc.forms    += r['act-forms']    || 0;
      acc.followup += r['act-followup'] || 0;
      acc.close    += r['act-close']    || 0;
      return acc;
    }, { invite:0, calls:0, forms:0, followup:0, close:0 });
    const monthSales = sales.filter(s=>(s.date||'').startsWith(mkey)).reduce((a,s)=>a+(s.amount||0),0);
    return {
      month: mkey,
      goals: { invite:g['mg-invite']||0, calls:g['mg-calls']||0, forms:g['mg-forms']||0, followup:g['mg-followup']||0, close:g['mg-close']||0, salesTarget:st },
      actuals: { ...actuals, sales:monthSales },
      progress: {
        invite:   g['mg-invite']   ? `${actuals.invite}/${g['mg-invite']} (${Math.round(actuals.invite/g['mg-invite']*100)}%)`   : `${actuals.invite}/未設`,
        calls:    g['mg-calls']    ? `${actuals.calls}/${g['mg-calls']} (${Math.round(actuals.calls/g['mg-calls']*100)}%)`       : `${actuals.calls}/未設`,
        forms:    g['mg-forms']    ? `${actuals.forms}/${g['mg-forms']} (${Math.round(actuals.forms/g['mg-forms']*100)}%)`       : `${actuals.forms}/未設`,
        followup: g['mg-followup'] ? `${actuals.followup}/${g['mg-followup']} (${Math.round(actuals.followup/g['mg-followup']*100)}%)` : `${actuals.followup}/未設`,
        close:    g['mg-close']    ? `${actuals.close}/${g['mg-close']} (${Math.round(actuals.close/g['mg-close']*100)}%)`       : `${actuals.close}/未設`,
        sales:    st               ? `NT$${monthSales.toLocaleString()}/${(st).toLocaleString()} (${Math.round(monthSales/st*100)}%)` : `NT$${monthSales.toLocaleString()}/未設`,
      },
    };
  }

  if (name === 'update_monthly_goals') {
    const mkey = input.month || new Date().toISOString().slice(0,7);
    if (input.data['mg-sales'] !== undefined) {
      salesTargets[mkey] = input.data['mg-sales'];
      await kvPut(env, 'monthly-sales-targets', salesTargets);
      delete input.data['mg-sales'];
    }
    if (Object.keys(input.data).length > 0) {
      monthlyGoals[mkey] = { ...(monthlyGoals[mkey]||{}), ...input.data };
      await kvPut(env, 'monthly-goals', monthlyGoals);
    }
    return { ok:true, month:mkey, updated:Object.keys(input.data) };
  }

  // ─── 學員管理 ─────────────────────────────────────────────────────────────────

  if (name === 'get_students') {
    let list = Array.isArray(students) ? students : [];
    if (input.search) { const q=input.search.toLowerCase(); list=list.filter(s=>(s.name||'').toLowerCase().includes(q)||(s.phone||'').includes(q)); }
    if (input.status) list=list.filter(s=>s.status===input.status);
    const today = new Date().toISOString().slice(0,10);
    return list.map(s => ({
      name:s.name, phone:s.phone||'未填', status:s.status||'active',
      progress:s.progress||'未填', sessions:s.sessions||0,
      nextContact:s.nextContact||'未設', overdue:s.nextContact&&s.nextContact<today,
      notes:(s.notes||'').slice(0,100), joinDate:s.joinDate||'未填',
    }));
  }

  if (name === 'update_student') {
    const idx = students.findIndex ? students.findIndex(s=>(s.name||'').toLowerCase().includes((input.name||'').toLowerCase())) : -1;
    if (idx===-1) return { error:`找不到學員：${input.name}` };
    const s = students[idx];
    if (input.status)      s.status      = input.status;
    if (input.progress)    s.progress    = input.progress;
    if (input.nextContact) s.nextContact = input.nextContact;
    if (input.sessions !== undefined) s.sessions = input.sessions;
    if (input.notes)       s.notes       = (s.notes ? s.notes + '\n' : '') + input.notes;
    s.updatedAt = Date.now();
    students[idx] = s;
    await kvPut(env, 'students', students);
    return { ok:true, updated:s.name };
  }

  // ─── gbrain ───────────────────────────────────────────────────────────────────

  if (name === 'search_memory') {
    const results = await gbrainSearch(env, input.query, input.limit||5);
    return results.map(x=>({ slug:x.slug, title:x.title, excerpt:(x.chunk_text||'').slice(0,300) }));
  }

  if (name === 'remember') {
    const BASE=env.GBRAIN_BASE_URL, SECRET=env.GBRAIN_TOTP_SECRET;
    if (!BASE||!SECRET) return { error:'gbrain not configured' };
    const otp = await getDailyOtp(SECRET);
    const r = await fetch(`${BASE}/page`, { method:'PUT', headers:{'Content-Type':'application/json','Authorization':`OTP ${otp}`}, body:JSON.stringify({ content:input.content, tags:input.tags, slug:input.slug, source:'fdd-crm' }) });
    if (!r.ok) return { error:`gbrain ${r.status}` };
    return { ok:true };
  }

  return { error:`Unknown tool: ${name}` };
}

// ── System Prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(persona, memoryCtx) {
  const today = new Date().toISOString().slice(0,10);
  const personaNote = persona && persona!=='assistant' ? `\n【角色】${persona}\n` : '';
  const memNote = memoryCtx ? `\n【相關長期記憶】\n${memoryCtx}\n` : '';
  return `你是 Ryan 的 CRM AI 助理，協助管理房地產業務。繁體中文，語氣專業親切。
${personaNote}【今日】${today}
${memNote}
【工具原則】問到資料先呼叫工具，不猜測。追加備注先 get_contact 取舊值再合併。remember 只記 6 個月後還值得查的。

【欄位速查】
聯絡人: phone/email/line/wechat | birthday/company/occupation/address | income/hasProperty/hasInvestment/debt | lastContact/notes/source/referrer
狀態: green高意願 yellow觀察 red冷淡 gray成交
日報KPI: act-invite邀約 act-calls電訪 act-forms表單 act-followup追蹤 act-close成交
月目標: mg-invite/mg-calls/mg-forms/mg-followup/mg-close/mg-sales
產品: transfer學員student會員member VIP vip 襄理批asst_mgr_pkg 經理批manager_pkg 協談consult`;
}

// ── Anthropic tool use loop ───────────────────────────────────────────────────

async function callAnthropicWithTools({ apiKey, model, systemPrompt, messages, env }) {
  for (let i = 0; i < 8; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({ model:model||'claude-3-5-haiku-20241022', max_tokens:2048, system:systemPrompt, tools:TOOLS, messages }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data.stop_reason==='end_turn')
      return { reply:data.content.filter(b=>b.type==='text').map(b=>b.text).join(''), usage:data.usage };
    if (data.stop_reason==='tool_use') {
      messages.push({ role:'assistant', content:data.content });
      const results = await Promise.all(data.content.filter(b=>b.type==='tool_use').map(async b=>({
        type:'tool_result', tool_use_id:b.id, content:JSON.stringify(await executeTool(b.name,b.input,env))
      })));
      messages.push({ role:'user', content:results });
      continue;
    }
    return { reply:(data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('')||'（無回應）', usage:data.usage };
  }
  return { reply:'工具呼叫超過上限，請重試。', usage:null };
}

// ── OpenRouter tool use loop（OpenAI 格式）────────────────────────────────────

function toOAITools(tools) {
  return tools.map(t=>({ type:'function', function:{ name:t.name, description:t.description, parameters:t.input_schema } }));
}

async function callOpenRouterWithTools({ apiKey, model, systemPrompt, messages, env }) {
  const oaiMsgs = [{ role:'system', content:systemPrompt }, ...messages];
  const oaiTools = toOAITools(TOOLS);
  for (let i = 0; i < 8; i++) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
      body:JSON.stringify({ model, max_tokens:2048, tools:oaiTools, tool_choice:'auto', messages:oaiMsgs }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('OpenRouter: empty response');
    oaiMsgs.push(msg);
    if (!msg.tool_calls?.length)
      return { reply:msg.content||'', usage:data.usage };
    const results = await Promise.all(msg.tool_calls.map(async tc => {
      let inp = {}; try { inp=JSON.parse(tc.function.arguments); } catch {}
      return { role:'tool', tool_call_id:tc.id, content:JSON.stringify(await executeTool(tc.function.name,inp,env)) };
    }));
    oaiMsgs.push(...results);
  }
  return { reply:'工具呼叫超過上限，請重試。', usage:null };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function onRequestOptions() { return new Response(null, { status:204, headers:CORS }); }

export async function onRequestPost({ request, env }) {
  if (!await authOk(request, env))
    return Response.json({ ok:false, error:'未授權' }, { status:401, headers:CORS });

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ ok:false, error:'無效 JSON' }, { status:400, headers:CORS });
  }

  const { message, apiKey, provider='anthropic', model, persona } = body;
  if (!message) return Response.json({ ok:false, error:'message 必填' }, { status:400, headers:CORS });

  // 跨對話記憶：每次對話開始先查 gbrain，補回歷史脈絡
  const memResults = await gbrainSearch(env, message, 3);
  const memoryCtx = memResults.length
    ? memResults.map(x=>`- ${x.title||x.slug}: ${(x.chunk_text||'').slice(0,150)}`).join('\n')
    : '';

  const systemPrompt = buildSystemPrompt(persona, memoryCtx);
  const initMessages = [{ role:'user', content:message }];

  let result;
  try {
    if (provider==='anthropic'||provider==='claude') {
      if (!apiKey) return Response.json({ ok:false, error:'apiKey 必填' }, { status:400, headers:CORS });
      result = await callAnthropicWithTools({ apiKey, model, systemPrompt, messages:initMessages, env });
    } else if (provider==='openrouter') {
      const key = apiKey || env?.OPENROUTER_API_KEY;
      if (!key) return Response.json({ ok:false, error:'OPENROUTER_API_KEY not set' }, { status:400, headers:CORS });
      result = await callOpenRouterWithTools({ apiKey:key, model:model||'z-ai/glm-4.6', systemPrompt, messages:initMessages, env });
    } else {
      return Response.json({ ok:false, error:`不支援的 provider：${provider}` }, { status:400, headers:CORS });
    }
  } catch(e) {
    return Response.json({ ok:false, error:e.message }, { status:502, headers:CORS });
  }

  return Response.json({ ok:true, reply:result.reply, usage:result.usage||null }, { headers:CORS });
}
