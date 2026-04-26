/* ═══════════════════════════════════════
   CRM Data Store — /api/store
   GET  /api/store?key=nodes       → 讀取 KV 資料
   PUT  /api/store?key=nodes       → 寫入 KV 資料
   POST /api/store/batch           → 批次讀取多個 key
   Auth: Bearer token (設定頁設置的 CRM_API_TOKEN)
═══════════════════════════════════════ */

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' };
const ALLOWED_KEYS = new Set(['nodes','events','sales','daily-reports','monthly-goals','monthly-sales-targets','docs','students']);

async function authOk(request, env) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return false;
  const stored = await env.CRM_DATA.get('__api_token__');
  return stored && stored === token;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request, env }) {
  if (!await authOk(request, env)) return Response.json({ ok: false, error: '未授權' }, { status: 401, headers: CORS });
  const key = new URL(request.url).searchParams.get('key');
  if (!key || !ALLOWED_KEYS.has(key)) return Response.json({ ok: false, error: '無效 key' }, { status: 400, headers: CORS });
  const raw = await env.CRM_DATA.get(key);
  return Response.json({ ok: true, key, data: raw ? JSON.parse(raw) : null }, { headers: CORS });
}

export async function onRequestPut({ request, env }) {
  if (!await authOk(request, env)) return Response.json({ ok: false, error: '未授權' }, { status: 401, headers: CORS });
  const key = new URL(request.url).searchParams.get('key');
  if (!key || !ALLOWED_KEYS.has(key)) return Response.json({ ok: false, error: '無效 key' }, { status: 400, headers: CORS });
  const body = await request.json();
  await env.CRM_DATA.put(key, JSON.stringify(body));
  return Response.json({ ok: true }, { headers: CORS });
}

export async function onRequestPost({ request, env }) {
  if (!await authOk(request, env)) return Response.json({ ok: false, error: '未授權' }, { status: 401, headers: CORS });
  // batch read: { keys: ['nodes', 'events', ...] }
  const { keys } = await request.json();
  if (!Array.isArray(keys)) return Response.json({ ok: false, error: 'keys 必須為陣列' }, { status: 400, headers: CORS });
  const result = {};
  await Promise.all(keys.filter(k => ALLOWED_KEYS.has(k)).map(async k => {
    const raw = await env.CRM_DATA.get(k);
    result[k] = raw ? JSON.parse(raw) : null;
  }));
  return Response.json({ ok: true, data: result }, { headers: CORS });
}
