# FIN-OS — Technical Requirements Document (TRD)

**Owner:** Vikas Manjunath | **Version:** 1.6 | **Date:** June 20, 2026 | **Status:** Active

---

## 1. Purpose

Defines technical stack, performance budgets, security, accessibility, and integration contracts for all FIN-OS components.

---

## 2. Technology Stack

### Frontend

| Layer | Technology | Notes |
|---|---|---|
| HTML | HTML5 | 96 pages, no framework overhead |
| CSS | CSS3 + custom properties | 133-token design system |
| JavaScript | Vanilla ES6+ | No build step; 91 modules |
| React app | React 19 + Vite 5 + Tailwind | Budget app (`ExpenseTracker/finos-budget/`) — 11 pages |
| TypeScript | TS 5 + Vite + Express | News1 aggregator |
| PWA | Service Worker + Web Push Level 3 | Offline + push notifications |
| Vercel Edge Function | `api/chat.js` — ESM, compiled to CJS by Vercel | Cloud AI proxy (currently disabled) |

### CSS Architecture (45 files)

| File | Purpose |
|---|---|
| `css/design-tokens.css` | 133 CSS variables — single source of truth |
| `css/interactions.css` | 180+ zero-fill hover effects |
| `css/theme.css` | 360 light-mode rules |
| `css/base.css` | Reset, typography, WCAG focus rings |
| `css/layout.css` | Sidebar, mobile nav, topbar |
| `css/components.css` | Shared UI components |
| `css/[page].css` (38 files) | Per-page styles |

### JS Architecture (91 modules)

| File | Purpose |
|---|---|
| `js/theme-init.js` | Anti-FOUC — inline IIFE, runs before first paint |
| `js/interactions.js` | Hover override engine |
| `js/ui.js` | Theme toggle + card animation + focus tracking |
| `js/finos-widget.js?v=7` | AI overlay (ALL 96 pages + ALL 88 calculators) |
| `js/finos-context.js` | User-state collector + postMessage bridge |
| `js/finos-alerts.js` | Alert bell |
| `js/finos-health-score.js` | Health score badge |
| `js/guard.js` | Auth route guard |
| `js/arya-sidebar-panel.js` | Arya AI sidebar panel — 4-tab (Chat/Plan/Map/Life), all 94 pages; 1,879 lines; IIFE; injects own CSS; `AryaSidebar` public API |
| `js/arya-roadmap.js` | Self-contained visual engine — 935 lines; `injectStyles()`, `renderRoadmap()`, `renderMindmap()` (pan/zoom SVG), `renderTimeline()` (drag-scroll); `AryaRoadmap` public API |
| `js/[page].js` (81 files) | Per-page logic |

### Backend Services

| Service | Path | Tech | Protocol + Port |
|---|---|---|---|
| Voice AI WebSocket | `voiceagent/agent.py` | Python asyncio + websockets 16.x | **ws://127.0.0.1:8765** (plain, no SSL) |
| Arya AI Backend | `Porfolio Analyser/server.py` | Python + Ollama HTTP | **http://127.0.0.1:8766** |
| Alert Engine + Health Score | `alerts/alert-engine.py` | FastAPI 0.110+ + APScheduler 3.x | http://127.0.0.1:8001 |
| News Intel | `app.py` | Flask 3.0+ | http://127.0.0.1:5000 |
| Chatbot | `chatbot/brain.py` | Python + QFT engine | http://127.0.0.1:8000 |
| Market Intelligence | `market intelligence/app.py` | Flask + pandas + ta | varies |
| Stock Engine (6 services) | `stock-engine/` | FastAPI + yfinance | varies |
| Budget Backend | `ExpenseTracker/finos_backend/` | Django REST Framework 5.0+ | http://127.0.0.1:8000 |
| Stock Dashboard API | `stock-dashboard/app.py` | Flask + yfinance | http://127.0.0.1:5001 |
| Document AI Parser | `document-ai/server.py` | FastAPI + DocParser | varies |
| RAG Engine **[PLANNED]** | `rag-engine/server.py` | FastAPI + LlamaIndex | http://127.0.0.1:7476 |

### RAG Stack **[PLANNED — see RAG_SYSTEM.md]**

| Component | Library / Model | Mode | Notes |
|---|---|---|---|
| Orchestration | LlamaIndex 0.10+ | Local | Hybrid retrieval, `SubQuestionQueryEngine` for multi-hop |
| Vector DB | Qdrant (local binary) | Local, port 6333 | HNSW, 1024-dim, Cosine distance |
| Sparse index | bm25s + SQLite FTS5 | Local | Exact-term match (e.g. "Section 80CCD(1B)") |
| Embedding (primary) | `mxbai-embed-large` via Ollama | Local, Metal | 1024-dim, MTEB 64.68 |
| Embedding (fallback) | `nomic-embed-text` via Ollama | Local, Metal | 768-dim, used for high-volume batch ingestion |
| Reranker | `BAAI/bge-reranker-v2-m3` | Local, PyTorch MPS | Cross-encoder, top-40 → top-8 |
| Generation LLM | `qwen3:14b` via Ollama | Local, Metal | 8.5 GB Q4_K_M, ~50 tok/s on M5 |
| Utility LLM | `qwen3:8b` via Ollama | Local, Metal | Query rewrite, HyDE, sub-question decomposition |
| Faithfulness guard | `cross-encoder/nli-deberta-v3-base` | Local, PyTorch MPS | Post-generation entailment check |
| Cloud fallback | Claude Sonnet 4.6 (Anthropic API) | Remote | Public namespace only — never for user documents |
| Query cache | Redis | Local, port 6379 | 1 hour TTL |
| PII scrubbing | presidio-analyzer + presidio-anonymizer | Local | PAN/Aadhaar/account-number masking before persistence |

Full detail: [RAG_SYSTEM.md](RAG_SYSTEM.md), [RAG_HARDWARE.md](RAG_HARDWARE.md), [RAG_MODELS.md](RAG_MODELS.md).

### AI / ML Stack

| Component | Library / Model | Mode | Notes |
|---|---|---|---|
| LLM inference | Ollama (local) + qwen2.5:3b (preferred) | Local CPU/GPU | Smallest-first model picker |
| LLM fallback models | qwen3:4b → qwen3:8b → qwen3:14b | Local CPU/GPU | Selected if smaller not available |
| Speech-to-Text | faster-whisper 1.2.1 (tiny, int8) | Local CPU | 8 threads, VAD filter |
| TTS (primary) | edge-tts 6.1.9+ (en-IN-PrabhatNeural, hi-IN-MadhurNeural) | Local, needs internet | Neural voices |
| TTS (fallback) | Piper TTS | Fully offline | Set `USE_PIPER=true` |

### Database & Infrastructure

| Component | Provider / Version |
|---|---|
| Database | Supabase (Postgres 15) |
| Auth | Supabase Auth (GoTrue) |
| Realtime | Supabase Realtime (Phoenix Channels) |
| Hosting | Vercel (Hobby tier) |
| CDN | Vercel Edge Network (global) |
| Market data | yfinance — no API key needed |
| News data | Google News RSS — no API key needed |
| Cloud AI proxy | OpenRouter via `api/chat.js` — `OPENROUTER_API_KEY` required |

---

## 3. Voice Agent Technical Specification

### WebSocket Server

| Parameter | Value |
|---|---|
| Protocol | `ws://` (plain, no SSL — reverted to git HEAD) |
| Host | `"127.0.0.1"` — binds IPv4 loopback only |
| Port | `8765` |
| Address (browser → agent) | `ws://127.0.0.1:8765` |
| Library | `websockets 16.x` |
| SSL | None (no self-signed cert, no `ssl=` param) |
| Max message size | 50 MB (`max_size=50_000_000`) |
| Ping interval | None (disabled) |
| Concurrency | 1 active session at a time |

### Inference Configuration

| Parameter | Value | Notes |
|---|---|---|
| `HISTORY_TURNS` | `10` | Restored to original; provides better context |
| `num_ctx` | `8192` | Smaller KV cache vs original 32768 |
| `num_predict` | `400` | Voice needs 2–3 sentences max |
| `num_keep` | `0` | KV-reuse disabled |
| `LLM_FIRST_TOKEN_TIMEOUT` | `45 s` | Fail faster |
| `temperature` | `0.75` | |
| `top_p` | `0.92` | |
| `top_k` | `40` | |
| `repeat_penalty` | `1.10` | |
| `num_thread` | `8` | CPU threads for inference |

### Model Picker

`_pick_ollama_model()` in `agent.py` queries Ollama's model list at startup. Preference order (smallest/fastest first):

```
qwen2.5:3b  (min RAM: 4 GB)   ← preferred
qwen3:4b    (min RAM: 6 GB)
qwen3:8b    (min RAM: 10 GB)
qwen3:14b   (min RAM: 16 GB)
```

Override: set `OLLAMA_MODEL=qwen2.5:3b` in `voiceagent/.env`.

### STT (faster-whisper)

| Parameter | Value |
|---|---|
| Model size | `tiny` (int8 quantised) |
| Threads | `8` |
| Directory | `voiceagent/models/` |
| VAD | Enabled |

### TTS (edge-tts)

| Voice key | Voice ID | Language |
|---|---|---|
| `english` | `en-IN-PrabhatNeural` | Indian English |
| `hindi` | `hi-IN-MadhurNeural` | Hindi |
| `hinglish` | `en-IN-PrabhatNeural` | Hinglish (Indian English voice) |

Rate: `+12%`, Pitch: `-3Hz`.

---

## 4. Widget Technical Specification

| Parameter | Value |
|---|---|
| Version query string | `?v=7` (all 183 pages) |
| Coverage | ALL 96 HTML pages + ALL 88 calculator pages |
| Iframe preload | 2 s after page load via `setTimeout(_loadIframe, 2000)` |
| Context send delay | 200 ms after iframe `load` event (was 800 ms) |
| Context refresh interval | Every 90 s (`setInterval(sendContextToIframe, 90_000)`) |
| Navigation close delay | 240 ms after `closeWidget()` → `window.location.href` |
| Alert badge poll | Every 5 min (`setInterval`, 3 s initial delay) — localhost only |
| Alert badge endpoint | `http://127.0.0.1:8001/alerts/:userId?unread_only=true&limit=1` |

### Navigation Engine (voiceagent/index.html)

| Spec | Value |
|---|---|
| `FINOS_PAGES` entries | 130+ (all 96 HTML pages + all 88 calculators) |
| Trigger detection | `NAV_TRIGGER` regex: English + Hindi/Hinglish trigger words |
| Match algorithm | Longest keyword match in `FINOS_PAGES[].keys` array |
| Min keyword score | 5 characters (to avoid accidental matches) |
| Navigation delay | 200 ms (show message → postMessage) |
| postMessage type | `finos_navigate` with fields: `{ type, url, label }` |
| Intercept points | `sendText()` + `user_transcript` WebSocket message handler |

---

## 5. Vercel Configuration

### `vercel.json` Key Sections

**Rewrites:** 23 path aliases (e.g. `/track` → `/html/track-finances.html`, `/budget` → `/ExpenseTracker/finos-budget/index.html`).

**Global headers (`/(.*)`)**:

| Header | Value |
|---|---|
| `Content-Security-Policy` | Includes `ws://127.0.0.1:* wss://127.0.0.1:* http://127.0.0.1:* wss://localhost:*` in `connect-src` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Permissions-Policy` | `microphone=(self)` — allows Web Speech API in voiceagent |

**voiceagent/index.html override** (after global rule — last rule wins):

| Header | Value |
|---|---|
| `X-Frame-Options` | `SAMEORIGIN` — allows same-origin iframe embedding |
| `Content-Security-Policy` | Full CSP with `frame-ancestors 'self'` |

**Cache-Control:**
- `/(.*\.html)` → `no-cache, no-store, must-revalidate`
- `/js/(.*\.js)` → `no-cache, no-store, must-revalidate`
- `/css/(.*\.css)` → `no-cache, no-store, must-revalidate`
- `/assets/(.*)` → `public, max-age=2592000, immutable`

### `api/chat.js` Edge Function

| Parameter | Value |
|---|---|
| Runtime | `export const config = { runtime: 'edge' }` |
| Route | `POST /api/chat` |
| Default model | `google/gemini-2.0-flash-001` |
| Upstream | `https://openrouter.ai/api/v1/chat/completions` |
| Streaming | SSE (`text/event-stream`) supported |
| Auth | `OPENROUTER_API_KEY` env var (Vercel dashboard only) |
| Error handling | try-catch around upstream fetch; returns 502 on network error |
| Current status | Deployed but unused (`CLOUD_MODE = false`) |

---

## 6. Performance Requirements

| Metric | Target |
|---|---|
| LCP (Vercel CDN) | <800 ms |
| FID | <100 ms |
| CLS | <0.1 |
| Calculator load | <1000 ms |
| Calculator result render | <100 ms after input |
| JS bundle per page | <50 KB |
| FOUC on page load | 0 (anti-FOUC on all 96 pages) |
| Theme switch | 0 ms (CSS variable update) |
| Voice first audio | <2 s |
| STT latency (Whisper tiny) | <150 ms |
| LLM first token (qwen2.5:3b) | <500 ms |
| LLM first token (qwen3:14b) | <1500 ms |
| TTS first audio chunk | <400 ms |
| Alert scheduler interval | 15 min |
| Widget iframe preload | 2 s background (zero wait on open) |
| Navigation end-to-end | ~440 ms (200 ms signal + 240 ms close animation) |

---

## 7. Security Requirements

| Requirement | Implementation |
|---|---|
| Authentication | Supabase Auth — email/password, JWT |
| Row-level security | RLS on all tables — `auth.uid() = user_id` |
| Service key isolation | `service_role` key only in backend `.env`, never in browser |
| AI privacy | All LLM/STT/TTS local — zero external inference |
| Voice data | Cleared from RAM on WebSocket disconnect |
| Session context | `sessionStorage` only — tab-scoped, never external |
| HTTPS | Enforced by Vercel (HSTS: 2 years) |
| WebSocket | ws:// plain — `127.0.0.1` only (loopback, not reachable externally) |
| Iframe security | `frame-ancestors 'self'` on voiceagent/index.html — no third-party embedding |
| CSP | Explicit allowlist for `connect-src`, `script-src`, `style-src` |
| Cloud AI key | `OPENROUTER_API_KEY` in Vercel env vars only — never browser-visible |
| CORS (alert engine) | `127.0.0.1` / `localhost` origins only |

---

## 8. Theme System Requirements

| Requirement | Specification |
|---|---|
| Anti-FOUC | Inline IIFE as **first child of `<head>`**, before any `<link>` |
| Theme persistence | Written to `finos-theme`, `theme`, and `FINOS_SYS_SETTINGS.theme` |
| CSS variables | All colour values via `var(--token)` — no hardcoded hex outside token files |
| Light-mode coverage | 360 rules in `theme.css` covering all component types |
| Hover system | Zero-fill vocabulary — all effects via `interactions.css` |
| Inline style blocks | Must not contain hardcoded dark hex or opacity surfaces |
| Toggle coverage | Theme toggle on **all 96 pages** |
| WCAG compliance | `color-scheme` set per theme; native controls adapt automatically |

---

## 9. Accessibility Requirements (WCAG AA)

| Standard | Target |
|---|---|
| Contrast (normal text) | ≥4.5:1 |
| Contrast (large text) | ≥3:1 |
| Focus indicators | Visible `:focus-visible` ring on all interactive elements |
| Keyboard nav | All functionality reachable without mouse |
| Screen reader | Semantic HTML + proper ARIA roles |
| Reduced motion | `prefers-reduced-motion` respected |
| Mouse users | `data-focus-source="mouse"` suppresses outline for mouse-only users |

---

## 10. PWA Requirements

| Feature | Implementation |
|---|---|
| Manifest | `manifest.json` — name, icons, theme colour, display |
| Service worker | `sw.js` — network-first HTML, cache-first assets |
| Offline | Calculators + education pages offline; AI requires local services |
| Push | VAPID via pywebpush + `push_subscriptions` Supabase table |

---

## 11. Integration Contracts

### Supabase
```
SUPABASE_URL              https://oeapcyucnduhwpgxfknb.supabase.co
SUPABASE_ANON_KEY         eyJ...  (browser-safe, public)
SUPABASE_SERVICE_ROLE_KEY eyJ...  (backend .env ONLY — never in browser)
```

### Ollama
```
Base URL     http://localhost:11434
Protocol     NDJSON streaming via /api/chat (not /api/generate)
Model        qwen2.5:3b (preferred) → qwen3:4b → qwen3:8b → qwen3:14b
Options      num_ctx=8192, num_predict=400, temperature=0.75
think        False (top-level kwarg, not inside options — required for qwen3)
```

### Voice Agent WebSocket
```
URL          ws://127.0.0.1:8765   (plain, no SSL — reverted to git HEAD)
TLS          None
Auth         None (localhost-only, no external access)
Library      websockets 16.x (Python)
```

### Arya AI Backend (Portfolio.AI server.py)
```
URL          http://127.0.0.1:8766
Protocol     HTTP (not deployed to Vercel — local only)
Endpoints    POST /arya             (non-streaming JSON response)
             POST /arya/stream      (SSE streaming response)
Analysis     llama3.1:latest — num_ctx=2560, temperature=0.25, max_tokens=700
Chat         llama3.2:3b    — num_ctx=1536, temperature=0.30, max_tokens=300
```

### Alert Engine
```
Base         http://127.0.0.1:8001
Auth         None (localhost-only)
Key field    user_id param on all user-scoped endpoints
Health       GET /health → {"status":"ok"}
```

### OpenRouter (Cloud AI — optional)
```
URL          https://openrouter.ai/api/v1/chat/completions
Auth         Bearer OPENROUTER_API_KEY (Vercel env var)
Proxy        api/chat.js (Vercel Edge Function)
Default model google/gemini-2.0-flash-001
Status       Deployed but disabled (CLOUD_MODE=false)
```

---

## 12. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Zero-build frontend | Runs with `python -m http.server 3000` |
| No required API keys | yfinance + Google RSS — no keys; Ollama — local; Supabase — optional |
| Dependency isolation | Each Python service in its own `.venv` |
| Backwards compatibility | Both `finos-theme` and `theme` localStorage keys checked |
| Graceful degradation | Voice offline → widget shows OFFLINE; calculators work without any backend |
| Offline first | All 88 calculators + all education pages fully offline |
| No git requirement | Deploy directly via `vercel --prod --yes` (no git repo) |
| Widget universality | `finos-widget.js?v=7` on every page — 96 HTML + 88 calculators = 184 pages |
