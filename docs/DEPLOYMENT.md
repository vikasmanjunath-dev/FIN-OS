# FIN-OS — Deployment Guide

> Version: 1.3 | Date: June 7, 2026 | Live: https://finos1.vercel.app

---

## IMPORTANT: No Git Repository

This project does **not** use git. There is no `.git` directory. Vercel CLI uploads all changed files directly from the working tree.

**Do not run `git add`, `git commit`, or `git push` — they have no effect and no meaning here.**

The only deploy command needed is:

```bash
cd "Initial Deployment"
vercel --prod --yes
```

`--yes` skips the interactive confirmation prompt.

---

## What Gets Deployed

Vercel hosts everything static — HTML, CSS, JS, assets, calculators, and Vercel Edge Functions.

| Deployed to Vercel | NOT deployed (local only) |
|---|---|
| `html/` — 94 pages | `voiceagent/agent.py` |
| `index.html`, `login.html` | `app.py` (News Intel Flask) |
| `css/` — 45 stylesheets | `alerts/alert-engine.py` |
| `js/` — 88 modules | `chatbot/brain.py` |
| `assets/` | `market intelligence/` |
| `calculators/` — 88 tools | `stock-engine/` |
| `manifest.json`, `sw.js` | `ExpenseTracker/finos_backend/` |
| `Porfolio Analyser/` | Ollama, Whisper, Edge TTS |
| `api/chat.js` — Edge Function | |
| `voiceagent/index.html` | |

---

## Vercel Configuration (`vercel.json`)

`vercel.json` is present at the root of `Initial Deployment/`. It controls rewrites, security headers, and CSP.

### Key sections

**Rewrites** — all paths that don't match a real file fall through to `index.html` (SPA-style fallback).

**Global headers** — applied to all routes:

- `X-Frame-Options: SAMEORIGIN` — prevents clickjacking
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy` — the `connect-src` directive includes:
  ```
  ws://127.0.0.1:* wss://127.0.0.1:* http://127.0.0.1:* wss://localhost:*
  ```
  This allows the widget on any Vercel-hosted page to connect to the local voice agent (`ws://127.0.0.1:8765`) without CSP blocking the WebSocket handshake. The `wss://` entries are retained as a fallback for any browser that upgrades the scheme.

**voiceagent/index.html override** — a specific header rule overrides X-Frame-Options for the voice agent iframe:

```json
{
  "source": "/voiceagent/index.html",
  "headers": [
    { "key": "X-Frame-Options", "value": "SAMEORIGIN" },
    { "key": "Content-Security-Policy", "value": "frame-ancestors 'self'" }
  ]
}
```

This allows `finos-widget.js` (same origin on Vercel) to embed `voiceagent/index.html` as an iframe, while still blocking third-party embedding.

---

## `api/chat.js` — Vercel Edge Function

**File:** `api/chat.js`  
**Route:** `POST /api/chat`  
**Runtime:** Vercel Edge Runtime (`export const runtime = 'edge'`)

This is a cloud AI proxy for optional cloud mode. It:

1. Receives a `POST` request with JSON body `{ messages: [...] }`.
2. Forwards the request to OpenRouter using the `OPENROUTER_API_KEY` environment variable set in the Vercel project dashboard.
3. Default model: `google/gemini-2.0-flash-001`
4. Supports streaming responses (`text/event-stream` / SSE format).
5. Returns a `502` response with error details if the upstream OpenRouter fetch fails (wrapped in `try-catch`).

**Current status:** `CLOUD_MODE = false` in `voiceagent/index.html`, so `api/chat.js` is deployed but never called. It is kept for future cloud fallback capability.

**Environment variable required (Vercel dashboard only):**
```
OPENROUTER_API_KEY=sk-or-...
```

This key must **never** appear in any browser-visible file.

---

## Deploying

### First Time Setup

```bash
npm install -g vercel
cd "Initial Deployment"
vercel login
vercel link    # link to your Vercel project
```

### Standard Deploy (production)

```bash
cd "Initial Deployment"
vercel --prod --yes
```

Vercel CLI scans all files in the directory (respecting `.vercelignore`), uploads changed files, builds the Edge Function at `api/chat.js`, and promotes to production. No git required.

---

## `.vercelignore`

```
node_modules
ExpenseTracker/finos-budget/node_modules
ExpenseTracker/finos_backend
News1/node_modules
stock-engine
__pycache__
*.pyc
.venv
.venv3
*.log
chroma_db
models
piper
voiceagent/agent.py
voiceagent/.venv
voiceagent/.finos_cert.pem
voiceagent/.finos_key.pem
voiceagent/agent.log
```

---

## Pre-Deploy Checklist

- [ ] No `localhost` URLs in HTML/JS that will run on Vercel (voice agent URLs use `127.0.0.1`, which is correct — they connect to the user's local machine)
- [ ] No `SUPABASE_SERVICE_KEY` in any browser-visible file
- [ ] Calculator folder names are lowercase (will 404 on Linux/Vercel otherwise)
- [ ] Calculator filenames match exactly what is in `js/calculators.js`
- [ ] Anti-FOUC inline script present on all new/modified HTML pages
- [ ] `finos-widget.js?v=7` — widget version is correct on all pages (currently v=7 across all 96 pages and 88 calculators)
- [ ] No hardcoded dark hex colours in new inline `<style>` blocks
- [ ] `api/` directory is present with `api/chat.js` (must not be in `.vercelignore`)
- [ ] Test with `python -m http.server 3000` before deploying

---

## Post-Deploy Verification

Run these within 60 seconds of deploy completing:

```bash
# Core pages
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app                            # 200
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app/html/calculators.html      # 200
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app/js/finos-widget.js         # 200

# Voice agent iframe
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app/voiceagent/index.html      # 200

# Edge Function (should return 405 or 400 on GET — confirms it deployed)
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app/api/chat                   # 405
```

Open https://finos1.vercel.app in incognito:
- [ ] Landing page loads without console errors
- [ ] Theme toggle works (dark/light, persists on reload)
- [ ] No FOUC (flash of wrong theme on load)
- [ ] Any changed page renders correctly in both themes
- [ ] Any changed calculator opens and renders result
- [ ] Widget chip appears on every page (`finos-widget.js?v=7` loads)
- [ ] Widget opens voice agent iframe on click

---

## Rollback

If a deploy breaks something:

```bash
# List recent deployments
vercel ls

# Roll back to a specific deployment URL
vercel rollback <deployment-url>

# Or promote a previous deployment to production
vercel promote <deployment-url>
```

---

## Vercel Project Settings

| Setting | Value |
|---|---|
| Framework preset | Other (no build step) |
| Root directory | `Initial Deployment` |
| Build command | (none — static files only, Edge Function auto-detected) |
| Output directory | `.` (root) |
| Install command | (none) |
| Node version | 18.x |

---

## Environment Variables (Vercel Dashboard)

Set these in the Vercel project dashboard under Settings → Environment Variables:

| Variable | Value | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | `sk-or-...` | Required for `api/chat.js` edge function |

---

## Monitoring

Vercel provides:
- Deployment logs: `vercel logs <deployment-url>`
- Analytics: Vercel dashboard → Analytics tab
- Edge Function logs: Vercel dashboard → Functions tab → `api/chat`

For uptime monitoring, use a free service like UptimeRobot pointing to `https://finos1.vercel.app`.

---

## Domain

Current: `finos1.vercel.app` (Vercel default)  
Custom domain: add via Vercel dashboard → Domains → Add domain → update DNS.
