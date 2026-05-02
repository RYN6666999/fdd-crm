/**
 * GET  /api/memories  → listMemories
 * POST /api/memories  → createMemory
 */
import { corsHeaders, json, listMemories, createMemory } from './_mem-core.js';

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

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.CRM_MEMORIES;

  const origin = request.headers.get('Origin') || '';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (!authOk(request, env)) return json({ error: 'unauthorized' }, 401, origin);
  if (!kv) return json({ error: 'CRM_MEMORIES KV not bound' }, 500);

  try {
    if (request.method === 'GET') return await listMemories(request, kv);
    if (request.method === 'POST') return await createMemory(request, kv);
    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: e.message || 'Internal error' }, 500);
  }
}
