# FIN-OS — Standard Operating Procedures (SOP)

**Owner:** Vikas Manjunath | **Version:** 1.2 | **Date:** June 5, 2026

---

## SOP Index

| SOP | Title | When to use |
|---|---|---|
| SOP-01 | Deploy to Vercel (Production) | Any code change to ship to finos1.vercel.app |
| SOP-02 | Start Voice Agent (Local) | Daily use of voice AI |
| SOP-03 | Start Full Local Stack | Development / all-features session |
| SOP-04 | Add a New Calculator | Adding to the 88-tool suite |
| SOP-05 | Add a New HTML Page | Adding to the 96-page platform |
| SOP-06 | Incident Response | Something breaks in production |
| SOP-07 | Database Migration | Adding new Supabase tables or columns |
| SOP-08 | Rollback a Deployment | Reverting a bad production deploy |
| SOP-09 | Debug Voice Agent | Voice not responding or wrong output |
| SOP-10 | Onboard a New Developer | Setting up from scratch |

---

## SOP-01 — Deploy to Vercel (Production)

**Triggered by:** Any code change to HTML, CSS, JS, calculators, or assets.

**Pre-deploy checklist:**
- [ ] No `localhost` hardcoded in HTML/JS that runs on Vercel
- [ ] No `SUPABASE_SERVICE_KEY` in any browser-visible file
- [ ] Calculator folder names lowercase (case-sensitive on Linux/Vercel)
- [ ] Calculator filenames match `js/calculators.js` exactly
- [ ] Anti-FOUC inline script present on all new HTML pages
- [ ] `finos-widget.js?v=N` bumped if widget changed
- [ ] No hardcoded dark hex colours in new `<style>` blocks
- [ ] Theme toggle present on new pages
- [ ] Tested locally with `python -m http.server 3000`

**Deploy steps:**
```bash
cd "Initial Deployment"
git add <specific files>
git commit -m "feat/fix/style: <description>"
vercel --prod
```

**Post-deploy verification:**
```bash
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app          # 200
# Open in incognito — verify no FOUC, both themes work, no console errors
```

**Estimated time:** 5 minutes (Vercel build ~30s)

---

## SOP-02 — Start Voice Agent (Local)

**Prerequisites:** Ollama installed, qwen3:14b pulled.

```bash
cd voiceagent
source .venv/bin/activate

# Ensure Ollama is running
ollama serve &   # or use system service

# Start agent
python agent.py
# Confirm: "Voice agent listening on ws://localhost:8765"
```

Test at: http://localhost:3000/voiceagent/index.html

**Troubleshooting:**
- `Connection refused on :8765` → agent not running; check terminal for errors
- `No Ollama models` → run `ollama pull qwen3:14b`
- `TTS silent` → check internet connection (edge-tts needs internet); or switch to piper

---

## SOP-03 — Start Full Local Stack

Open 5 terminals:

```bash
# T1 — Frontend
cd "Initial Deployment" && python -m http.server 3000

# T2 — Ollama
ollama serve

# T3 — Voice Agent
cd voiceagent && source .venv/bin/activate && python agent.py

# T4 — Alert Engine
cd alerts && source .venv/bin/activate && uvicorn alert-engine:app --port 8001

# T5 — News API
source .venv/bin/activate && python app.py
```

Verify:
```bash
curl http://localhost:8001/health    # {"status":"ok"}
curl http://localhost:5000/api/intel | python3 -c "import sys,json; print(len(json.load(sys.stdin)['items']),'news items')"
```

---

## SOP-04 — Add a New Calculator

1. Choose category folder (all lowercase names)
2. Create HTML file using calculator boilerplate (see `docs/CONTRIBUTING.md`)
3. Include anti-FOUC script, `design-tokens.css`, `theme.css`, `calculator-base.css`
4. Implement calculation logic — no external API calls (must work offline)
5. Add entry to `js/calculators.js` in correct category
6. Test locally: open in browser, verify dark + light theme, mobile layout
7. Deploy via SOP-01

---

## SOP-05 — Add a New HTML Page

1. Create `html/your-page.html`, `css/your-page.css`, `js/your-page.js`
2. Use full page boilerplate from `docs/CONTRIBUTING.md`
3. Anti-FOUC IIFE must be first child of `<head>` (before any `<link>`)
4. Include all required CSS/JS: design-tokens, base, layout, components, theme, interactions
5. Add sidebar link in `js/finos-personalization.js`
6. Test in both dark and light mode
7. Deploy via SOP-01

---

## SOP-06 — Incident Response

### P0 — Site down (HTTP non-200)

```bash
# 1. Check Vercel status
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app

# 2. Check Vercel dashboard for failed deployment
vercel ls

# 3. Roll back to last good deployment
vercel rollback <last-good-deployment-url>

# 4. Verify recovery
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app   # 200
```

### P1 — Calculator 404 on Vercel (common cause)

```
Root cause: folder or filename has uppercase letter — Linux is case-sensitive
Fix:        rename folder/file to lowercase; commit; redeploy
```

### P2 — Theme flashing (FOUC) on a page

```
Root cause: anti-FOUC script missing or placed after <link> tags
Fix:        add inline IIFE as FIRST child of <head>, before any stylesheet
```

### P3 — Hover fill visible on some element

```
Root cause: CSS fill hover not overridden by interactions.css
Fix:        add rule to interactions.css with !important, or fix source CSS
```

### P4 — Voice agent not connecting

```
Root cause: agent.py not running or port 8765 in use
Fix:        restart agent; check `lsof -i :8765`
```

---

## SOP-07 — Database Migration

```bash
# 1. Write migration SQL
# 2. Test in Supabase SQL editor (staging project if available)
# 3. Apply to production via SQL editor

# Example: add column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fire_number numeric;

# 4. Update DATABASE.md with new column
# 5. Update any JS that reads/writes the column
```

**Never run destructive SQL (DROP, TRUNCATE) without a backup.**

---

## SOP-08 — Rollback a Deployment

```bash
# List recent deployments
vercel ls

# Roll back
vercel rollback <deployment-url>

# Or promote a previous deployment
vercel promote <deployment-url>
```

---

## SOP-09 — Debug Voice Agent

**Issue: Agent connects but gives wrong answer**
- Check `sessionStorage.FINOS_CTX` in browser console — does it have user data?
- Add `console.log` in `voiceagent/agent.py` to print the full context being injected
- Verify `agent_memories` table in Supabase has correct memories

**Issue: TTS silent**
- Test edge-tts directly: `python -c "import asyncio, edge_tts; asyncio.run(edge_tts.Communicate('test', 'en-IN-NeerjaNeural').save('test.mp3'))"`
- If fails → no internet. Switch to Piper: set `USE_PIPER=true` in `.env`

**Issue: STT inaccurate**
- Whisper tiny is fast but less accurate — switch to `small` or `base` model in `.env`
- Check microphone: `python -c "import sounddevice; print(sounddevice.query_devices())"`

---

## SOP-10 — Onboard a New Developer

1. Clone repo: `git clone https://github.com/vikasmanjunath-dev/Hexa-Mind.git`
2. Read `docs/ARCHITECTURE.md` first (30 min)
3. Start frontend: `cd "Initial Deployment" && python -m http.server 3000`
4. Browse: http://localhost:3000 — explore all 96 pages
5. Read `docs/CONTRIBUTING.md` (page + calculator boilerplate, CSS tokens, hover rules)
6. Set up voice agent per `docs/SETUP.md` SOP-02
7. Ask for Supabase credentials (`.env` values)
8. First task: add a calculator to a category using SOP-04
