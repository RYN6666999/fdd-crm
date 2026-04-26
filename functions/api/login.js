/* ═══════════════════════════════════════
   房多多 — Pages Function: /api/login
   POST  → 寫入登入記錄
   GET   → 列出所有登入記錄（admin 用）
═══════════════════════════════════════ */

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { name, rank } = body;

    if (!name || !rank) {
      return Response.json({ ok: false, error: '缺少姓名或職級' }, { status: 400 });
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
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function onRequestGet({ env, request }) {
  // 簡易 admin 驗證：需帶 ?token=fdd-admin
  const url = new URL(request.url);
  if (url.searchParams.get('token') !== 'fdd-admin') {
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
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
