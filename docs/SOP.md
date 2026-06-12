# FIN-OS — Standard Operating Procedures (SOP)

**Owner:** Vikas Manjunath | **Version:** 1.3 | **Date:** June 7, 2026

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

**Triggered by:** Any code change to HTML, CSS, JS, calculators, `api/chat.js`, or assets.

> **⚠️ This project has NO git repository. Do not run `git add`, `git commit`, or `git push`.  
> Vercel CLI uploads changed files directly from the working tree.**

**Pre-deploy checklist:**
- [ ] No `localhost` hardcoded in HTML/JS that will run on Vercel — voice agent URLs correctly use `127.0.0.1` (connects to user's local machine from browser)
- [ ] No `SUPABASE_SERVICE_ROLE_KEY` in any browser-visible file
- [ ] Calculator folder names lowercase (Vercel/Linux is case-sensitive)
- [ ] Calculator filenames match entries in `js/calculators.js` exactly
- [ ] Anti-FOUC inline `<script>` present as **first child of `<head>`** on all new HTML pages
- [ ] `finos-widget.js?v=7` — current version; bump to `?v=8` if `finos-widget.js` changed
- [ ] All new/modified pages include the widget: `<script src="[relative path]/js/finos-widget.js?v=7"></script>` before `</body>`
- [ ] No hardcoded dark hex colours in new inline `<style>` blocks (use CSS tokens)
- [ ] Theme toggle present on new pages
- [ ] `api/` directory contains `api/chat.js` and is not in `.vercelignore`
- [ ] No sensitive local files (`.env`, `.finos_cert.pem`, `.finos_key.pem`) are in the deploy set (check `.vercelignore`)
- [ ] Tested locally with `python -m http.server 3000` before deploying

**Deploy command (the only one needed):**
```bash
cd "Initial Deployment"
vercel --prod --yes
```

**Post-deploy verification (within 60 seconds):**
```bash
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app                         # 200
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app/html/calculators.html   # 200
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app/js/finos-widget.js      # 200
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app/voiceagent/index.html   # 200
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app/api/chat               # 405
```

Open https://finos1.vercel.app in incognito — verify:
- [ ] No FOUC, both themes work
- [ ] Widget FAB visible on every page
- [ ] Widget opens and iframe loads (shows voice agent UI)
- [ ] No console errors

**Estimated time:** 3–5 minutes (Vercel build ~45 s)

---

## SOP-02 — Start Voice Agent (Local)

**Prerequisites:** Ollama installed and running, at least one LLM model pulled (see model guide below).

### Step 1 — Kill any leftover process on port 8765

```bash
lsof -ti :8765 | xargs kill -9 2>/dev/null
echo "Port 8765 is free"
```

If `PORT FREE` prints — proceed. If you see another process — wait 2 seconds and repeat.

### Step 2 — Start Ollama (if not already running)

```bash
ollama serve
```

Confirm with: `curl -s http://localhost:11434/api/tags | python3 -m json.tool`

### Step 3 — Activate venv and start agent

```bash
cd voiceagent
source .venv/bin/activate      # macOS / Linux
# .venv\Scripts\activate       # Windows

python agent.py
```

### Step 4 — Expected terminal output

```
INFO  fin-os: Listening on ws://127.0.0.1:8765
INFO  fin-os: Whisper tiny ready
INFO  fin-os: Ollama warmed up (qwen2.5:3b)
INFO  fin-os: TTS warmed up (en-IN-PrabhatNeural)
INFO  fin-os: Ready — FIN-OS AI is live ✅
```

Open https://finos1.vercel.app → click the AI FAB → widget shows **ONLINE** (green dot).

**Model preference guide:**

| Model | RAM needed | Latency | Quality |
|---|---|---|---|
| `qwen2.5:3b` | ~4 GB | **Fastest** | Good |
| `qwen3:4b` | ~6 GB | Fast | Better |
| `qwen3:8b` | ~10 GB | Moderate | High |
| `qwen3:14b` | ~16 GB | Slowest | Best |

Pull with `ollama pull <model-name>`. The agent auto-selects the smallest available model.

**Troubleshooting:**

| Symptom | Root cause | Fix |
|---|---|---|
| `OSError: [Errno 48] address already in use` | Old agent.py still running | `lsof -ti :8765 \| xargs kill -9` |
| Widget shows OFFLINE | Cert not trusted by browser | Visit `https://127.0.0.1:8765`, click Advanced → Proceed |
| Widget shows OFFLINE | agent.py not started | Run `python agent.py` in voiceagent/ |
| `No Ollama models found` | No model pulled | `ollama pull qwen2.5:3b` |
| TTS silent | No internet | edge-tts needs internet; or switch to Piper |
| STT inaccurate | Using tiny model | Change `WHISPER_SIZE=small` in `.env` |

---

## SOP-03 — Start Full Local Stack

Open 5 terminals:

```bash
# T1 — Frontend
cd "Initial Deployment" && python -m http.server 3000

# T2 — Ollama LLM
ollama serve

# T3 — Voice Agent (ws://127.0.0.1:8765)
cd voiceagent && source .venv/bin/activate && python agent.py

# T4 — Alert Engine (http://127.0.0.1:8001)
cd alerts && source .venv/bin/activate && uvicorn alert-engine:app --host 127.0.0.1 --port 8001

# T5 — News API (http://127.0.0.1:5000)
source .venv/bin/activate && python app.py
```

Verify all services:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000             # 200
curl -s http://localhost:11434/api/tags | python3 -m json.tool           # lists models
curl -s http://localhost:8001/health                                     # {"status":"ok"}
curl -s http://localhost:5000/api/intel | python3 -c \
    "import sys,json; print(len(json.load(sys.stdin)['items']),'items')" # N items
nc -z 127.0.0.1 8765 && echo "Agent online" || echo "Agent not running" # Agent online
```

---

## SOP-04 — Add a New Calculator

1. Choose the correct category folder under `calculators/` (all folder names lowercase).
2. Create `calculators/[category]/[name].html` using the calculator boilerplate in `docs/CONTRIBUTING.md`.
3. Required includes in every calculator HTML:
   - Anti-FOUC IIFE as **first child of `<head>`** (before any `<link>`)
   - `../../css/design-tokens.css`
   - `../../css/theme.css`
   - `../../css/calculator-base.css` (if it exists)
   - `<script src="../../js/finos-widget.js?v=7"></script>` before `</body>`
4. Implement calculation logic — no external API calls (must work offline).
5. Add an entry to `js/calculators.js` in the correct category block.
6. Test locally: open in browser (`http://localhost:3000/calculators/[category]/[name].html`).
   - Verify dark + light theme, mobile layout, calculation correctness.
7. Deploy via SOP-01 (`vercel --prod --yes`).

---

## SOP-05 — Add a New HTML Page

1. Create `html/your-page.html`, `css/your-page.css`, `js/your-page.js`.
2. Use the full page boilerplate from `docs/CONTRIBUTING.md`.
3. Anti-FOUC IIFE must be **first child of `<head>`** (before any `<link>`).
4. Required CSS (in load order): `design-tokens.css`, `base.css`, `layout.css`, `components.css`, `theme.css`, `interactions.css`, `your-page.css`.
5. Include widget before `</body>`: `<script src="../js/finos-widget.js?v=7"></script>`.
6. Add sidebar link in `js/finos-personalization.js` if the page belongs in the nav.
7. Add page to `FINOS_PAGES` array in `voiceagent/index.html` with appropriate keywords for voice navigation.
8. Test in both dark and light mode; test voice navigation ("take me to [page name]").
9. Deploy via SOP-01.

---

## SOP-06 — Incident Response

### P0 — Site down (HTTP non-200)

```bash
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app        # should be 200

vercel ls                                                                 # list recent deployments
vercel rollback <last-good-deployment-url>                               # roll back

curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app        # confirm 200
```

### P1 — Calculator 404 on Vercel

```
Root cause: folder or filename has uppercase letter — Linux is case-sensitive
Fix:        rename to lowercase; redeploy
```

### P2 — Theme FOUC on a page

```
Root cause: anti-FOUC script missing or placed after <link> tags
Fix:        add inline IIFE as FIRST child of <head>, before any stylesheet
```

### P3 — Hover fill visible (not overridden)

```
Root cause: CSS fill hover not overridden by interactions.css
Fix:        add rule to interactions.css with !important, or fix source CSS
```

### P4 — Voice agent widget shows OFFLINE

```
Priority check:
1. Is agent.py running?        lsof -ti :8765 — should show Python process
2. Is the cert trusted?        Visit https://127.0.0.1:8765 in browser → trust it
3. Is port in use?             lsof -ti :8765 | xargs kill -9 → restart agent
4. Is Ollama running?          curl http://localhost:11434/api/tags
5. Check agent.py logs         — look for SSL or bind errors
```

### P5 — Widget iframe shows "refused to connect"

```
Root cause: voiceagent/index.html X-Frame-Options was DENY on Vercel
Status:     FIXED in vercel.json — voiceagent/index.html override sets SAMEORIGIN
Fix if recurring: verify vercel.json has the /voiceagent/index.html header override
```

### P6 — Navigation ("take me to X") not working

```
Root cause A: user's phrasing doesn't include a NAV_TRIGGER word AND keyword score < 5
Root cause B: page not in FINOS_PAGES array in voiceagent/index.html
Fix:          add keywords to the matching FINOS_PAGES entry; or add a new entry
```

---

## SOP-07 — Database Migration

```bash
# 1. Write migration SQL
# 2. Test in Supabase SQL editor (staging project if available)
# 3. Apply to production via SQL editor:
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fire_number numeric;

# 4. Update DATABASE.md with new column
# 5. Update any JS/Python that reads/writes the column
```

**Never run destructive SQL (DROP, TRUNCATE) without a Supabase backup.**

---

## SOP-08 — Rollback a Deployment

```bash
vercel ls                                        # list recent deployments (newest first)
vercel rollback <deployment-url>                 # roll back to a specific deployment
# OR
vercel promote <deployment-url>                  # promote any past deployment to production
```

---

## SOP-09 — Debug Voice Agent

**Agent connects (ONLINE) but gives wrong answer:**
- Check `sessionStorage.FINOS_USER_CONTEXT` in browser DevTools → Application → Session Storage
- Verify the context has correct `identity`, `financial`, `page_module`
- Print `_userCtx` in `agent.py` to confirm the injected prompt

**TTS silent:**
```bash
# Test edge-tts directly:
python -c "import asyncio, edge_tts; asyncio.run(edge_tts.Communicate('hello', 'en-IN-PrabhatNeural').save('/tmp/test.mp3'))"
open /tmp/test.mp3
# If fails → no internet. Set USE_PIPER=true in .env for fully offline TTS.
```

**STT inaccurate:**
- Change `WHISPER_SIZE=small` or `WHISPER_SIZE=base` in `voiceagent/.env` for better accuracy at cost of speed.
- Check mic: `python -c "import sounddevice; print(sounddevice.query_devices())"`

**High latency:**
1. Check which model Ollama is running: `curl -s http://localhost:11434/api/ps`
2. If running `qwen3:14b` — switch to `qwen2.5:3b` in `voiceagent/.env`
3. Check `num_ctx` in `agent.py` — should be `8192` (not 32768)
4. Check `HISTORY_TURNS` — should be `5` (not 10)

**"address already in use" on port 8765:**
```bash
lsof -ti :8765 | xargs kill -9
python agent.py
```

**ws:// connection refused / agent not reachable:**
- Confirm `agent.py` is running: `lsof -i :8765`
- Confirm the widget URL is `ws://127.0.0.1:8765` (not wss://) in `voiceagent/index.html`
- No SSL certs or browser trust step needed — plain ws:// local connection

---

## SOP-10 — Onboard a New Developer

1. **No git clone needed** — project has no git repo. Obtain the `Initial Deployment/` folder directly.
2. Install prerequisites:
   ```bash
   brew install ollama ffmpeg        # macOS
   npm install -g vercel             # for deploying
   python3 --version                 # need 3.10+
   ```
3. Read docs in this order (30–60 min total):
   - `docs/ARCHITECTURE.md` — system overview
   - `docs/VOICE_AGENT.md` — AI pipeline and WSS setup
   - `docs/WEBSOCKET_PROTOCOL.md` — message contract
   - `docs/CONTRIBUTING.md` — adding pages and calculators
4. Start the frontend: `python -m http.server 3000` → browse http://localhost:3000
5. Set up voice agent per SOP-02 above, including the one-time cert trust step.
6. Request Supabase credentials (`.env` values) from Vikas.
7. First task: add a calculator to a category using SOP-04.
8. Deploy your change via SOP-01 (`vercel --prod --yes`).
