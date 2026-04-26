/**
 * /api/claude — Anthropic proxy with prompt caching
 * Expects body: { model, system, messages, max_tokens, tools? }
 * Wraps system prompt with cache_control for ~5x faster input processing.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
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
