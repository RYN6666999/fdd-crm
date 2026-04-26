/* ═══════════════════════════════════════
   CRM MCP Server — /api/mcp
   MCP-over-HTTP (JSON-RPC 2.0, no SSE)
   Auth: Bearer token
   Tools: list_contacts / get_contact / update_contact /
          list_events / add_event /
          get_daily_report /
          get_sales / add_sale
═══════════════════════════════════════ */

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' };
const MCP_VERSION = '2024-11-05';

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'crm_list_contacts',
    description: '列出 CRM 所有聯絡人。可用 status 或 name 篩選。',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: '篩選狀態 (invited/formed/closed/member 等)，空字串=全部' },
        name:   { type: 'string', description: '模糊搜尋姓名' },
        limit:  { type: 'number', description: '回傳筆數上限，預設 50' },
      },
    },
  },
  {
    name: 'crm_get_contact',
    description: '依 id 或姓名取得單一聯絡人詳細資料（包含 info 欄位：電話、備注、財務狀況等）',
    inputSchema: {
      type: 'object',
      properties: {
        id:   { type: 'string', description: '聯絡人 id' },
        name: { type: 'string', description: '聯絡人姓名（精確或模糊）' },
      },
    },
  },
  {
    name: 'crm_update_contact',
    description: '更新聯絡人欄位。頂層欄位（status/name）直接設，info 內欄位用 info.xxx 格式。',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id:     { type: 'string', description: '聯絡人 id' },
        fields: { type: 'object', description: '要更新的欄位，例 { "status": "formed", "info.phone": "0912..." }' },
      },
    },
  },
  {
    name: 'crm_list_events',
    description: '列出行事曆事件，可依日期範圍篩選',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD 開始日，空=不限' },
        to:   { type: 'string', description: 'YYYY-MM-DD 結束日，空=不限' },
      },
    },
  },
  {
    name: 'crm_add_event',
    description: '新增行事曆事件',
    inputSchema: {
      type: 'object',
      required: ['title', 'date'],
      properties: {
        title:    { type: 'string' },
        date:     { type: 'string', description: 'YYYY-MM-DD' },
        time:     { type: 'string', description: 'HH:MM，可省略' },
        endTime:  { type: 'string', description: 'HH:MM，可省略' },
        notes:    { type: 'string' },
        category: { type: 'string', description: 'meeting/call/task/other' },
      },
    },
  },
  {
    name: 'crm_get_daily_report',
    description: '取得指定日期的日報表（今日實績、時間安排、三件大事、復盤、明天計劃）',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD，省略=今天' },
      },
    },
  },
  {
    name: 'crm_get_sales',
    description: '取得業績記錄，可依月份篩選',
    inputSchema: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'YYYY-MM，省略=全部' },
        limit: { type: 'number', description: '筆數上限，預設 100' },
      },
    },
  },
  {
    name: 'crm_set_token',
    description: '（初始化用）設定 API token，之後所有請求都需要此 token。只在 token 尚未設定時有效。',
    inputSchema: {
      type: 'object',
      required: ['token'],
      properties: {
        token: { type: 'string', description: '自訂 API token（建議 32 字元以上亂數字串）' },
      },
    },
  },
];

// ── Auth ─────────────────────────────────────────────────────────────────────

async function authOk(request, env) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return false;
  const stored = await env.CRM_DATA.get('__api_token__');
  return stored && stored === token;
}

// ── KV helpers ───────────────────────────────────────────────────────────────

async function kvGet(env, key) {
  const raw = await env.CRM_DATA.get(key);
  return raw ? JSON.parse(raw) : null;
}
async function kvPut(env, key, val) {
  await env.CRM_DATA.put(key, JSON.stringify(val));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handle_crm_list_contacts(args, env) {
  const nodes = (await kvGet(env, 'nodes')) || [];
  const all = Array.isArray(nodes) ? nodes : Object.values(nodes);
  let result = all.filter(n => n.nodeType !== 'note');
  if (args.status) result = result.filter(n => n.status === args.status);
  if (args.name)   result = result.filter(n => n.name?.includes(args.name));
  const limit = args.limit || 50;
  result = result.slice(0, limit).map(n => ({
    id: n.id, name: n.name, status: n.status, nodeType: n.nodeType,
    phone: n.info?.phone, lastContact: n.info?.lastContact,
    updatedAt: n.updatedAt,
  }));
  return { count: result.length, contacts: result };
}

async function handle_crm_get_contact(args, env) {
  const nodes = (await kvGet(env, 'nodes')) || [];
  const all = Array.isArray(nodes) ? nodes : Object.values(nodes);
  let found = null;
  if (args.id)   found = all.find(n => n.id === args.id);
  if (!found && args.name) found = all.find(n => n.name === args.name) || all.find(n => n.name?.includes(args.name));
  if (!found) return { error: '找不到聯絡人' };
  return found;
}

async function handle_crm_update_contact(args, env) {
  const nodes = (await kvGet(env, 'nodes')) || [];
  const all = Array.isArray(nodes) ? nodes : Object.values(nodes);
  const idx = all.findIndex(n => n.id === args.id);
  if (idx === -1) return { error: '找不到聯絡人' };
  const node = { ...all[idx], info: { ...(all[idx].info || {}) } };
  for (const [k, v] of Object.entries(args.fields || {})) {
    if (k.startsWith('info.')) node.info[k.slice(5)] = v;
    else node[k] = v;
  }
  node.updatedAt = Date.now();
  all[idx] = node;
  await kvPut(env, 'nodes', all);
  return { ok: true, updated: node.name };
}

async function handle_crm_list_events(args, env) {
  const events = (await kvGet(env, 'events')) || [];
  let result = [...events];
  if (args.from) result = result.filter(e => e.date >= args.from);
  if (args.to)   result = result.filter(e => e.date <= args.to);
  result.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  return { count: result.length, events: result };
}

async function handle_crm_add_event(args, env) {
  const events = (await kvGet(env, 'events')) || [];
  const ev = {
    id: uid(), title: args.title, date: args.date,
    time: args.time || '', endTime: args.endTime || '',
    notes: args.notes || '', category: args.category || 'meeting',
    createdAt: Date.now(),
  };
  events.push(ev);
  await kvPut(env, 'events', events);
  return { ok: true, event: ev };
}

async function handle_crm_get_daily_report(args, env) {
  const date = args.date || today();
  const reports = (await kvGet(env, 'daily-reports')) || {};
  const report = reports[date] || null;
  return { date, report: report || '（無記錄）' };
}

async function handle_crm_get_sales(args, env) {
  const sales = (await kvGet(env, 'sales')) || [];
  let result = [...sales];
  if (args.month) result = result.filter(s => (s.date || s.createdAt?.toString().slice(0, 7)) === args.month);
  result.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return { count: result.length, sales: result.slice(0, args.limit || 100) };
}

async function handle_crm_set_token(args, env) {
  const existing = await env.CRM_DATA.get('__api_token__');
  if (existing) return { error: 'Token 已設定，請在 CRM 設定頁修改' };
  if (!args.token || args.token.length < 8) return { error: 'Token 長度不足（至少 8 字元）' };
  await env.CRM_DATA.put('__api_token__', args.token);
  return { ok: true, message: 'Token 已設定，請保存此 token 用於後續請求' };
}

const HANDLERS = {
  crm_list_contacts:  handle_crm_list_contacts,
  crm_get_contact:    handle_crm_get_contact,
  crm_update_contact: handle_crm_update_contact,
  crm_list_events:    handle_crm_list_events,
  crm_add_event:      handle_crm_add_event,
  crm_get_daily_report: handle_crm_get_daily_report,
  crm_get_sales:      handle_crm_get_sales,
  crm_set_token:      handle_crm_set_token,
};

// ── MCP Router ────────────────────────────────────────────────────────────────

async function routeMCP(rpc, request, env) {
  const { method, params, id } = rpc;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const err = (code, msg) => ({ jsonrpc: '2.0', id, error: { code, message: msg } });

  if (method === 'initialize') {
    return ok({
      protocolVersion: MCP_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'fdd-crm', version: '1.0.0' },
    });
  }

  if (method === 'notifications/initialized') return ok({});
  if (method === 'ping') return ok({});

  if (method === 'tools/list') {
    return ok({ tools: TOOLS });
  }

  if (method === 'tools/call') {
    // crm_set_token 不需要 auth
    if (params?.name !== 'crm_set_token' && !await authOk(request, env)) {
      return err(-32001, '未授權：需要 Authorization: Bearer <token>');
    }
    const handler = HANDLERS[params?.name];
    if (!handler) return err(-32601, `未知工具: ${params?.name}`);
    try {
      const result = await handler(params?.arguments || {}, env);
      return ok({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
    } catch (e) {
      return err(-32603, String(e));
    }
  }

  return err(-32601, `未知方法: ${method}`);
}

// ── Entry points ──────────────────────────────────────────────────────────────

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  try {
    const rpc = await request.json();
    // 支援批次（陣列）或單一請求
    if (Array.isArray(rpc)) {
      const results = await Promise.all(rpc.map(r => routeMCP(r, request, env)));
      return Response.json(results, { headers: CORS });
    }
    const result = await routeMCP(rpc, request, env);
    return Response.json(result, { headers: CORS });
  } catch (e) {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: `解析失敗: ${e}` } }, { status: 400, headers: CORS });
  }
}
