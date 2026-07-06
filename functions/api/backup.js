/* ═══════════════════════════════════════
   Data Backup — /api/backup
   無需 token，同源自動備份
   GET  /api/backup              → 讀取最新備份
   PUT  /api/backup              → 寫入備份（全量）
   POST /api/backup?schemas      → 寫入 schemas 對照版號
═══════════════════════════════════════ */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const BACKUP_KEY = 'auto-backup';
const SCHEMA_KEY = 'auto-backup-schema';

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

/** GET: 讀取最新備份 */
export async function onRequestGet({ env }) {
  const raw = await env.CRM_DATA.get(BACKUP_KEY);
  return Response.json({ ok: true, data: raw ? JSON.parse(raw) : null }, { headers: CORS });
}

/** PUT: 寫入全量備份 */
export async function onRequestPut({ request, env }) {
  const body = await request.json();
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, error: '無效資料' }, { status: 400, headers: CORS });
  }
  // 包裝 wrapper：時間 + 裝置 ID + schema 版號
  const wrapper = {
    data: body,
    ts: Date.now(),
    device: request.headers.get('X-Device-Id') || 'unknown',
    schema: body._schema || 1,
  };
  await env.CRM_DATA.put(BACKUP_KEY, JSON.stringify(wrapper));
  return Response.json({ ok: true, ts: wrapper.ts }, { headers: CORS });
}

/** POST ?schemas: 儲存 schema 版號（標記版本） */
export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.has('schemas')) {
    const body = await request.json();
    await env.CRM_DATA.put(SCHEMA_KEY, JSON.stringify(body));
    return Response.json({ ok: true }, { headers: CORS });
  }
  // 同 PUT
  return onRequestPut({ request, env });
}