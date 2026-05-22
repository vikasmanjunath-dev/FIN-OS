# FIN-OS — Standard Operating Procedures (SOP)

**Document owner:** Vikas Manjunath  
**Version:** 1.0  
**Date:** May 2026  
**Last reviewed:** May 2026  

---

## SOP Index

| SOP | Title | When to use |
|---|---|---|
| SOP-01 | Deploy to Vercel (Production) | Any code change to ship to finos1.vercel.app |
| SOP-02 | Start Voice Agent (Local) | Daily use of voice AI |
| SOP-03 | Start Full Local Stack | Development / all-features session |
| SOP-04 | Add a New Calculator | Adding any of the 87+ calculators |
| SOP-05 | Add a New HTML Page | Adding any of the 76+ app pages |
| SOP-06 | Incident Response | Something breaks in production |
| SOP-07 | Database Migration | Adding new Supabase tables or columns |
| SOP-08 | Rollback a Deployment | Reverting a bad production deploy |
| SOP-09 | Debug Voice Agent | Voice agent not responding or giving wrong output |
| SOP-10 | Onboard a New Developer | Setting up the project from scratch |

---

## SOP-01 — Deploy to Vercel (Production)

**Triggered by:** Any code change to HTML, CSS, JS, calculators, or assets that should be live.

**Pre-deploy checklist:**
- [ ] All calculator folder names are lowercase (not `Investment & Wealth` — must be `investment & wealth`)
- [ ] All new calculator filenames match exactly what is in `js/calculators.js`
- [ ] No `localhost` hardcoded in any HTML/JS that runs on Vercel
- [ ] No `SUPABASE_SERVICE_KEY` in any browser-visible file
- [ ] If `finos-widget.js` or `finos-context.js` changed, bump `?v=N` query param in all importers
- [ ] Test the changed pages locally with `python -m http.server 3000` before deploying

**Deploy steps:**

```bash
cd "Initial Deployment"

# Stage and verify changes
git status
git diff --stat

# Add and commit
git add <specific files>
git commit -m "feat: <description>"

# Deploy to Vercel production
vercel --prod
```

**Post-deploy verification:**
```bash
# Within 60 seconds, verify:
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app                    # → 200
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app/html/calculators.html  # → 200
curl -s -o /dev/null -w "%{http_code}" https://finos1.vercel.app/js/finos-widget.js # → 200
```

Open https://finos1.vercel.app in incognito and:
- [ ] Home page loads without console errors
- [ ] Any changed calculator opens and renders on first load

**Estimated time:** 5 minutes (including Vercel build ~30s)

---

## SOP-02 — Start Voice Agent (Local)

**Triggered by:** Wanting to use the voice AI.

**Prerequisites:** Ollama installed, qwen3:14b pulled, Python 3.11+ installed.

**Steps:**

```bash
# Option A — One command (recommended)
cd "Initial Deployment/voiceagent"
./run.sh start

# Expected output:
# [OK]  FIN-OS is live!
#   🌐  Open:   http://localhost:8080
#   🔌  WS:     ws://localhost:8765
#   🧠  LLM:    qwen3:14b
#   🎙   STT:   Whisper tiny
#   🔊  TTS:    Edge Neural (en-IN / hi-IN)
#   📋  Logs:   tail -f .../agent.log
```

**Verify:**
- [ ] `http://localhost:8080` opens voice agent UI
- [ ] Orb shows "READY HAI" within 10 seconds
- [ ] MEM chip shows "cloud" (green) if Supabase is configured

**Stop:**
```bash
./run.sh stop
```

**First-time setup (run once):**
```bash
cd voiceagent
./run.sh setup     # creates .venv, installs requirements, pulls model
cp .env.example .env
# Edit .env — add SUPABASE_SERVICE_KEY
./run.sh start
```

**Estimated time:** 30 seconds (after first setup)

---

## SOP-03 — Start Full Local Stack

**Triggered by:** Development sessions requiring all services (alerts, news, chat, AI).

**Steps:** Open 6 terminal tabs/windows:

```bash
# Tab 1 — Ollama (must be first)
ollama serve

# Tab 2 — Voice Agent
cd "Initial Deployment/voiceagent"
./run.sh start

# Tab 3 — Alert Engine
cd "Initial Deployment/alerts"
source .venv/bin/activate  # or: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
python alert-engine.py

# Tab 4 — News Intel API
cd "Initial Deployment"
python app.py

# Tab 5 — Main Frontend
cd "Initial Deployment"
python -m http.server 3000

# Tab 6 (optional) — Budget App
cd "Initial Deployment/ExpenseTracker/finos-budget"
npm run dev
```

**Health check all services:**
```bash
curl http://localhost:8001/health    # Alert engine
curl http://localhost:5000/api/intel # News API
curl http://localhost:3000           # Frontend
```

**Estimated time:** 3–5 minutes (first start; faster after caches warm)

---

## SOP-04 — Add a New Calculator

**Triggered by:** Building any new calculator tool.

**Steps:**

**1. Create the HTML file in the correct category folder:**
```bash
# Example: adding a gold SGB calculator to Investment & Wealth
touch "Initial Deployment/calculators/investment & wealth/sgb.html"
```

**2. Use the calculator template** (see `docs/CONTRIBUTING.md` FR-04 section for boilerplate)

**3. Register in `js/calculators.js`:**
```javascript
{ name: "SGB Calculator", file: "sgb.html" }
```
Add to the correct category's `calculators` array.

**4. Test locally:**
```bash
python -m http.server 3000
# Open http://localhost:3000/html/calculators.html
# Click the new calculator card
# Verify it loads, inputs work, result renders
```

**5. Deploy** (follow SOP-01)

**Checklist:**
- [ ] File is in the correct lowercase category folder
- [ ] `file` field in `calculators.js` matches the exact filename (case-sensitive)
- [ ] Calculator renders result without a page reload
- [ ] Works on mobile viewport (Chrome DevTools → toggle device toolbar)
- [ ] No external API calls (must work offline)

**Estimated time:** 30–90 minutes per calculator

---

## SOP-05 — Add a New HTML Page

**Triggered by:** Adding any new page to the main app.

**Steps:**

**1. Create the three files:**
```bash
touch "Initial Deployment/html/your-page.html"
touch "Initial Deployment/css/your-page.css"
touch "Initial Deployment/js/your-page.js"   # if needed
```

**2. Use the page template** (see `docs/CONTRIBUTING.md` for boilerplate)

**3. Include required scripts:**
```html
<script src="../js/guard.js"></script>          <!-- auth protection -->
<script src="../js/finos-widget.js?v=4"></script>  <!-- AI layer -->
```

**4. Link from navigation** (if the page should be discoverable):
- Add to `html/home.html` quick actions or navigation
- Add to `html/dashboard.html` if it's a main section
- Add to `sw.js` pre-cache list if it's a core page

**5. Test:**
```bash
python -m http.server 3000
# Open http://localhost:3000/html/your-page.html
# Verify: auth guard redirects if not logged in
# Verify: finos-widget FAB appears bottom-right
# Verify: no console errors
```

**6. Deploy** (follow SOP-01)

**Estimated time:** 1–4 hours per page

---

## SOP-06 — Incident Response

### P1 — Production site completely down (Vercel)

**Response time:** < 15 minutes

```bash
# 1. Check Vercel status
curl -I https://finos1.vercel.app
# Check https://www.vercel-status.com

# 2. If Vercel is up but site is down — check last deployment
vercel ls

# 3. Rollback to last working deployment
vercel alias set <last-good-deployment-url> finos1.vercel.app
```

### P2 — Voice agent broken (no response)

**Response time:** < 30 minutes

```bash
# 1. Check if agent is running
ps aux | grep agent.py

# 2. Check logs
tail -50 voiceagent/agent.log

# 3. Check Ollama
ollama list         # verify qwen3:14b is present
curl http://localhost:11434/api/tags  # verify Ollama API is up

# 4. Check port
lsof -i:8765        # verify WebSocket port is open

# 5. Restart
cd voiceagent && ./run.sh restart
```

### P3 — Calculator 404 after deploy

**Response time:** < 30 minutes

```bash
# 1. Identify which calculator is 404
# Check browser network tab for the failing URL

# 2. Common causes:
#    a) Folder name has wrong case
ls "calculators/"   # verify all lowercase

#    b) Filename typo in calculators.js
grep "file:" js/calculators.js | grep "yourfile"

#    c) File doesn't exist on disk
ls "calculators/investment & wealth/" | grep yourfile

# 3. Fix and redeploy (SOP-01)
```

### P4 — Alert engine not sending alerts

```bash
# 1. Check service
curl http://localhost:8001/health

# 2. Check logs
cd alerts && tail -50 alert-engine.log

# 3. Manual trigger (dev only)
curl -X POST http://localhost:8001/alerts/run

# 4. Check Supabase Realtime is enabled
# Dashboard → Database → Replication → alerts table ON
```

### P5 — Supabase down or quota exceeded

```bash
# Check Supabase status: https://status.supabase.com
# Check usage: Supabase Dashboard → Settings → Usage

# Immediate mitigation:
# - Voice agent still works (in-RAM memory active)
# - Static pages still work (Vercel CDN)
# - Auth will fail — users cannot log in
# - Alerts will fail silently

# If quota exceeded:
# Dashboard → Settings → Database → Archive old transactions
```

---

## SOP-07 — Database Migration

**Triggered by:** Adding new Supabase tables, adding columns to existing tables, or changing RLS policies.

**Steps:**

**1. Write the migration SQL:**
```sql
-- Always write idempotent SQL (safe to re-run)
-- Use IF NOT EXISTS, CREATE OR REPLACE, etc.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kyc_verified boolean DEFAULT false;
```

**2. Test on a local Postgres instance first** (optional but recommended for destructive changes):
```bash
psql -U postgres -c "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kyc_verified boolean DEFAULT false;"
```

**3. Run in Supabase SQL Editor:**
- Go to: Supabase Dashboard → SQL Editor → New query
- Paste the SQL
- Review carefully
- Click **Run**
- Verify: no error, affected rows count is sane

**4. Update application code** to use the new column/table

**5. Update `docs/DATABASE.md`** with the new column/table documentation

**For new tables:** Add the full `CREATE TABLE` + RLS policies to a new `.sql` migration file (e.g., `migrations/003_add_kyc.sql`).

**⚠️ Never run `DROP TABLE` or `DELETE FROM` without an explicit backup or confirmation.**

**Estimated time:** 15–30 minutes

---

## SOP-08 — Rollback a Deployment

**Triggered by:** A production deploy broke something that a quick fix cannot address in < 30 minutes.

**Steps:**

```bash
# 1. List recent deployments
vercel ls

# Output example:
# fin-os   fin-abc123.vercel.app   4m ago    READY
# fin-os   fin-def456.vercel.app   2h ago    READY   ← last good one

# 2. Alias the last good deployment to production
vercel alias set fin-def456.vercel.app finos1.vercel.app

# 3. Verify
curl -I https://finos1.vercel.app    # should return 200
```

**Alternative: via Vercel Dashboard**
- Go to https://vercel.com/vikas-manjunath-s-projects/fin-os
- Deployments tab
- Find last working deployment
- Click "..." → "Promote to Production"

**Estimated time:** 5 minutes

---

## SOP-09 — Debug Voice Agent

Use this procedure when the voice agent is unresponsive, giving wrong output, or crashing.

### Symptom: Orb stuck on "SOCH RAHA..." (thinking forever)

```bash
# Check if LLM is responding
curl -s http://localhost:11434/api/chat -d '{
  "model": "qwen3:14b",
  "messages": [{"role": "user", "content": "ping"}],
  "stream": false,
  "think": false
}' | head -c 200

# If no response → Ollama is down
ollama serve

# If response has <think>...</think> blocks → think param not applied
# Check agent.py: OLLAMA_THINK = False should be passed as top-level kwarg
# grep -n "think" voiceagent/agent.py
```

### Symptom: No audio / TTS silent

```bash
# Test edge-tts manually
cd voiceagent
source .venv/bin/activate
python -c "import asyncio; import edge_tts; asyncio.run(edge_tts.Communicate('Hello', 'en-IN-PrabhatNeural').save('/tmp/test.mp3'))"
open /tmp/test.mp3  # should play audio
```

### Symptom: STT not transcribing

```bash
# Check ffmpeg
ffmpeg -version

# Check faster-whisper
cd voiceagent && source .venv/bin/activate
python -c "from faster_whisper import WhisperModel; m = WhisperModel('tiny', compute_type='int8'); print('STT OK')"
```

### Symptom: Profile card showing wrong age or family status

```bash
# Check what's in memory
# Look in agent.log for [memory] lines
grep "\[memory\]" voiceagent/agent.log | tail -20

# If false positives:
# - Age: should only come from Supabase profile.age (not conversation text)
# - Family: only "my son/daughter", "I'm married", "my wife/husband" — NOT topic mentions

# Clear memory for fresh start
# In browser: click the memory clear button in voice agent UI
# In Supabase: DELETE FROM agent_memories WHERE user_id = 'your-uid';
```

### Symptom: "MEMORY RESTORED" not showing on reconnect

```bash
# Check if memory was saved
# In Supabase Dashboard → Table Editor → agent_memories
# Look for your user_id row

# Check .env has SUPABASE_SERVICE_KEY
cat voiceagent/.env | grep SUPABASE

# Check log for memory save
grep "memory" voiceagent/agent.log | tail -10
```

### Full diagnostic checklist

```bash
# 1. All processes running?
ps aux | grep -E "agent\.py|ollama"

# 2. Ports open?
lsof -i:8765    # voice agent WS
lsof -i:11434   # Ollama

# 3. Model available?
ollama list | grep qwen3

# 4. Recent errors?
tail -50 voiceagent/agent.log | grep -E "ERROR|Exception"

# 5. Memory health?
grep -E "memory|Supabase" voiceagent/agent.log | tail -20
```

---

## SOP-10 — Onboard a New Developer

**Triggered by:** A new contributor joining the project.

**Steps:**

**Day 1 — Environment setup (2–3 hours)**

```bash
# 1. Prerequisites
brew install ollama ffmpeg  # macOS
python3 --version           # need 3.10+
node --version              # need 18+

# 2. Clone
git clone https://github.com/vikasmanjunath-dev/Hexa-Mind.git
cd Hexa-Mind/"Initial Deployment"

# 3. Read docs (in order)
# docs/ARCHITECTURE.md    ← start here (15 min read)
# docs/SETUP.md           ← then this (30 min setup)
# README.md               ← full reference
# progress.md             ← full project history

# 4. Start static frontend
python -m http.server 3000
# Browse http://localhost:3000 — explore all pages

# 5. Set up voice agent
cd voiceagent
./run.sh setup    # pulls model (~9GB for qwen3:14b — takes time)
cp .env.example .env
# Get SUPABASE_SERVICE_KEY from team Supabase dashboard
./run.sh start
```

**Day 1 checklist:**
- [ ] Frontend loads at http://localhost:3000
- [ ] Voice agent responds at http://localhost:8080
- [ ] Can speak to voice agent and get a response
- [ ] Read ARCHITECTURE.md and SETUP.md fully
- [ ] Read through `voiceagent/agent.py` (the core file) at least once

**Day 2 — First contribution**

Pick a calculator from the "Known Issues" or "Next Milestones" list in `progress.md`. Follow SOP-04 (Add a New Calculator). Submit a PR.

**Key files to understand first:**

| File | Why |
|---|---|
| `voiceagent/agent.py` | The entire AI brain — all voice logic |
| `js/finos-widget.js` | The single-script AI layer injected on all pages |
| `js/finos-context.js` | How user context flows from page to voice agent |
| `js/calculators.js` | How all 87 calculators are registered |
| `alerts/alert-engine.py` | The proactive monitoring system |
| `docs/DATABASE.md` | All Supabase tables |
| `docs/WEBSOCKET_PROTOCOL.md` | Full message schema |

---

## Appendix — Common Commands Reference

```bash
# === DEPLOY ===
vercel --prod                           # deploy to production
vercel ls                               # list recent deployments

# === VOICE AGENT ===
./run.sh start                          # start agent + UI server
./run.sh stop                           # stop all FIN-OS processes
./run.sh restart                        # restart
./run.sh logs                           # tail logs
tail -f voiceagent/agent.log            # live log stream

# === OLLAMA ===
ollama serve                            # start Ollama LLM server
ollama list                             # list pulled models
ollama pull qwen3:14b                   # pull model (~9GB)
ollama pull qwen2.5:3b                  # pull smaller fallback (~2GB)

# === PORTS ===
lsof -ti:8765 | xargs kill -9           # kill voice agent WS
lsof -ti:8080 | xargs kill -9           # kill voice agent UI server
lsof -ti:8001 | xargs kill -9           # kill alert engine
lsof -ti:5000 | xargs kill -9           # kill news API
lsof -ti:11434 | xargs kill -9          # kill Ollama

# === SUPABASE ===
# All SQL runs in Supabase Dashboard → SQL Editor
# Never use supabase CLI for schema changes without testing locally

# === GIT ===
git log --oneline -10                   # recent commits
git diff --stat HEAD~1                  # what changed in last commit
git stash                               # save uncommitted work
```
