# FIN-OS — Technical Requirements Document (TRD)

**Owner:** Vikas Manjunath | **Version:** 1.9 | **Date:** June 21, 2026 | **Status:** Active — RAG stack table now reflects two real Phase 6 builds (startup warmup, async RQ ingestion with a genuine macOS fork-crash bug found and fixed)

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
| RAG Engine **[Phase 1-5 LIVE]** | `rag-engine/server.py` | FastAPI (direct orchestration, no LlamaIndex) | http://127.0.0.1:7476 |

### RAG Stack — Phase 1-5 built (see [RAG_PHASES.md](RAG_PHASES.md) for exactly what's still open)

| Component | Library / Model | Mode | Status |
|---|---|---|---|
| Orchestration | Direct Python (FastAPI + custom modules) | Local | ✅ Built — **LlamaIndex was planned but not used**; direct `qdrant_client`/`sqlite3`/`httpx` calls proved simpler for this scope, no abstraction layer needed |
| Vector DB | Qdrant (local binary, official GitHub release — no Homebrew formula exists) | Local, port 6333 | ✅ Built, 508 chunks indexed (94 FIN-OS pages + SEBI + RBI) |
| Sparse index | Native SQLite FTS5 `bm25()` on a table named `chunks_fts` (no separate `bm25s` package) | Local | ✅ Built, namespace isolation verified by a real passing pytest, see [RAG_EVALUATION.md](RAG_EVALUATION.md) §6 |
| Embedding (primary) | `mxbai-embed-large` via Ollama | Local, Metal | ✅ Built, confirmed 1024-dim |
| Embedding (fallback) | `nomic-embed-text` via Ollama | Local, Metal | Pulled, not yet exercised |
| Reranker | `BAAI/bge-reranker-v2-m3` | Local, PyTorch MPS | ✅ Built — found & fixed a real device-placement bug, see [RAG_MODELS.md](RAG_MODELS.md) §5. Disk footprint is 2.1 GB (measured) — an earlier 590 MB estimate was wrong. |
| Generation LLM | **`qwen3:8b`** via Ollama (changed from `qwen3:14b`) | Local, Metal | ✅ Built — ~20 tok/s measured (not ~90 as first estimated) |
| Utility LLM | `qwen3:8b` via Ollama | Local, Metal | ✅ Built and wired — powers HyDE (`retrieval/hyde.py`) and multi-hop sub-question decomposition (`retrieval/multi_hop.py`), both opt-in per-request |
| Multi-hop decomposition | `qwen3:8b`-driven query splitting, capped at 2 sub-questions | Local | ✅ Built — verified useful on a real compound question |
| Faithfulness guard | `cross-encoder/nli-deberta-v3-base` | Local, PyTorch MPS | 🟡 Built (Phase 5), but with a **measured reliability gap** on Indian regulatory/financial text — see [RAG_PHASES.md](RAG_PHASES.md) Phase 5. Treat as a noisy signal, not a guarantee. |
| Cloud fallback | ~~Claude Sonnet 4.6 (Anthropic API)~~ | Remote | ❌ **Never built** — listed only as an unscheduled candidate idea in [RAG_PHASES.md](RAG_PHASES.md)'s open-ended Phase 6 wishlist, not an in-progress or committed feature; no cloud LLM call exists anywhere in this codebase today |
| Query cache | Redis | Local, port 6379 | ✅ Built, 1hr TTL, cache hit <5ms measured |
| PII scrubbing | presidio-analyzer + presidio-anonymizer | Local | ✅ Built — found & fixed a false-positive bug, see [RAG_PHASES.md](RAG_PHASES.md) Phase 1 |
| User document upload | `POST /api/upload` (PDF/TXT/MD/HTML → parse → PII scrub → chunk → embed → dual-index) | Local | 🟡 Built and pipeline-verified directly in Python; no live authenticated HTTP upload exercised yet (needs a real Supabase session token) |
| Session auth | Live verification against Supabase `/auth/v1/user` REST endpoint (not local JWT decoding) | Remote call, 60s local cache | ✅ Built — see [RAG_SECURITY.md](RAG_SECURITY.md) §4 |
| Regulatory crawlers | SEBI circulars + RBI notifications, manual-trigger HTTP crawl | Local → remote fetch | ✅ Built for these two sources. AMFI investigated, found infeasible (JS-rendered site). IT Act/Finance Act/IRDAI/PFRDA/NSE-BSE not attempted. |
| Document/feedback registry | Supabase (`rag_documents`, `rag_feedback`) | Remote | ❌ **Not built** — `schema.sql` is written but never applied (no DB credentials available); metadata currently lives only in Qdrant payloads + local SQLite |
| Arya integration | Direct browser→rag-engine calls from `js/arya-sidebar-panel.js` (CORS-enabled), plus 2 Agent tool-calling functions (`rag_query`, `rag_search_regulations`) | Local, browser-driven | ✅ Built — **not** proxied through the `arya-ai` backend, a correction from the original plan, see [RAG_INTEGRATION.md](RAG_INTEGRATION.md) |
| Evaluation | pytest namespace isolation suite (3 tests, passing) + Prometheus `/api/metrics` + a 10-question Indian finance benchmark | Local | ✅ All three built and verified with real traffic/runs. Benchmark: 90% (9/10), one failure root-caused to a real generation-side limitation, see [RAG_PHASES.md](RAG_PHASES.md) Phase 5. RAGAS: attempted, abandoned on a concrete upstream packaging bug, not skipped. No Grafana dashboard (deliberate — same complexity-avoidance call as dropping LlamaIndex/bm25s). |
| Cold-start warmup | `server.py` startup handler loads the reranker + faithfulness NLI model before accepting traffic | Local | ✅ Built, Phase 6 — measured 8.4s combined, moved from taxing the first real query to happening once at boot |
| Async ingestion | RQ (`jobs.py` + `rq worker rag-ingestion`), decouples the three batch ingest endpoints from request/response | Local, Redis-backed | ✅ Built, Phase 6 — verified under real concurrent load (a live SEBI crawl + a live query, simultaneously, neither blocked the other). **Requires `--worker-class rq.worker.SimpleWorker`** — RQ's default forking worker crashes on macOS once torch (pulled in transitively via presidio's spaCy dependency) has touched Metal/MPS; a real bug found and fixed, not a style choice. |

Full detail: [RAG_SYSTEM.md](RAG_SYSTEM.md), [RAG_HARDWARE.md](RAG_HARDWARE.md), [RAG_MODELS.md](RAG_MODELS.md), [RAG_PHASES.md](RAG_PHASES.md) for the complete built-vs-planned breakdown.

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
