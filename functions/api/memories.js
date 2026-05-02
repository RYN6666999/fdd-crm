/**
 * GET  /api/memories  → listMemories
 * POST /api/memories  → createMemory
 */
import { CORS, json, listMemories, createMemory } from './_mem-core.js';

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authOk(request, env) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return false;
  const stored = await env.CRM_DATA.get('__api_token__');
  return stored ? timingSafeEqual(token, stored) : false;
}

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.CRM_MEMORIES;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  if (!await authOk(request, env)) return json({ error: 'unauthorized' }, 401);
  if (!kv) return json({ error: 'CRM_MEMORIES KV not bound' }, 500);

  try {
    if (request.method === 'GET') return await listMemories(request, kv);
    if (request.method === 'POST') return await createMemory(request, kv);
    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: e.message || 'Internal error' }, 500);
  }
}
