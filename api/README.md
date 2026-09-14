# FIN-OS Vercel Edge Function

> Vercel Edge Runtime · OpenRouter · Gemini 2.0 Flash  
> **Route:** `POST /api/chat` | **Updated:** July 2026

Cloud AI proxy deployed as a Vercel Edge Function. Keeps the OpenRouter API key server-side while allowing the FIN-OS frontend to call cloud AI from any browser.

> **Current status:** Deployed but not active — `CLOUD_MODE = false` in `voiceagent/index.html`. The local Ollama agent is used instead. This function is kept as a production fallback.

---

## File

```
api/
└── chat.js     ← Vercel Edge Function (single file)
```

---

## What It Does

```
Browser → POST /api/chat → Vercel Edge (chat.js) → OpenRouter → Gemini 2.0 Flash
                                                               ↓
Browser ← SSE token stream ← Vercel Edge ←────────────────────┘
```

1. Receives `POST /api/chat` with `{ messages, model?, stream?, max_tokens? }`
2. Reads `OPENROUTER_API_KEY` from Vercel environment (never exposed to browser)
3. Forwards request to OpenRouter (`https://openrouter.ai/api/v1/chat/completions`)
4. Streams SSE tokens back to the browser
5. Returns `502` with error details if OpenRouter is unreachable

---

## Request Format

```javascript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [
      { role: 'system', content: 'You are Arya, a FIN-OS AI advisor.' },
      { role: 'user', content: 'What is a good SIP amount for me?' }
    ],
    model: 'google/gemini-2.0-flash-001',  // optional, this is the default
    stream: true,                           // optional, default true
    max_tokens: 2048                        // optional
  })
});
```

---

## Response

**Streaming (stream: true):** `text/event-stream` (SSE)
```
data: {"choices": [{"delta": {"content": "Based on"}}]}
data: {"choices": [{"delta": {"content": " your income"}}]}
data: [DONE]
```

**Non-streaming (stream: false):** Standard JSON completion object.

---

## Default Model

`google/gemini-2.0-flash-001` — fast, cheap, strong reasoning. Can be overridden per-request via the `model` field using any model available on OpenRouter.

---

## Error Responses

| Status | Meaning |
|---|---|
| `204` | OPTIONS preflight (CORS) |
| `405` | Method not allowed (GET, PUT, etc.) |
| `503` | `OPENROUTER_API_KEY` not configured in Vercel |
| `502` | OpenRouter upstream fetch failed (includes error details in body) |

---

## Deployment

This function is **automatically deployed** by Vercel when you run:

```bash
vercel --prod --yes
```

Vercel detects `api/chat.js` (using `export const config = { runtime: 'edge' }`) and deploys it as an Edge Function — no manual setup needed.

---

## Environment Variable (Vercel Dashboard)

```
OPENROUTER_API_KEY = sk-or-...
```

Set this in: Vercel Dashboard → Project → Settings → Environment Variables

**This key must never appear in any browser-visible file.** The entire point of this Edge Function is to keep it server-side.

---

## CORS

The function returns permissive CORS headers (`Access-Control-Allow-Origin: *`) to allow calls from `finos1.vercel.app`, local dev servers (`localhost:3000`, `:5173`), and the voice agent iframe.

---

## Activating Cloud Mode

To switch from local Ollama to this cloud fallback:

```javascript
// In voiceagent/index.html — change:
const CLOUD_MODE = false;
// to:
const CLOUD_MODE = true;
```

When `CLOUD_MODE = true`, the voice agent sends text to `/api/chat` instead of `http://localhost:11434`.
