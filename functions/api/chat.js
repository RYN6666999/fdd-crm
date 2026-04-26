/* ═══════════════════════════════════════
   CRM AI Chat Bridge — /api/chat
   POST { message, apiKey, provider?, model?, persona? }
   Auth: Bearer token (same CRM_DATA token)
   Returns: { ok, reply, usage? }

   Builds a server-side system prompt from KV data and calls the
   configured AI provider. Designed for Hermes / external agents.
═══════════════════════════════════════ */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

// ── Auth ──────────────────────────────────────────────────────────────────────

async function authOk(request, env) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return false;
  const stored = await env.CRM_DATA.get('__api_token__');
  return stored && stored === token;
}

// ── KV helpers ────────────────────────────────────────────────────────────────

async function kvGet(env, key) {
  try {
    const raw = await env.CRM_DATA.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Finance summary ───────────────────────────────────────────────────────────

function buildFinanceSummary(info) {
  if (!info) return '未填';
  const parts = [];
  if (info.income)        parts.push(`月收${info.income}`);
  if (info.hasProperty)   parts.push('有房');
  if (info.hasInvestment) parts.push('有投資');
  if (info.debt)          parts.push(`負債${info.debt}`);
  return parts.length ? parts.join(',') : '未填';
}

const STATUS_LABEL = { green: '🟢高意願', yellow: '🟡觀察中', red: '🔴冷淡' };

// ── Server-side system prompt ─────────────────────────────────────────────────

function buildServerSystemPrompt({ nodes, events, sales, dailyReports, persona }) {
  const now   = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);

  const contacts = Array.isArray(nodes) ? nodes.filter(n => n.parentId !== null) : [];
  const green    = contacts.filter(n => n.status === 'green');
  const yellow   = contacts.filter(n => n.status === 'yellow');
  const red      = contacts.filter(n => n.status === 'red');

  // Top 10 contacts
  const top10 = [...contacts]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 10);

  const contactsBlock = top10.map(n => {
    const info = n.info || {};
    const lastC = info.lastContact || '未填';
    const days  = info.lastContact
      ? Math.floor((Date.now() - new Date(info.lastContact).getTime()) / 86400000)
      : null;
    const daysStr = days !== null ? `（${days}天前）` : '';
    return `- ${n.name}｜${STATUS_LABEL[n.status] || n.status || '未知'}｜電話:${info.phone || '未填'}｜最後聯繫:${lastC}${daysStr}｜備注:${info.notes || '無'}｜財務:${buildFinanceSummary(info)}`;
  }).join('\n');

  // This month's sales
  const monthSales = Array.isArray(sales)
    ? sales.filter(s => (s.date || '').startsWith(monthPrefix))
    : [];
  const salesBlock = monthSales
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map(s => `- ${s.date || '?'} ${s.name || s.clientName || '?'} ${s.product || ''} $${(s.amount || 0).toLocaleString()}`)
    .join('\n');

  // Today's daily report
  const todayRpt = (dailyReports || {})[today] || {};
  let dailyBlock = '';
  if (Object.keys(todayRpt).length > 0) {
    const bigThreeStr = Array.isArray(todayRpt.bigThree)
      ? todayRpt.bigThree.map((t, i) => `${i + 1}.${t}`).join(' ')
      : (todayRpt.bigThree || '');
    const lines = [];
    if (bigThreeStr)       lines.push(`三件大事: ${bigThreeStr}`);
    if (todayRpt.schedule) lines.push(`時間安排: ${todayRpt.schedule}`);
    lines.push(`今日實績: 邀約${todayRpt['act-invite'] ?? 0} 電訪${todayRpt['act-calls'] ?? 0} 表單${todayRpt['act-forms'] ?? 0}`);
    if (todayRpt.optimize) lines.push(`復盤: ${todayRpt.optimize}`);
    if (todayRpt.tomorrow) lines.push(`明天計劃: ${todayRpt.tomorrow}`);
    dailyBlock = `\n【今日日報】\n${lines.join('\n')}`;
  }

  // Upcoming events (next 7 days)
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() + 7);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const upcomingEvents = Array.isArray(events)
    ? events
        .filter(ev => ev.date >= today && ev.date <= cutoffStr)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 10)
        .map(ev => `- ${ev.date}${ev.time ? ' ' + ev.time : ''} ${ev.title || ev.name || ''}`)
        .join('\n')
    : '';

  const personaNote = persona && persona !== 'assistant'
    ? `\n【助理角色】${persona}\n`
    : '';

  return `你是 CRM AI 智能助理，幫助業務員管理聯絡人、追蹤業績、規劃行程。請用繁體中文回答，語氣專業親切。
${personaNote}
【今日】${today}
【人脈概況】共 ${contacts.length} 人｜🟢高意願 ${green.length}｜🟡觀察中 ${yellow.length}｜🔴冷淡 ${red.length}

【聯絡人詳情（最近更新前10）】
${contactsBlock || '（無聯絡人資料）'}

【本月成交】
${salesBlock || '（本月尚無成交）'}
${dailyBlock}
【近7天活動】
${upcomingEvents || '（無近期活動）'}`;
}

// ── AI provider call ──────────────────────────────────────────────────────────

async function callAI({ provider, model, apiKey, systemPrompt, message }) {
  if (provider === 'anthropic' || provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      model || 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: message }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic error ${res.status}: ${err}`);
    }
    const data = await res.json();
    const reply = data.content?.[0]?.text || '';
    return { reply, usage: data.usage };
  }

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:    model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: message },
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${err}`);
    }
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || '';
    return { reply, usage: data.usage };
  }

  throw new Error(`不支援的 provider：${provider}。請使用 anthropic 或 openai。`);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  if (!await authOk(request, env)) {
    return Response.json({ ok: false, error: '未授權' }, { status: 401, headers: CORS });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: '無效的 JSON body' }, { status: 400, headers: CORS });
  }

  const { message, apiKey, provider = 'anthropic', model, persona } = body;

  if (!message) {
    return Response.json({ ok: false, error: 'message 為必填' }, { status: 400, headers: CORS });
  }
  if (!apiKey) {
    return Response.json({ ok: false, error: 'apiKey 為必填（不存於 KV 以確保安全）' }, { status: 400, headers: CORS });
  }

  // Load CRM data from KV
  const [nodes, events, sales, dailyReports] = await Promise.all([
    kvGet(env, 'nodes'),
    kvGet(env, 'events'),
    kvGet(env, 'sales'),
    kvGet(env, 'daily-reports'),
  ]);

  const systemPrompt = buildServerSystemPrompt({ nodes, events, sales, dailyReports, persona });

  let result;
  try {
    result = await callAI({ provider, model, apiKey, systemPrompt, message });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 502, headers: CORS });
  }

  return Response.json({ ok: true, reply: result.reply, usage: result.usage || null }, { headers: CORS });
}
