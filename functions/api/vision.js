/**
 * /api/vision — Gemini Flash vision proxy
 * POST { image: base64string, mime: 'image/webp', prompt?: string }
 * Returns { text: string }
 * Env: GEMINI_API_KEY
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const GEMINI_MODEL = 'gemini-2.0-flash';

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: 'GEMINI_API_KEY not configured' }, 503);

  let body;
  try { body = await request.json(); } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { image, mime = 'image/jpeg', prompt = '請詳細描述這張圖片的內容，包含所有文字、數字、圖表、人物或重要細節。用繁體中文回答。' } = body;
  if (!image) return json({ error: 'image (base64) required' }, 400);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mime, data: image } },
        { text: prompt },
      ],
    }],
    generationConfig: { maxOutputTokens: 1024, temperature: 0.2 },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return json({ error: `Gemini ${res.status}: ${errText.slice(0, 200)}` }, 502);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return json({ text });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
