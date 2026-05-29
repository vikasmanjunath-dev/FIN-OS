# FIN-OS — Architecture

> Version: May 2026 · Live: https://finos1.vercel.app

---

## Overview

FIN-OS is a multi-service architecture split between a **static Vercel frontend** and a **local Python backend**. The frontend (HTML/CSS/JS/React) is deployed on Vercel. All AI processing — speech recognition, LLM inference, text-to-speech — runs entirely on the user's own machine for privacy and zero inference cost.

```
┌─────────────────────────────────────────────────────────────────┐
│                         BROWSER (User)                          │
│                                                                 │
│   finos1.vercel.app                                             │
│   └── 76 HTML pages + 87 calculators + React budget app        │
│                                                                 │
│   Every page includes finos-widget.js (zero-config AI layer)   │
│   │                                                             │
│   ├── finos-context.js    → collects user state                │
│   ├── finos-alerts.js     → real-time alert bell               │
│   ├── finos-health-score.js → live 0–100 score badge           │
│   └── voice agent popup   → ws://localhost:8765                │
│              │                                                  │
└──────────────│──────────────────────────────────────────────────┘
               │ WebSocket (localhost only)
               │
┌──────────────▼──────────────────────────────────────────────────┐
│                    LOCAL MACHINE (Python)                        │
│                                                                 │
│   voiceagent/agent.py  :8765                                    │
│   │                                                             │
│   ├── faster-whisper (tiny)  ← microphone audio stream         │
│   ├── ollama qwen3:14b       ← LLM inference                   │
│   └── edge-tts Neural        → audio stream back to browser    │
│                                                                 │
│   alerts/alert-engine.py  :8001 (FastAPI)                       │
│   app.py  :5000 (Flask — News Intel)                            │
│   chatbot/brain.py  :8000                                       │
└─────────────────────────────────────────────────────────────────┘
               │                │
               ▼                ▼
        Supabase DB        Ollama :11434
        (cloud Postgres)   (local LLM server)
```

---

## Component Map

### Frontend Services

| Component | Path | Tech | Port |
|---|---|---|---|
| Main app pages | `html/` | HTML + CSS + JS | 3000 (dev) |
| Calculator suite | `calculators/` | Standalone HTML | 3000 |
| Budget app | `ExpenseTracker/finos-budget/` | React + Vite | 5173 (dev) |
| Voice agent UI | `voiceagent/index.html` | HTML + JS | 8080 |
| Trade Journal | `TradeJournal/` | HTML + JS | static |
| Portfolio Analyser | `Porfolio Analyser/` | HTML + JS | static |
| Stock Dashboard | `stock-dashboard/` | HTML + JS | 5001 |

### Backend Services

| Service | Path | Tech | Port |
|---|---|---|---|
| Voice AI WebSocket | `voiceagent/agent.py` | Python asyncio | 8765 |
| Alert Engine + Health Score | `alerts/alert-engine.py` | FastAPI + APScheduler | 8001 |
| News Intel API | `app.py` | Flask | 5000 |
| Chatbot Brain | `chatbot/brain.py` | Python | 8000 |
| Market Intelligence | `market intelligence/app.py` | Flask | varies |
| Stock Engine | `stock-engine/backend/app/main.py` | FastAPI | varies |
| Stock Dashboard API | `stock-dashboard/app.py` | Flask | 5001 |
| Django Budget API | `ExpenseTracker/finos_backend/` | Django REST | 8000 |

### Infrastructure

| Component | Provider | Purpose |
|---|---|---|
| Static hosting | Vercel | Frontend deployment |
| Database | Supabase (Postgres) | Auth, profiles, data |
| LLM inference | Ollama (local) | qwen3:14b |
| Speech-to-Text | faster-whisper (local) | Whisper tiny model |
| Text-to-Speech | Edge Neural TTS (local) | en-IN / hi-IN voices |

---

## AI Pipeline — Voice Agent

Two browser-side implementations share the same `agent.py` backend.

### Standard Path (Chrome / Edge / Safari / Firefox)

```
🎤 Microphone
       │  Web Speech API (primary) or Whisper CDN (fallback)
       ▼
[Browser] transcript → sendVoiceMessage()
       │  Ollama :11434 direct (NDJSON streaming)
       ▼
[Browser] speechSynthesis TTS → speaker
```

### Brave Browser Path (auto-detected via `navigator.brave`)

Brave blocks Google STT servers and jsDelivr CDN. Arya detects this synchronously and routes through the local WS backend instead.

```
🎤 Microphone
       │  MediaRecorder (WebM/Opus) + RMS silence detection
       ▼
[Browser] _bvCapDone() → sends audio_chunk JSON over WS
       │  ws://127.0.0.1:8765
       ▼
[agent.py] receives audio_chunk bytes
       │  decode WebM → faster-whisper VAD + STT
       ▼
[Brain.stream()]
       │  1. UserContext.to_prompt() injects full page state:
       │     - trade_journal.full_context (all trades + all breakdowns, verbatim)
       │     - identity, capital, win_rate, best/worst symbol, streak
       │     - OR mind_engine: disc score, XP, sessions, FOMO, archetype
       │  2. Detect language, intent, detail mode
       │  3. ollama.chat(qwen3:14b, stream=True, think=False, num_ctx=32768)
       │  4. Stream tokens → send as "token" WS messages
       │  5. Buffer until sentence boundary
       ▼
[edge-tts Neural TTS]  → per sentence, streamed
       │  en-IN-PrabhatNeural / hi-IN-MadhurNeural
       ▼
[Browser] receives audio_seq MP3 chunks → _bvPlayMp3() → Audio() playback
       │  echo guard: 2800ms RMS threshold raised 5× after TTS ends
       │  state:idle → _bvResume(1400ms) → _bvStartCap() → next turn
       ▼
🔊 Speaker
```

**Offline fallback (Brave, WS down):** `_bvSetOffline()` probes Ollama directly. If up, sets `_aryaOnline=true` so text chat routes through `sendVoiceMessage()` → Ollama → `speechSynthesis`.

**Latency budget (Brave path):** audio_chunk → STT ~300ms · LLM first token ~200ms · TTS sentence ~400ms → first audio ~900ms

**Trade context size:** `buildFullTradeContext()` generates ~3,000–8,000 tokens depending on trade count. `num_ctx=32768` ensures it fits alongside system prompt and conversation history.

---

## Context Pipeline — finos-context.js

Every page contributes user context to the voice agent. The pipeline runs in two phases:

```
Page Load
   │
   ▼
Phase 1 — Synchronous (instant, ~0ms)
   ├── localStorage: onboarding answers, DNA type, settings
   ├── window.FINOS_PAGE_DATA (set by individual pages, e.g. portfolio data)
   ├── sessionStorage: cached context from previous page
   └── URL / document.title → current module name
   │
   ▼
Phase 2 — Asynchronous (Supabase, ~200-500ms)
   ├── profiles table: full_name, income_range, life_stage, city, age
   ├── transactions: last 90 days (spending categories, patterns)
   ├── goals: all user goals + progress percentages
   ├── holdings: portfolio symbols + current allocation
   └── alert engine: health score (GET /health-score/{uid}/summary)
   │
   ▼
publish() → window.FINOS_USER_CONTEXT
   │
   ├── postMessage to voice agent iframe
   ├── sessionStorage (tab-scoped cache)
   └── window._finosRequestContext() available for on-demand re-collect
```

**Portfolio-specific flow (Portfolio Analyser page):**
```
User uploads Zerodha CSV → buildAll() parses holdings
→ _buildVoicePortfolioCtx() maps EQ[] + MF[] into structured summary
→ window.FINOS_PORTFOLIO_DATA = { total_value, top_holdings, top_gainers... }
→ window._finosRequestContext() re-collects and republishes
→ voice agent now knows full portfolio detail
```

---

## Alert Engine Flow

```
FastAPI starts → APScheduler every 15 min
   │
   └── For each active user:
       ├── Load profile + transactions + goals + holdings from Supabase
       ├── Run 10 Rule classes in sequence
       │   Each rule: check condition → if met → push alert to Supabase
       │   Cooldown enforced per (user_id, rule_id) pair
       └── Alert row inserted → Supabase Realtime fires
               │
               ▼
        Browser finos-alerts.js (Realtime subscription)
               │
               ├── Updates bell badge count
               ├── Pushes to slide-out drawer
               └── Optional: Web Push (VAPID) to OS notification tray
```

---

## Database Schema Overview

```
auth.users (Supabase managed)
    │  id (uuid)
    │
    ├── profiles                 -- user config + onboarding data
    ├── transactions             -- expense/income entries
    ├── goals                   -- savings goals + targets
    ├── holdings                -- investment portfolio
    ├── budgets                 -- monthly category budgets
    │
    ├── alerts                  -- engine-generated alerts per user
    ├── push_subscriptions      -- Web Push device registrations
    ├── alert_preferences       -- rule on/off per user
    │
    └── agent_memories          -- voice agent persistent memory
        ├── profile jsonb        -- extracted facts (name, income, goals...)
        ├── summary text         -- LLM-generated session summary
        ├── mem_items jsonb      -- last 20 conversation turns
        └── session counts       -- total_sessions, total_messages
```

All tables have RLS enabled. Users can only read/write their own rows. Service-role key (backend `.env`) bypasses RLS.

---

## Vercel Deployment

```
GitHub push to main
    │
    ▼
Vercel build (Linux, case-sensitive filesystem)
    │
    ├── Serves all static files as-is (HTML, CSS, JS, assets)
    ├── No server-side code — Vercel is purely CDN + static
    ├── .vercelignore excludes: node_modules, Python venv, __pycache__, dist
    │
    └── Live at https://finos1.vercel.app
```

**What Vercel serves:** All HTML, CSS, JS, image assets, calculator files, PWA manifest, service worker.

**What Vercel does NOT serve:** Python backends (agent.py, app.py, alert-engine.py). These must run locally.

**Case sensitivity:** Vercel runs on Linux. All folder names and filenames must be lowercase. macOS is case-insensitive so this only bites at deploy time.

---

## Security Model

| Layer | Mechanism |
|---|---|
| Auth | Supabase email/password + `guard.js` on every page |
| DB isolation | Supabase RLS — each user row-level isolated |
| Voice session binding | `user_id` bound on first WS message; mismatches rejected |
| Context storage | `sessionStorage` only (tab-scoped, never persisted externally) |
| AI privacy | Audio, transcripts, and LLM conversations never leave localhost |
| Service keys | In `.env` files only — never in browser-visible code |
| PWA cache | Network-first for HTML, cache-first for assets |

---

## Key Design Decisions

**Why local AI?** Zero cost, full privacy. User speech and financial data never go to any external server. The LLM runs on the user's own GPU/CPU.

**Why Supabase?** Managed Postgres with built-in auth, RLS, and Realtime subscriptions. No infrastructure to manage. Free tier covers the entire project.

**Why `finos-widget.js` single-script injection?** Allows any of the 76 pages to get the full AI layer with a single `<script>` tag. No page-level plumbing needed.

**Why sentence-by-sentence TTS streaming?** Reduces first-audio latency. The user hears the first sentence while the LLM is still generating the second. This makes the voice feel fast even on large models.
