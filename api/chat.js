/**
 * FIN-OS AI — Vercel Edge Function
 * Proxies chat requests to OpenRouter, keeping the API key server-side.
 * POST /api/chat  { messages, model?, stream?, max_tokens? }
 */
export const config = { runtime: 'edge' };

const DEFAULT_MODEL  = 'google/gemini-2.0-flash-001';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// This endpoint spends the OWNER'S OpenRouter credit, and anyone who can reach it can call it. So the caller does not get to choose
// the model (an expensive one would drain the account), the size of the request, or the length of the answer.
// Change the allow-list here, in code review, not per request.
const ALLOWED_MODELS    = new Set([DEFAULT_MODEL]);
const MAX_MESSAGES      = 30;
const MAX_MESSAGE_CHARS = 8000;
const MAX_TOTAL_CHARS   = 24000;
const MAX_TOKENS_CAP    = 1024;
const MAX_BODY_BYTES    = 64 * 1024;
const ROLES             = new Set(['system', 'user', 'assistant']);

// Origins whose pages may call this from a browser (CORS). This is not authentication - curl ignores it - it only stops other
// websites from using visitors' browsers to spend the credit. Add production domains here.
const ALLOWED_ORIGINS = [/^https:\/\/finos1\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

// Best-effort limit per client address, per warm Edge instance (instances do not share memory, so this is a brake, not a quota).
// A real quota needs shared state (Vercel WAF rate limiting, or a key-value store): see docs/agent-notes/backend-security.md.
const RATE_MAX = 20, RATE_WINDOW_MS = 60 * 1000;
const hits = new Map();

function rateLimited(ip, now = Date.now()) {
  if (hits.size > 5000) { for (const [k, v] of hits) if (now - v.start > RATE_WINDOW_MS) hits.delete(k); if (hits.size > 5000) hits.clear(); }
  const h = hits.get(ip);
  if (!h || now - h.start > RATE_WINDOW_MS) { hits.set(ip, { start: now, n: 1 }); return false; }
  h.n += 1;
  return h.n > RATE_MAX;
}

function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Body must be a JSON object' };
  const { messages, model = DEFAULT_MODEL, stream = true, max_tokens = MAX_TOKENS_CAP } = body;
  if (!Array.isArray(messages) || messages.length === 0) return { error: '`messages` must be a non-empty array' };
  if (messages.length > MAX_MESSAGES) return { error: `At most ${MAX_MESSAGES} messages` };
  if (typeof model !== 'string' || !ALLOWED_MODELS.has(model)) return { error: 'Model not allowed' };
  let total = 0;
  const clean = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object' || !ROLES.has(m.role) || typeof m.content !== 'string') {
      return { error: 'Each message needs a role (system|user|assistant) and a string content' };
    }
    if (m.content.length > MAX_MESSAGE_CHARS) return { error: `A message is longer than ${MAX_MESSAGE_CHARS} characters` };
    total += m.content.length;
    clean.push({ role: m.role, content: m.content });          // nothing else (tool calls, names, ...) is forwarded
  }
  if (total > MAX_TOTAL_CHARS) return { error: 'Conversation is too long' };
  const tokens = Math.min(Math.max(parseInt(max_tokens, 10) || MAX_TOKENS_CAP, 1), MAX_TOKENS_CAP);
  return { payload: { model, messages: clean, stream: stream !== false, max_tokens: tokens } };
}

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';
  const cors = corsHeaders(origin);
  const json = (obj, status, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors, ...extra } });

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: cors });
  }
  if (origin && !cors['Access-Control-Allow-Origin']) {
    return json({ error: 'Origin not allowed' }, 403);
  }

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return json({ error: 'Too many requests' }, 429, { 'Retry-After': '60' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return json({ error: 'The AI service is not configured on this deployment.' }, 503);
  }

  const declared = parseInt(req.headers.get('content-length') || '0', 10);
  if (declared > MAX_BODY_BYTES) return json({ error: 'Request too large' }, 413);
  let body;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: 'Request too large' }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const v = validate(body);
  if (v.error) return json({ error: v.error }, 400);

  let upstream;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':  'https://finos1.vercel.app',
        'X-Title':       'FIN-OS AI',
      },
      body: JSON.stringify(v.payload),
    });
  } catch {
    return json({ error: 'Could not reach the AI provider' }, 502);
  }

  if (!upstream.ok) {
    // the provider's error body can name the account, key prefix or model; the caller gets the status only
    return json({ error: 'The AI provider returned an error', status: upstream.status }, upstream.status === 429 ? 429 : 502);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type':      v.payload.stream ? 'text/event-stream; charset=utf-8' : 'application/json',
      'Cache-Control':     'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      ...cors,
    },
  });
}

function corsHeaders(origin = '') {
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.some(rx => rx.test(origin))) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

