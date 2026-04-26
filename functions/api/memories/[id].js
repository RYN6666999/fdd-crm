/**
 * PUT    /api/memories/:id → updateMemory
 * DELETE /api/memories/:id → deleteMemory (soft archive)
 */
import { CORS, json, updateMemory, deleteMemory } from '../_mem-core.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const kv = env.CRM_MEMORIES;
  const id = params.id;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!kv) return json({ error: 'CRM_MEMORIES KV not bound' }, 500);
  if (!id) return json({ error: 'Missing id' }, 400);

  try {
    if (request.method === 'PUT') return await updateMemory(request, kv, id);
    if (request.method === 'DELETE') return await deleteMemory(kv, id);
    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: e.message || 'Internal error' }, 500);
  }
}
