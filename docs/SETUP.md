# FIN-OS — Local Setup Guide

> Version: 1.2 | Date: June 5, 2026

This guide gets the full stack running on your machine from scratch.

---

## Prerequisites

```bash
python3 --version      # need 3.10+
node --version         # need 18+
git --version

# macOS
brew install ollama ffmpeg

# Linux
curl -fsSL https://ollama.com/install.sh | sh
sudo apt install ffmpeg
```

---

## 1. Clone the Repo

```bash
git clone https://github.com/vikasmanjunath-dev/Hexa-Mind.git
cd "Hexa-Mind/Initial Deployment"
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

```bash
ollama pull qwen3:14b        # ~9GB — run once
# Lower-end machine fallback:
ollama pull qwen2.5:3b       # ~2GB
```

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
OLLAMA_MODEL=qwen3:14b
OLLAMA_BASE_URL=http://localhost:11434
WHISPER_MODEL=tiny
VOICE_NAME=en-IN-NeerjaNeural
```

### Step 4 — Start the agent

```bash
python agent.py
# Agent listening on ws://localhost:8765
```

Test: open http://localhost:3000/voiceagent/index.html

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

## Full Stack Launch (all services)

Open 5 terminal windows:

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

# Voice agent
# Open http://localhost:3000/voiceagent/index.html and speak
```

---

## Environment Variables Summary

| Variable | Used by | Where |
|---|---|---|
| `SUPABASE_URL` | all backends | `.env` in each service |
| `SUPABASE_SERVICE_ROLE_KEY` | all backends | `.env` only — never browser |
| `VITE_SUPABASE_URL` | React budget app | `ExpenseTracker/finos-budget/.env` |
| `VITE_SUPABASE_ANON_KEY` | React budget app | `ExpenseTracker/finos-budget/.env` |
| `OLLAMA_MODEL` | voiceagent | `voiceagent/.env` |
| `OLLAMA_BASE_URL` | voiceagent | `voiceagent/.env` |
| `WHISPER_MODEL` | voiceagent | `voiceagent/.env` |
| `VOICE_NAME` | voiceagent | `voiceagent/.env` |
| `VAPID_PRIVATE_KEY` | alert engine | `alerts/.env` |
| `VAPID_PUBLIC_KEY` | alert engine | `alerts/.env` |
| `VAPID_CLAIMS_EMAIL` | alert engine | `alerts/.env` |
