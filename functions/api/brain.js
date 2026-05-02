/**
 * /api/brain — gbrain Railway HTTP API bridge
 *
 * Required Cloudflare secrets:
 *   GBRAIN_BASE_URL      https://gbrain-production-18fa.up.railway.app
 *   GBRAIN_TOTP_SECRET   同 Railway 上的設定
 *
 * POST { action: 'search'|'query'|'get'|'remember', ...params }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Daily OTP — HMAC-SHA256(secret, dayNumber).hex.slice(0,10)
// Matches gbrain/http/server.ts generateOtp()
async function getDailyOtp(secret) {
  const day = Math.floor(Date.now() / 86_400_000);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(String(day)),
  );
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 10);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const BASE   = env.GBRAIN_BASE_URL;
  const SECRET = env.GBRAIN_TOTP_SECRET;
  if (!BASE || !SECRET) return json({ error: 'gbrain not configured' }, 503);

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { action, query, slug, limit = 5, content, tags, source } = body;
  const otp = await getDailyOtp(SECRET);

  // ── search: keyword search ────────────────────────────────────────────────
  if (action === 'search') {
    if (!query) return json({ error: 'query required' }, 400);
    const r = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}&otp=${otp}`);
    if (!r.ok) return json({ error: `gbrain ${r.status}` }, 502);
    const data = await r.json();
    return json({ results: data.results || [] });
  }

  // ── query: hybrid semantic search ─────────────────────────────────────────
  if (action === 'query') {
    if (!query) return json({ error: 'query required' }, 400);
    const r = await fetch(`${BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `OTP ${otp}` },
      body: JSON.stringify({ query, limit }),
    });
    if (!r.ok) return json({ error: `gbrain ${r.status}` }, 502);
    const data = await r.json();
    return json({ results: data.results || [] });
  }

  // ── get: fetch single page by slug ────────────────────────────────────────
  if (action === 'get') {
    if (!slug) return json({ error: 'slug required' }, 400);
    const r = await fetch(`${BASE}/page?slug=${encodeURIComponent(slug)}&otp=${otp}`);
    if (r.status === 404) return json({ error: 'not found' }, 404);
    if (!r.ok) return json({ error: `gbrain ${r.status}` }, 502);
    return json(await r.json());
  }

  // ── remember: write a memory ──────────────────────────────────────────────
  if (action === 'remember') {
    if (!content) return json({ error: 'content required' }, 400);
    const r = await fetch(`${BASE}/page`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `OTP ${otp}` },
      body: JSON.stringify({
        content,
        slug:   slug   || undefined,
        tags:   tags   || ['fact'],
        source: source || 'fdd-crm',
      }),
    });
    if (!r.ok) return json({ error: `gbrain ${r.status}` }, 502);
    return json(await r.json());
  }

  return json({ error: `Unknown action: ${action}` }, 400);
}
