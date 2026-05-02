/**
 * /api/claude — Anthropic proxy with prompt caching
 * Expects body: { model, system, messages, max_tokens, tools? }
 * Wraps system prompt with cache_control for ~5x faster input processing.
 */

const ALLOWED_ORIGINS = ['https://fdd-crm.pages.dev', 'https://fdd.ryanliao.com'];
function buildCORS(request) {
  const origin = (request && request.headers.get('Origin')) || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Vary': 'Origin' };
}
// kept for json() calls that don't have request context
const CORS = buildCORS(null);

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authOk(request, env) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  const stored = env.CRM_API_TOKEN || '';
  return stored ? timingSafeEqual(token, stored) : false;
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: buildCORS(request) });
}

export async function onRequestPost({ request, env }) {
  if (!await authOk(request, env)) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...buildCORS(request) } });

  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set' }, 503);

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  // Wrap system prompt with cache_control (prompt caching)
  const system = typeof body.system === 'string'
    ? [{ type: 'text', text: body.system, cache_control: { type: 'ephemeral' } }]
    : body.system;

  const anthropicBody = { ...body, system };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'prompt-caching-2024-07-31',
    },
    body: JSON.stringify(anthropicBody),
  });

  const data = await res.json();
  return json(data, res.status);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
