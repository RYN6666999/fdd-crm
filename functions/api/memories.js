/**
 * GET  /api/memories  → listMemories
 * POST /api/memories  → createMemory
 */
import { CORS, json, listMemories, createMemory } from './_mem-core.js';

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.CRM_MEMORIES;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!kv) return json({ error: 'CRM_MEMORIES KV not bound' }, 500);

  try {
    if (request.method === 'GET') return await listMemories(request, kv);
    if (request.method === 'POST') return await createMemory(request, kv);
    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: e.message || 'Internal error' }, 500);
  }
}
