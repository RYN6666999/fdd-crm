export const onRequestPost = async ({ request, env }) => {
  try {
    const { provider, body } = await request.json();
    if (!provider || !body) return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body)
      });
      const d = await res.json();
      return new Response(JSON.stringify(d), { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }
    if (provider === 'gemini') {
      const model = body.model || 'gemini-2.0-flash';
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const d = await res.json();
      return new Response(JSON.stringify(d), { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify(body)
      });
      const d = await res.json();
      return new Response(JSON.stringify(d), { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }
    if (provider === 'openrouter') {
      const key = body.api_key || env.OPENROUTER_API_KEY;
      if (!key) return new Response(JSON.stringify({ error: 'no_openrouter_key' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      const { api_key, ...cleanBody } = body;
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify(cleanBody)
      });
      const d = await res.json();
      return new Response(JSON.stringify(d), { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'unsupported_provider' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'server_error', message: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
