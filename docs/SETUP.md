# FIN-OS — Local Setup Guide

This guide gets the full stack running on your machine from scratch.

---

## Prerequisites

Install these before anything else:

```bash
# Check versions
python3 --version      # need 3.10+
node --version         # need 18+
git --version

# Install Ollama (macOS)
brew install ollama
# OR: curl -fsSL https://ollama.com/install.sh | sh  (Linux)

# Install ffmpeg (required for voice agent microphone input)
brew install ffmpeg    # macOS
# sudo apt install ffmpeg  (Ubuntu/Debian)

# Verify
ollama --version
ffmpeg -version
```

---

## 1. Clone the Repo

```bash
git clone https://github.com/vikasmanjunath-dev/Hexa-Mind.git
cd Hexa-Mind
```

---

## 2. Static Frontend (minimum viable)

The main app is all static HTML/CSS/JS. No build step needed.

```bash
python -m http.server 3000
# Open http://localhost:3000
```

That's it for the frontend. You can browse all 76 pages, 87 calculators, and education modules with just this.

---

## 3. Voice Agent

The voice agent is the most complex service. It needs Ollama, Python packages, and a `.env` file.

### Step 1 — Pull the LLM

```bash
ollama pull qwen3:14b
# This downloads ~9GB. Run once.
# Alternatively, qwen2.5:3b (2GB) works but is less capable.
```

### Step 2 — Python environment

```bash
cd voiceagent

# Create virtual env
python3 -m venv .venv
source .venv/bin/activate       # macOS / Linux
# .venv\Scripts\activate        # Windows

# Install packages
pip install -r requirements.txt
```

Requirements:
```
ollama>=0.1.9
websockets>=12.0
numpy==1.26.4
faster-whisper==1.2.1
tokenizers==0.22.2
transformers==5.8.1
edge-tts>=6.1.9
httpx>=0.27.0
python-dotenv>=1.0.1
```

### Step 3 — Environment variables

```bash
cp .env.example .env
```

Edit `.env`:
```
SUPABASE_URL=https://oeapcyucnduhwpgxfknb.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...
```

Get the `service_role` key from: Supabase Dashboard → Settings → API → `service_role` secret.

Without these variables the voice agent still works — it just skips persistent memory across sessions.

### Step 4 — Start everything

**Option A — All-in-one script (recommended)**
```bash
cd voiceagent
./run.sh setup     # first time only — creates venv, pulls model
./run.sh start     # starts agent on :8765 + UI server on :8080
```

```
./run.sh stop      # kill all FIN-OS processes
./run.sh restart   # stop then start
./run.sh logs      # tail agent.log
```

**Option B — Manual (three terminals)**
```bash
# Terminal 1
ollama serve

# Terminal 2
cd voiceagent
source .venv/bin/activate
python agent.py

# Terminal 3
cd voiceagent
python -m http.server 8080
```

### Step 5 — Open the voice agent

Navigate to `http://localhost:8080` — you should see the voice agent UI with the orb saying **READY HAI**.

Click the orb and start talking. Watch the STT, LLM, and TTS stats in the right panel.

---

## 4. Alert Engine + Health Score

```bash
cd alerts

# Install
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env — fill in SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY, VAPID keys

# Generate VAPID keys (one-time)
python -c "
from py_vapid import Vapid
v = Vapid()
v.generate_keys()
print('VAPID_PRIVATE_KEY =', v.private_key)
print('VAPID_PUBLIC_KEY  =', v.public_key)
"
# Paste the output into .env

# Run Supabase migration
# Paste alerts/schema.sql into Supabase SQL Editor and run it

# Start
python alert-engine.py
# Running on http://0.0.0.0:8001
```

Health check: `curl http://localhost:8001/health`

---

## 5. News Intel API

```bash
# From project root
pip install flask flask-cors
python app.py
# Running on http://0.0.0.0:5000

# Test
curl http://localhost:5000/api/intel
```

---

## 6. Chatbot Brain

```bash
python chatbot/brain.py
# Listening on :8000
```

Open `http://localhost:3000/html/chat.html` to use the chat interface.

---

## 7. React Budget App

```bash
cd ExpenseTracker/finos-budget
npm install
npm run dev
# http://localhost:5173

# Or build and serve from main frontend
npm run build
# then copy dist/ files as needed
```

---

## 8. Django Backend (Budget App API)

```bash
cd ExpenseTracker/finos_backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
# http://localhost:8000
```

---

## Full Stack — All Services

```bash
# Terminal 1
ollama serve

# Terminal 2 — Voice Agent
cd voiceagent && source .venv/bin/activate && python agent.py

# Terminal 3 — Voice Agent UI
cd voiceagent && python -m http.server 8080

# Terminal 4 — Alert Engine
cd alerts && python alert-engine.py

# Terminal 5 — News API
python app.py

# Terminal 6 — Main Frontend
python -m http.server 3000

# Terminal 7 (optional) — Budget App
cd ExpenseTracker/finos-budget && npm run dev
```

---

## Supabase Setup

If you are setting up a fresh Supabase project:

1. Create project at https://supabase.com
2. Go to SQL Editor
3. Run `alerts/schema.sql` → creates `alerts`, `push_subscriptions`, `alert_preferences`
4. Run `voiceagent/schema.sql` → creates `agent_memories`
5. Go to Database → Replication → enable Realtime for `alerts` and `alert_preferences`
6. Go to Settings → API → copy `service_role` key → paste into `.env` files

---

## Troubleshooting

**Voice agent: "No module named faster_whisper"**
```bash
source voiceagent/.venv/bin/activate
pip install -r voiceagent/requirements.txt
```

**Voice agent: no response from LLM (qwen3:14b)**
Ensure `think=False` is passed as a top-level kwarg, not inside `options` dict. This is already fixed in the current `agent.py`. If you pulled an old version, check line ~88 for `OLLAMA_THINK = False`.

**Ollama: "connection refused"**
```bash
ollama serve        # start Ollama server first
ollama list         # confirm qwen3:14b is pulled
```

**Voice agent: microphone not detected**
Ensure browser has microphone permission. The voice agent UI must be served over HTTP (localhost is fine) not opened as a file:// path.

**Calculators: 404 on Vercel**
All folder names must be lowercase (e.g., `calculators/investment & wealth/`, not `Investment & Wealth`). This is already correct in the repo. See `js/calculators.js`.

**Calculators: not showing on first load (no refresh needed)**
The `readyState === 'loading'` guard in `calculators.js` handles the PWA cache race. This is already fixed.

**Port already in use**
```bash
lsof -ti:8765 | xargs kill -9    # voice agent WS
lsof -ti:8080 | xargs kill -9    # voice agent UI
lsof -ti:8001 | xargs kill -9    # alert engine
lsof -ti:5000 | xargs kill -9    # news API
```

---

## Port Reference

| Port | Service | How to start |
|---|---|---|
| 3000 | Main frontend | `python -m http.server 3000` |
| 5000 | News Intel API | `python app.py` |
| 5001 | Stock Dashboard | `cd stock-dashboard && python app.py` |
| 8000 | Chatbot Brain | `python chatbot/brain.py` |
| 8001 | Alert Engine | `cd alerts && python alert-engine.py` |
| 8080 | Voice Agent UI | `cd voiceagent && python -m http.server 8080` |
| 8765 | Voice Agent WS | `cd voiceagent && python agent.py` |
| 11434 | Ollama | `ollama serve` |
