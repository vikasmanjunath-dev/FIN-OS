/**
 * FIN-OS AI — Vercel Edge Function
 * Proxies chat requests to OpenRouter, keeping the API key server-side.
 * POST /api/chat  { messages, model?, stream?, max_tokens? }
 */
export const config = { runtime: 'edge' };

const DEFAULT_MODEL  = 'google/gemini-2.0-flash-001';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OPENROUTER_API_KEY is not set in Vercel environment variables. Add it in your Vercel project → Settings → Environment Variables.' }),
      { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }

  const {
    messages,
    model      = DEFAULT_MODEL,
    stream     = true,
    max_tokens = 1024,
  } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(
      JSON.stringify({ error: '`messages` must be a non-empty array' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }

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
      body: JSON.stringify({ model, messages, stream, max_tokens }),
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Could not reach OpenRouter: ' + e.message }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }

  if (!upstream.ok) {
    const errText = await upstream.text();
    return new Response(errText, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type':      stream ? 'text/event-stream; charset=utf-8' : 'application/json',
      'Cache-Control':     'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      ...corsHeaders(),
    },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
