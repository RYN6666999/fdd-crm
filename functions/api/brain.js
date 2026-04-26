/**
 * /api/brain — GBrain knowledge search via Supabase REST API
 * No pg package needed — pure fetch against PostgREST.
 * Requires env vars: SUPABASE_URL, SUPABASE_ANON_KEY
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const SUPA_URL  = env.SUPABASE_URL;
  const SUPA_KEY  = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY;

  if (!SUPA_URL || !SUPA_KEY) return json({ error: 'Supabase not configured' }, 503);

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { action, query, slug, limit = 5 } = body;

  const supaFetch = (path, opts = {}) => fetch(new URL(`/rest/v1${path}`, SUPA_URL).href, {
    ...opts,
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
      ...(opts.headers || {}),
    },
  });

  if (action === 'search') {
    if (!query) return json({ error: 'query required' }, 400);

    // Search title + compiled_truth separately, merge and deduplicate
    const q = query.trim();
    const mkParams = (col) => {
      const p = new URLSearchParams();
      p.set('select', 'slug,title,compiled_truth');
      p.set(col, `ilike.*${q}*`);
      p.set('limit', String(limit));
      return p.toString();
    };
    const [rTitle, rBody] = await Promise.all([
      supaFetch(`/pages?${mkParams('title')}`),
      supaFetch(`/pages?${mkParams('compiled_truth')}`),
    ]);

    const titleRows = rTitle.ok ? await rTitle.json() : [];
    const bodyRows  = rBody.ok  ? await rBody.json()  : [];

    const titleSlugs = new Set(titleRows.map(r => r.slug));
    const seen = new Set();
    const results = [];
    for (const row of [...titleRows, ...bodyRows]) {
      if (seen.has(row.slug)) continue;
      seen.add(row.slug);
      results.push({
        slug:    row.slug,
        title:   row.title,
        excerpt: (row.compiled_truth || '').slice(0, 400),
        score:   titleSlugs.has(row.slug) ? 2 : 1,
      });
    }

    return json({ results: results.slice(0, limit) });
  }

  if (action === 'get') {
    if (!slug) return json({ error: 'slug required' }, 400);
    const r = await supaFetch(`/pages?slug=eq.${encodeURIComponent(slug)}&select=slug,title,compiled_truth&limit=1`);
    if (!r.ok) return json({ error: 'fetch failed' }, 502);
    const rows = await r.json();
    if (!rows.length) return json({ error: 'not found' }, 404);
    return json(rows[0]);
  }

  return json({ error: `Unknown action: ${action}` }, 400);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
