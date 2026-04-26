/**
 * Shared KV helpers and scoring logic for CRM Memory API
 * Underscore prefix = not a Cloudflare Pages route
 */

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export function nanoid8() {
  return Math.random().toString(36).slice(2, 10);
}

// ── KV helpers ────────────────────────────────────────────

export async function getIndex(kv) {
  try { return JSON.parse(await kv.get('index') || '[]'); } catch { return []; }
}

export async function saveIndex(kv, ids) {
  await kv.put('index', JSON.stringify(ids));
}

export async function getMem(kv, id) {
  const raw = await kv.get(`mem:${id}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function saveMem(kv, mem) {
  await kv.put(`mem:${mem.id}`, JSON.stringify(mem));
}

// ── Scoring ───────────────────────────────────────────────
// score = keyword×0.4 + freshness×0.3 + usage×0.2 + type×0.1
// pinned → +999

const TYPE_WEIGHT = { rule: 1.0, fact: 0.8, episode: 0.6, style: 0.4 };

export function scoreMemory(mem, keywords) {
  if (mem.archived) return -1;

  const kw = keywords.map(k => k.toLowerCase());
  const memKw = (mem.keywords || []).map(k => k.toLowerCase());
  const summaryLow = (mem.summary || '').toLowerCase();

  let kwHits = 0;
  if (kw.length > 0) {
    for (const k of kw) {
      if (memKw.some(mk => mk.includes(k) || k.includes(mk)) || summaryLow.includes(k)) {
        kwHits++;
      }
    }
  }
  const kwScore = kw.length > 0 ? kwHits / kw.length : 0.5;

  const lastUsed = mem.lastUsedAt ? new Date(mem.lastUsedAt) : new Date(mem.createdAt);
  const daysSince = Math.max(0, (Date.now() - lastUsed.getTime()) / 86400000);
  const freshness = 1 / (1 + daysSince / 30);

  const usageNorm = Math.min(mem.usageCount || 0, 20) / 20;
  const typeW = TYPE_WEIGHT[mem.type] || 0.5;

  const score = kwScore * 0.4 + freshness * 0.3 + usageNorm * 0.2 + typeW * 0.1;
  return mem.pinned ? score + 999 : score;
}

export function extractKeywords(message) {
  const tokens = message
    .replace(/[，。！？,.!?、；:「」【】《》\s]/g, ' ')
    .split(' ')
    .map(t => t.trim())
    .filter(t => t.length >= 2);
  return [...new Set(tokens)].slice(0, 20);
}

// ── Handlers ──────────────────────────────────────────────

export async function listMemories(request, kv) {
  const url = new URL(request.url);
  const subjectFilter = url.searchParams.get('subject') || '';
  const typeFilter = url.searchParams.get('type') || '';
  const pinnedFilter = url.searchParams.get('pinned');
  const includeArchived = url.searchParams.get('includeArchived') === 'true';

  const ids = await getIndex(kv);
  const mems = (await Promise.all(ids.map(id => getMem(kv, id)))).filter(Boolean);

  const filtered = mems.filter(m => {
    if (!includeArchived && m.archived) return false;
    if (subjectFilter && !m.subject.includes(subjectFilter)) return false;
    if (typeFilter && m.type !== typeFilter) return false;
    if (pinnedFilter !== null && pinnedFilter !== '' && String(m.pinned) !== pinnedFilter) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });

  return json({ memories: filtered, total: filtered.length });
}

export async function createMemory(request, kv) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  if (!body.type || !body.subject || !body.summary) {
    return json({ error: 'Missing required fields: type, subject, summary' }, 400);
  }
  if (!['fact', 'rule', 'episode', 'style'].includes(body.type)) {
    return json({ error: 'Invalid type' }, 400);
  }
  if ((body.summary || '').length > 120) {
    return json({ error: 'summary must be <= 120 chars' }, 400);
  }

  const now = new Date().toISOString();
  const mem = {
    id: `mem_${nanoid8()}`,
    type: body.type,
    subject: body.subject,
    summary: body.summary,
    detail: body.detail || null,
    keywords: Array.isArray(body.keywords) ? body.keywords : [],
    pinned: body.pinned === true,
    archived: false,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
    source: body.source === 'auto' ? 'auto' : 'manual',
  };

  await saveMem(kv, mem);
  const ids = await getIndex(kv);
  ids.push(mem.id);
  await saveIndex(kv, ids);

  return json(mem, 201);
}

export async function updateMemory(request, kv, id) {
  const mem = await getMem(kv, id);
  if (!mem) return json({ error: 'Not found' }, 404);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  if (body.summary !== undefined) {
    if (body.summary.length > 120) return json({ error: 'summary must be <= 120 chars' }, 400);
    mem.summary = body.summary;
  }
  if (body.detail !== undefined) mem.detail = body.detail;
  if (body.keywords !== undefined) mem.keywords = Array.isArray(body.keywords) ? body.keywords : mem.keywords;
  if (body.pinned !== undefined) mem.pinned = body.pinned === true;
  if (body.archived !== undefined) {
    mem.archived = body.archived === true;
    const ids = await getIndex(kv);
    if (mem.archived) {
      await saveIndex(kv, ids.filter(i => i !== id));
    } else if (!ids.includes(id)) {
      ids.push(id); await saveIndex(kv, ids);
    }
  }

  mem.updatedAt = new Date().toISOString();
  await saveMem(kv, mem);
  return json(mem);
}

export async function deleteMemory(kv, id) {
  const mem = await getMem(kv, id);
  if (!mem) return json({ error: 'Not found' }, 404);

  mem.archived = true;
  mem.updatedAt = new Date().toISOString();
  await saveMem(kv, mem);

  const ids = await getIndex(kv);
  await saveIndex(kv, ids.filter(i => i !== id));

  return json({ success: true });
}

export async function retrieveMemories(request, kv) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body.message) return json({ error: 'message is required' }, 400);

  const topK = Math.min(Number(body.topK) || 5, 10);
  const keywords = extractKeywords(body.message);

  const currentContact = body.context?.currentContact;
  if (currentContact) {
    keywords.push(currentContact);
    // Also push 2-char CJK sub-strings
    const cjk = currentContact.replace(/[^\u4e00-\u9fff]/g, '');
    if (cjk.length >= 2) keywords.push(...(cjk.match(/.{2}/g) || []));
  }

  const ids = await getIndex(kv);
  const mems = (await Promise.all(ids.map(id => getMem(kv, id)))).filter(Boolean);

  const scored = mems
    .map(m => ({ ...m, score: scoreMemory(m, keywords) }))
    .filter(m => m.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  // Increment usage counts (fire-and-forget)
  const now = new Date().toISOString();
  scored.forEach(m => {
    const updated = { ...m, usageCount: (m.usageCount || 0) + 1, lastUsedAt: now, updatedAt: now };
    kv.put(`mem:${m.id}`, JSON.stringify(updated));
  });

  const typeLabel = { fact: '事實', rule: '規則', episode: '紀錄', style: '偏好' };
  const lines = scored.map((m, i) => `${i + 1}. [${typeLabel[m.type] || m.type}] ${m.summary}`);
  const promptSnippet = scored.length ? `你知道以下記憶：\n${lines.join('\n')}` : '';

  return json({ memories: scored, promptSnippet });
}
