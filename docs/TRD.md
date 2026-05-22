# FIN-OS — Technical Requirements Document (TRD)

**Document owner:** Vikas Manjunath  
**Version:** 1.0  
**Date:** May 2026  
**Status:** Active  

---

## 1. Purpose

This document defines the technical requirements for FIN-OS — technology stack specifications, performance budgets, scalability constraints, security requirements, integration contracts, and non-functional requirements that every component must satisfy.

---

## 2. Technology Stack

### Frontend

| Layer | Technology | Version | Rationale |
|---|---|---|---|
| HTML | HTML5 | — | Standard; no framework overhead |
| CSS | CSS3 + custom properties | — | Theme system via CSS variables |
| JavaScript | Vanilla ES6+ | — | Zero dependency for 76-page app; no build step |
| React app | React + Vite + Tailwind | React 18, Vite 5 | Budget app only; faster DX for complex UI |
| TypeScript app | TypeScript + Vite + Express | TS 5 | News1 aggregator |
| PWA | Service Worker + Web Push | Level 3 | Offline support + push notifications |
| Icons | SVG (inline) | — | No icon font HTTP round-trips |

### Backend

| Service | Technology | Version | Port |
|---|---|---|---|
| Voice agent | Python asyncio + websockets | Python 3.11+, websockets 12+ | 8765 |
| Alert engine + health score | FastAPI + APScheduler | FastAPI 0.110+ | 8001 |
| News Intel | Flask | Flask 3.0+ | 5000 |
| Chatbot brain | Python + custom QFT engine | Python 3.11+ | 8000 |
| Market intelligence | Flask + pandas + ta | Flask 3.0+ | varies |
| Stock engine | FastAPI + yfinance | FastAPI 0.110+ | varies |
| Budget backend | Django REST Framework | Django 5.0+ | 8000 |
| Stock dashboard | Flask + yfinance | Flask 3.0+ | 5001 |

### AI / ML

| Component | Library / Model | Version | Local or Cloud |
|---|---|---|---|
| LLM inference | Ollama + qwen3:14b | Ollama 0.1.9+, qwen3 latest | Local (CPU/GPU) |
| Speech-to-Text | faster-whisper (tiny) | 1.2.1 | Local CPU (int8) |
| Text-to-Speech | edge-tts Neural | 6.1.9+ | Local (Microsoft Edge API, needs internet) |
| Offline TTS fallback | Piper TTS | latest | Local, fully offline |

### Database and Infrastructure

| Component | Technology | Tier |
|---|---|---|
| Primary database | Supabase (Postgres 15) | Free (up to 500MB) |
| Auth | Supabase Auth (GoTrue) | Included |
| Realtime | Supabase Realtime (Phoenix Channels) | Included |
| Static hosting | Vercel | Free (Hobby) |
| CDN | Vercel Edge Network | Global |
| Market data | yfinance (Yahoo Finance) | Free, no key |
| News data | Google News RSS | Free, no key |

---

## 3. Performance Requirements

### Frontend Performance

| Metric | Target | Measurement |
|---|---|---|
| LCP (Largest Contentful Paint) | < 800ms | Vercel CDN cached |
| FID (First Input Delay) | < 100ms | — |
| CLS (Cumulative Layout Shift) | < 0.1 | — |
| Calculator load time | < 1000ms | From click to interactive |
| Calculator result render | < 100ms | After input change |
| `calculators.html` grid render | < 200ms | On first load (readyState guard) |
| JS bundle size (main app) | < 50KB per page | Vanilla JS, no framework |

### Voice Agent Performance

| Metric | Target | Notes |
|---|---|---|
| Whisper STT latency | < 400ms | For ≤10s of speech |
| LLM first token | < 300ms | qwen3:14b on M1/M2 Mac |
| TTS first sentence | < 500ms | edge-tts Neural |
| **Total: voice → first audio** | **< 2 seconds** | End-to-end |
| TTS concurrent sentences | 6 max | `MAX_TTS_CONCURRENT = 6` |
| WebSocket reconnect | < 3 seconds | Auto-reconnect on disconnect |

### Backend Performance

| Service | Response Target | Cached |
|---|---|---|
| News API `/api/intel` | < 100ms (cached) / < 3s (fresh) | 10 min TTL |
| Alert API `/health-score/{uid}` | < 500ms | Per-request |
| Alert API `/alerts/{uid}` | < 200ms | — |
| yfinance data | < 2s per symbol | 15 min in-memory |

---

## 4. Scalability Requirements

### Current Phase (Single User / Personal Use)

The current architecture is designed for a single user running locally. This is intentional — all AI runs on the user's machine.

### Multi-User Path (Future)

| Layer | Scaling approach |
|---|---|
| Frontend (Vercel) | Auto-scales — CDN handles any traffic |
| Database (Supabase) | Upgrade to Pro ($25/mo) for 8GB DB, higher connection limits |
| Alert engine | Horizontally scalable — stateless workers, Supabase as state |
| Voice agent | Cannot be centralised — AI is local by design. Multi-user = each user runs own agent |

### Database Limits (Free Tier)

| Resource | Limit | Current Usage |
|---|---|---|
| Database size | 500MB | ~10MB |
| Row count | Unlimited | — |
| Realtime connections | 200 concurrent | — |
| Auth users | 50,000 | — |
| Bandwidth | 5GB/month | — |

---

## 5. Security Requirements

### TR-SEC-01 — Secrets Management

- `SUPABASE_SERVICE_KEY` must never appear in any file served to the browser
- All secrets in `.env` files, never committed to git
- `.env.example` files committed with placeholders only
- Browser uses only `SUPABASE_ANON_KEY` — constrained by RLS

### TR-SEC-02 — Database Access Control

- RLS enabled on all tables
- Users can only SELECT/INSERT/UPDATE their own rows (`auth.uid() = user_id`)
- Service-role key bypasses RLS only in Python backends
- No database admin credentials in any code file

### TR-SEC-03 — Voice Agent Isolation

- WebSocket server binds to `127.0.0.1` only — not accessible from network
- `user_id` bound on first message; cross-user injection rejected
- Audio and transcripts processed in RAM only — zero disk writes
- Conversation history cleared from RAM on disconnect

### TR-SEC-04 — Context Storage

- User context stored in `sessionStorage` only (tab-scoped)
- Never in `localStorage` (persists across sessions = risk)
- Never sent to any external service
- Context cleared when tab closes

### TR-SEC-05 — Input Validation

- Supabase auth handles SQL injection prevention (parameterised queries in PostgREST)
- LLM input: user speech transcript — no code execution surface
- No `eval()` or dynamic `innerHTML` with user-controlled strings anywhere in JS
- Calculator inputs: validated as numbers before use

### TR-SEC-06 — Dependency Security

| Requirement | Implementation |
|---|---|
| No known CVEs in Python dependencies | Pin versions in `requirements.txt` |
| No known CVEs in npm packages | `npm audit` before each deploy |
| HTTPS only on Vercel | Enforced by Vercel — no HTTP fallback |

---

## 6. Reliability Requirements

### TR-REL-01 — Graceful Degradation

| Service down | App behaviour |
|---|---|
| Ollama offline | Voice agent shows "OFFLINE" chip; all other features work |
| Supabase offline | Shows cached data from sessionStorage; no auth-dependent features |
| Alert engine offline | Bell icon hides; no errors shown to user |
| News API offline | News page shows "Unable to load" message; no crash |
| yfinance rate limited | Market pages show "Data unavailable" with timestamp |

### TR-REL-02 — Error Boundaries

- Every Python backend has `try/except` on all external API calls
- WebSocket server recovers from individual message errors — does not crash
- Browser JS wrapped in `try/catch` for all async operations
- Ollama connection retry: 3 attempts with 1s backoff

### TR-REL-03 — Data Integrity

- Voice agent `MemoryStore` never overwrites existing profile facts with empty values
- Supabase writes use upsert with explicit conflict resolution
- Session autosave every 5 minutes prevents data loss on crash

---

## 7. Integration Requirements

### TR-INT-01 — Ollama API

- Library: `ollama` Python package ≥ 0.1.9
- Model: qwen3:14b (pulled via `ollama pull qwen3:14b`)
- All calls use streaming mode (`stream=True`)
- `think=False` passed as top-level kwarg (not inside `options`) for qwen3 models
- Timeout: 30 seconds per stream initiation

### TR-INT-02 — Supabase Client

**Python (service role):**
```python
import httpx
headers = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json"
}
```

**JavaScript (anon key):**
```javascript
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
```

- Supabase client version: `@supabase/supabase-js` ≥ 2.38
- Realtime: subscribed via `.channel()` + `.on('postgres_changes', ...)` pattern

### TR-INT-03 — WebSocket Contract

- Protocol: `websockets` 12+ (Python) / native browser WebSocket API
- Binary frames: PCM float32 audio from browser
- Text frames: UTF-8 JSON
- Heartbeat: browser sends `{"type": "ping"}` every 30s
- See `docs/WEBSOCKET_PROTOCOL.md` for full message schema

### TR-INT-04 — Edge TTS

- Library: `edge-tts` ≥ 6.1.9
- Requires internet connection (calls Microsoft TTS API)
- Voices: `en-IN-PrabhatNeural`, `hi-IN-MadhurNeural`
- Output: MP3 byte stream → base64 encoded → sent over WebSocket
- Fallback: Piper TTS (local, offline) if edge-tts fails

### TR-INT-05 — faster-whisper

- Model: `tiny` (39MB, ~32× real-time on CPU)
- Compute type: `int8` (CPU-optimised)
- VAD filter: enabled (`vad_filter=True`)
- Language detection: `language=None` (auto-detect)
- Cache directory: `./models`

### TR-INT-06 — yfinance

- Rate limits: ~2000 requests/hour per IP (unofficial)
- Cache all responses ≥ 15 minutes in-memory
- Use `.NS` suffix for NSE stocks (e.g., `RELIANCE.NS`)
- Nifty 50 symbol: `^NSEI`
- Fallback: show last known value with "stale data" warning

---

## 8. Browser Compatibility

| Browser | Minimum Version | Notes |
|---|---|---|
| Chrome | 90+ | Full support including WebAudio, WebSocket, Push |
| Firefox | 90+ | Full support |
| Safari | 15+ | WebSocket OK; Push Notifications require iOS 16.4+ |
| Edge | 90+ | Full support |
| Chrome Android | 90+ | Full support |
| Safari iOS | 16.4+ | Push requires PWA install |

**Required browser APIs:**
- `getUserMedia` (microphone)
- `AudioContext` + `AudioWorkletNode` (audio processing)
- `WebSocket` (voice agent connection)
- `ServiceWorker` + `PushManager` (PWA + push)
- `localStorage` + `sessionStorage`
- CSS Grid + CSS Custom Properties
- ES6+ (arrow functions, destructuring, async/await, modules)

---

## 9. Local Hardware Requirements

The voice agent AI components have hardware requirements on the user's machine:

| Component | Minimum | Recommended |
|---|---|---|
| RAM for qwen3:14b | 12GB available | 16GB+ |
| RAM for qwen2.5:3b (fallback) | 4GB available | 8GB+ |
| CPU cores | 4 (Whisper) | 8+ |
| Storage for qwen3:14b | 9GB free | 15GB+ (for multiple models) |
| Storage for Whisper tiny | 150MB | — |
| macOS | 12.0 (Monterey) | 14.0 (Sonoma) for M-series acceleration |

**Apple Silicon (M1/M2/M3):** Ollama uses the Metal GPU backend — qwen3:14b runs at ~18 tokens/sec. Intel Mac: CPU-only, ~6 tokens/sec. Both are acceptable.

---

## 10. Build and Deployment Requirements

### TR-BUILD-01 — No Build Step for Main App

The main app (76 HTML pages) requires zero build step. Files are served directly from the `html/`, `css/`, `js/`, `assets/` directories.

### TR-BUILD-02 — React App Build

```bash
cd ExpenseTracker/finos-budget
npm run build   # outputs to dist/
```

Built `dist/` is committed to git and served as static files. Vite build must produce < 500KB total JS bundle.

### TR-BUILD-03 — Vercel Static Deploy

- All files in `Initial Deployment/` are deployed except those in `.vercelignore`
- No environment variables required on Vercel for current functionality
- Vercel build time: < 30 seconds (static files only)
- Linux filesystem: all paths must be lowercase

### TR-BUILD-04 — Python Environments

Each Python service uses an isolated virtual environment:

```
voiceagent/.venv/
alerts/.venv/          (recommended)
market intelligence/.venv/  (recommended)
```

All `requirements.txt` files pin exact or minimum versions to ensure reproducibility.

---

## 11. Logging Requirements

### Voice Agent (`voiceagent/agent.log`)

Must log at INFO level:
- Session connect/disconnect with `user_id`
- STT result + latency
- LLM first-token latency + total latency + token count
- TTS per-sentence latency
- Memory save/load operations + success/failure
- Any exception with full traceback at ERROR level

Format: `YYYY-MM-DD HH:MM:SS [LEVEL] logger: message`

### Alert Engine

Must log:
- Startup: rules loaded, Supabase connected
- Each evaluation cycle: users processed, alerts fired
- Each rule fire: rule_id, user_id, priority
- Any Supabase write failure at ERROR level

### General

- No user financial data in log files
- No auth tokens or secrets in log output
- Log rotation: daily, keep 7 days

---

## 12. Code Quality Requirements

| Requirement | Standard |
|---|---|
| Python type hints | All function signatures in `agent.py`, `alert-engine.py` |
| Python line length | Max 100 characters |
| JavaScript `use strict` | Required in all IIFE-wrapped modules |
| No `var` in JavaScript | Use `const` / `let` only |
| No `eval()` | Prohibited everywhere |
| No inline event handlers | All event binding via `addEventListener` |
| No hardcoded secrets | Enforced by `.gitignore` + `.env.example` pattern |
| CSS: no `!important` | Except in `base.css` reset rules |
