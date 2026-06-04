# FIN-OS — Deployment Guide

> Version: 1.2 | Date: June 5, 2026 | Live: https://finos1.vercel.app

---

## What Gets Deployed

Vercel hosts everything static — HTML, CSS, JS, assets, calculators. No server-side execution.

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

---

## Vercel Configuration

### `.vercelignore`

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
.venv3
*.log
chroma_db
models
piper
```

No `vercel.json` required — Vercel serves static files directly from the root.

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

# 1. Stage specific files
git add html/ css/ js/ calculators/ assets/ index.html login.html

# 2. Verify no issues
git diff --stat --cached

# 3. Commit
git commit -m "feat: <description>"

# 4. Deploy
vercel --prod
```

### Pre-Deploy Checklist

- [ ] No `localhost` URLs in HTML/JS that will run on Vercel
- [ ] No `SUPABASE_SERVICE_KEY` in any browser-visible file
- [ ] Calculator folder names are lowercase (will 404 on Linux otherwise)
- [ ] Calculator filenames match exactly what is in `js/calculators.js`
- [ ] Anti-FOUC inline script present on all new/modified HTML pages
- [ ] `finos-widget.js?v=N` query param bumped if the widget changed
- [ ] No hardcoded dark hex colours in new inline `<style>` blocks
- [ ] Test with `python -m http.server 3000` before deploying

### Post-Deploy Verification (within 60 seconds)

```bash
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app              # 200
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app/html/calculators.html  # 200
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app/js/finos-widget.js     # 200
```

Open https://finos1.vercel.app in incognito:
- [ ] Landing page loads without console errors
- [ ] Theme toggle works (dark/light, persists on reload)
- [ ] No FOUC (flash of wrong theme on load)
- [ ] Any changed page renders correctly in both themes
- [ ] Any changed calculator opens and renders result

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
| Build command | (none) |
| Output directory | `.` (root) |
| Install command | (none) |
| Node version | 18.x |

---

## Monitoring

Vercel provides:
- Deployment logs: `vercel logs <deployment-url>`
- Analytics: Vercel dashboard → Analytics tab
- Function logs: n/a (no serverless functions)

For uptime monitoring, use a free service like UptimeRobot pointing to `https://finos1.vercel.app`.

---

## Domain

Current: `finos1.vercel.app` (Vercel default)  
Custom domain: add via Vercel dashboard → Domains → Add domain → update DNS.
