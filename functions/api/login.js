/* ═══════════════════════════════════════
   房多多 — Pages Function: /api/login
   POST  → 寫入登入記錄
   GET   → 列出所有登入記錄（admin 用）
═══════════════════════════════════════ */

const VALID_RANKS = ['director', 'asst_mgr', 'manager', 'shop_partner', 'shop_head'];

const ALLOWED_ORIGINS = ['https://fdd-crm.pages.dev', 'https://fdd.ryanliao.com'];
function corsHeaders(request) {
  const origin = (request && request.headers.get('Origin')) || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { 'Access-Control-Allow-Origin': allowed, 'Vary': 'Origin' };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { name, rank } = body;

    if (!name || !rank) {
      return Response.json({ ok: false, error: '缺少姓名或職級' }, { status: 400 });
    }
    if (!VALID_RANKS.includes(String(rank).trim())) {
      return Response.json({ ok: false, error: '無效職級' }, { status: 400 });
    }

    const record = {
      name: String(name).trim().slice(0, 30),
      rank: String(rank).trim(),
      ts: new Date().toISOString(),
    };

    // key: user-{name} → 只保留每人最新一筆
    const key = `user-${record.name}`;
    await env.FDD_LOGINS.put(key, JSON.stringify(record), {
      expirationTtl: 60 * 60 * 24 * 30, // 30 天自動過期
    });

    return Response.json({ ok: true, record }, {
      headers: corsHeaders(request),
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function onRequestGet({ env, request }) {
  // Admin 驗證：Authorization Bearer header，對比 env.ADMIN_TOKEN
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  const adminToken = env.ADMIN_TOKEN || '';
  if (!adminToken || !timingSafeEqual(token, adminToken)) {
    return Response.json({ ok: false, error: '未授權' }, { status: 401 });
  }

  try {
    const list = await env.FDD_LOGINS.list({ prefix: 'user-' });
    const records = await Promise.all(
      list.keys.map(async ({ name: key }) => {
        const val = await env.FDD_LOGINS.get(key);
        try { return JSON.parse(val); } catch { return null; }
      })
    );

    const filtered = records.filter(Boolean).sort((a, b) =>
      new Date(b.ts) - new Date(a.ts)
    );

    return Response.json({ ok: true, records: filtered }, {
      headers: corsHeaders(request),
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// CORS preflight
export async function onRequestOptions({ request }) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
