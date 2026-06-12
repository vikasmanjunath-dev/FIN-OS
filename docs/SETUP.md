# FIN-OS — Local Setup Guide

> Version: 1.4 | Date: June 10, 2026

This guide gets the full stack running on your machine from scratch.

---

## Prerequisites

```bash
python3 --version      # need 3.10+
node --version         # need 18+

# macOS
brew install ollama ffmpeg

# Linux
curl -fsSL https://ollama.com/install.sh | sh
sudo apt install ffmpeg
```

---

## 1. Project Directory

No git repository. The project directory is `Initial Deployment/` — work directly inside it.

```bash
cd "Initial Deployment"
```

---

## 2. Static Frontend (minimum viable)

No build step needed:

```bash
python -m http.server 3000
# Open http://localhost:3000
```

All 96 pages, 88 calculators, and education modules work with just this.

---

## 3. Voice Agent

### Step 1 — Pull the LLM

For best latency, pull the smallest model first:

```bash
ollama pull qwen2.5:3b       # ~2GB — preferred for speed
# OR for max quality (slower):
ollama pull qwen3:14b        # ~9GB
```

Model picker in `agent.py` prefers: `qwen2.5:3b` → `qwen3:4b` → `qwen3:8b` → `qwen3:14b` (first available wins).

### Step 2 — Python environment

```bash
cd voiceagent
python3 -m venv .venv
source .venv/bin/activate     # macOS/Linux
# .venv\Scripts\activate    # Windows

pip install -r requirements.txt
```

### Step 3 — Environment variables

```bash
cp .env.example .env
# Edit .env:
SUPABASE_URL=https://oeapcyucnduhwpgxfknb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OLLAMA_MODEL=qwen2.5:3b          # recommended for latency; change to qwen3:14b for quality
OLLAMA_BASE_URL=http://localhost:11434
WHISPER_MODEL=tiny
VOICE_NAME=en-IN-NeerjaNeural
```

### Step 4 — Start the agent

```bash
python agent.py
```

Expected output:
```
Listening on ws://127.0.0.1:8765
```

No SSL certificates, no browser trust step needed — the agent uses plain WebSocket (`ws://`) for local-only communication.

### Step 5 — Test the widget

Open `http://localhost:3000` (or `http://localhost:3000/voiceagent/index.html` for the standalone UI) and click the AI widget. It should connect and display the voice agent.

### Port conflict

If port 8765 is already in use:

```bash
# Kill whatever is using it
lsof -ti :8765 | xargs kill -9

# Then restart
python agent.py
```

---

## 4. Alert Engine + Health Score

```bash
cd alerts
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env:
SUPABASE_URL=https://oeapcyucnduhwpgxfknb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
VAPID_PRIVATE_KEY=...   # generate with: python -c "from py_vapid import Vapid01; v=Vapid01(); v.generate_keys(); print(v.private_pem().decode())"
VAPID_PUBLIC_KEY=...
VAPID_CLAIMS_EMAIL=your@email.com

uvicorn alert-engine:app --host 0.0.0.0 --port 8001
```

---

## 5. News Intel API

```bash
cd ..   # Back to Initial Deployment root
python3 -m venv .venv
source .venv/bin/activate
pip install flask flask-cors requests

python app.py
# API at http://localhost:5000/api/intel
```

---

## 6. React Budget App (optional)

```bash
cd ExpenseTracker/finos-budget
npm install
npm run dev
# App at http://localhost:5173
```

---

## 7. Stock Engine (optional)

```bash
cd stock-engine/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

---

## 8. Supabase Setup

### Create tables

Run these SQL files in the Supabase SQL editor (in order):

```
1. voiceagent/schema.sql           → agent_memories table
2. alerts/schema.sql               → alerts + push_subscriptions tables
3. (manual) profiles, transactions, goals, holdings, budgets — create via dashboard
```

### Environment variables for frontend

The browser only needs the anon key (public, safe to expose):

```javascript
// In js/supabase-config.js (already set up):
const SUPABASE_URL  = 'https://oeapcyucnduhwpgxfknb.supabase.co';
const SUPABASE_ANON = 'eyJ...';  // public anon key
```

---

## Model Selection Guide

| Use case | Recommended model | Pull command |
|---|---|---|
| Daily use, fast responses | `qwen2.5:3b` | `ollama pull qwen2.5:3b` |
| Balanced speed + quality | `qwen3:4b` | `ollama pull qwen3:4b` |
| Full quality (slower) | `qwen3:8b` | `ollama pull qwen3:8b` |
| Maximum quality, no latency concern | `qwen3:14b` | `ollama pull qwen3:14b` |

The model picker in `agent.py` automatically selects the smallest available model unless `OLLAMA_MODEL` is set in `voiceagent/.env`.

---

## Full Stack Launch (all services)

Open 6 terminal windows:

```bash
# Terminal 1 — Frontend
cd "Initial Deployment"
python -m http.server 3000

# Terminal 2 — Ollama LLM
ollama serve

# Terminal 3 — Voice Agent
cd voiceagent && source .venv/bin/activate && python agent.py

# Terminal 4 — Alert Engine
cd alerts && source .venv/bin/activate && uvicorn alert-engine:app --port 8001

# Terminal 5 — News API
cd .. && source .venv/bin/activate && python app.py

# Terminal 6 — Portfolio.AI (Arya equity analysis)
cd "Porfolio Analyser" && source .venv/bin/activate && python server.py
# API at http://127.0.0.1:8766  (POST /arya  |  POST /arya/stream)
```

---

## Verify Everything Works

```bash
# Frontend
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000           # 200

# Ollama
curl -s http://localhost:11434/api/tags | python3 -m json.tool         # lists models

# Alert engine
curl -s http://localhost:8001/health                                   # {"status":"ok"}

# News API
curl -s http://localhost:5000/api/intel | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['items']),'items')"

# Voice agent — open browser and click the AI widget at http://localhost:3000
# No cert trust needed — plain ws:// local connection
```

---

## Environment Variables Summary

| Variable | Used by | Where |
|---|---|---|
| `SUPABASE_URL` | all backends | `.env` in each service |
| `SUPABASE_SERVICE_ROLE_KEY` | all backends | `.env` only — never browser |
| `VITE_SUPABASE_URL` | React budget app | `ExpenseTracker/finos-budget/.env` |
| `VITE_SUPABASE_ANON_KEY` | React budget app | `ExpenseTracker/finos-budget/.env` |
| `OLLAMA_MODEL` | voiceagent | `voiceagent/.env` (e.g. `qwen2.5:3b`) |
| `OLLAMA_BASE_URL` | voiceagent | `voiceagent/.env` |
| `WHISPER_MODEL` | voiceagent | `voiceagent/.env` |
| `VOICE_NAME` | voiceagent | `voiceagent/.env` |
| `VAPID_PRIVATE_KEY` | alert engine | `alerts/.env` |
| `VAPID_PUBLIC_KEY` | alert engine | `alerts/.env` |
| `VAPID_CLAIMS_EMAIL` | alert engine | `alerts/.env` |
| `OPENROUTER_API_KEY` | api/chat.js (Vercel only) | Vercel dashboard env vars |
