# FIN-OS — Deployment Guide

> Vercel (frontend static) · Live: https://finos1.vercel.app

---

## What Gets Deployed

Vercel hosts everything that is static — HTML, CSS, JS, assets, calculators. It is a pure CDN with no server-side execution.

| Deployed to Vercel | NOT deployed (local only) |
|---|---|
| `html/` — 76 pages | `voiceagent/agent.py` |
| `css/` — stylesheets | `app.py` (News Intel Flask) |
| `js/` — modules | `alerts/alert-engine.py` |
| `assets/` — images + icons | `chatbot/brain.py` |
| `calculators/` — 87 tools | `market intelligence/` |
| `index.html`, `login.html` | `stock-engine/` |
| `manifest.json`, `sw.js` | `ExpenseTracker/finos_backend/` |
| `Porfolio Analyser/` | Ollama, Whisper, Edge TTS |

---

## Vercel Configuration

### `.vercelignore`

Files and directories excluded from the Vercel build:

```
node_modules
ExpenseTracker/finos-budget/node_modules
ExpenseTracker/finos_backend
News1/node_modules
stock-engine
.git
__pycache__
*.pyc
.venv
*.log
chroma_db
models
piper
```

### `vercel.json` (if present)

No build step is needed. Vercel serves static files directly. There is no `vercel.json` because the defaults work — every file is served as-is.

---

## Deploying

### First Time Setup

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. From the project root:
   ```bash
   cd "Initial Deployment"
   vercel --prod
   ```

3. Follow the prompts:
   - Link to existing project: `fin-os`
   - Owner: `vikas-manjunath-s-projects`

### Subsequent Deploys

```bash
vercel --prod
```

Or push to the `main` branch on GitHub — Vercel auto-deploys on push if CI is connected.

### Via Claude Code / Vercel Plugin

The project is configured in `.claude/launch.json` and `.vercel/repo.json` for Vercel plugin deployment from Claude Code.

---

## Deployment Checklist

Before deploying, verify these common issues:

### 1. Calculator folder names must be lowercase

Vercel runs on Linux (case-sensitive). `calculators/Investment & Wealth/` will 404. Must be `calculators/investment & wealth/`.

Current state: all 9 category folders in `calculators/` are already lowercase. Do not rename them to title case.

### 2. Calculator filenames must match exactly

Three files have non-obvious names (historical typos kept as canonical):
- `calculators/investment & wealth/lupsum.html` (not `lumpsum.html`)
- `calculators/tax & salary/captalgains.html` (not `capitalgains.html`)
- `calculators/retirement & life planning/lifeexpentancy.html` (not `lifeexpectancy.html`)

The `js/calculators.js` references these exact filenames. Do not rename the files without also updating `calculators.js`.

### 3. `calculators.js` path prefix

Links are built as `../${cat.folder}/${c.file}`. The `calculators.html` page is in `html/`, so `../calculators/` correctly resolves to the root-level `calculators/` folder. Do not remove the `../`.

### 4. PWA service worker cache

The service worker (`sw.js`) caches HTML pages with a network-first strategy. After deploy, users on cached versions will get the new content on next navigation (network-first falls through to cache only if offline). No manual cache-busting needed.

### 5. `finos-widget.js` version param

When making changes to `finos-widget.js`, `finos-context.js`, or `finos-alerts.js`, increment the `?v=N` query param in any HTML files that import them. This forces cache refresh for returning users.

Example:
```html
<script src="../js/finos-widget.js?v=5"></script>
```

---

## Environment Variables on Vercel

The frontend uses only the Supabase anon key, which is embedded directly in `js/auth.js` — it is safe in browser code because RLS protects all data.

No environment variables need to be set in the Vercel dashboard for normal operation.

If you ever add server-side Vercel Functions, set secrets via:
```bash
vercel env add SUPABASE_SERVICE_KEY
```

---

## Post-Deploy Verification

After each deploy, verify:

```bash
# 1. Main frontend
curl -I https://finos1.vercel.app                   # 200

# 2. A calculator
curl -I https://finos1.vercel.app/calculators/investment%20%26%20wealth/sip.html   # 200

# 3. A JS module
curl -I https://finos1.vercel.app/js/finos-widget.js  # 200

# 4. Service worker
curl -I https://finos1.vercel.app/sw.js               # 200

# 5. PWA manifest
curl -I https://finos1.vercel.app/manifest.json        # 200
```

Open the live URL in an incognito window and check:
- [ ] Home page loads
- [ ] Navigation works
- [ ] Open any calculator — it should render on first load (no refresh needed)
- [ ] Browser console has no 404 errors

---

## Vercel Project Details

| Property | Value |
|---|---|
| Project name | `fin-os` |
| Owner | `vikas-manjunath-s-projects` |
| Production alias | `finos1.vercel.app` |
| GitHub repo | `vikasmanjunath-dev/Hexa-Mind` |
| Build command | none (static) |
| Output directory | `.` (root) |
| Node version | not required |

---

## Rollback

If a deploy breaks something:

```bash
# List recent deployments
vercel ls

# Promote a previous deployment to production
vercel alias set <deployment-url> finos1.vercel.app
```

Or in the Vercel dashboard: Deployments tab → click any previous deployment → "Promote to Production".
