# FIN-OS — Architecture

> Version: 1.4 | Date: June 10, 2026 | Live: https://finos1.vercel.app

---

## System Overview

FIN-OS splits into a **static Vercel frontend** (96 pages / 88 calculators / React sub-app / Vercel Edge Function) and a **fully local Python backend**. All AI — STT, LLM, TTS — runs on the user's machine for privacy and zero inference cost.

```
Browser  (finos1.vercel.app — HTTPS)
  96 HTML pages + 88 calculators + React budget app

  CSS LAYER
    design-tokens.css   133 CSS variables — single source of truth
    interactions.css    180+ hover effects (zero-fill vocabulary)
    theme.css           360 light-mode override rules
    base.css            Reset + typography + WCAG focus rings
    layout.css          Sidebar + mobile nav
    components.css      Shared UI components
    [page].css          38 per-page stylesheets

  JS LAYER
    theme-init.js         Anti-FOUC: runs before first CSS paint
    interactions.js       Hover-override engine
    ui.js                 Theme toggle + card entrance + focus tracking
    finos-widget.js?v=7   AI overlay (ALL 96 pages + ALL 88 calculators)
      ├─ iframe preloads voiceagent/index.html (2 s after page load)
      ├─ postMessage bridge: finos_user_context, finos_request_context
      └─ navigation listener: finos_navigate → closeWidget() + window.location.href
    finos-context.js      User-state collector
    finos-alerts.js       Real-time alert bell
    finos-health-score.js Live 0-100 score badge
         │
         │  ws://127.0.0.1:8765  (plain WebSocket — no SSL)
         ▼
  voiceagent/index.html  (loaded as iframe — same Vercel origin, original UI)
    Navigation Engine     detectNavIntent() + navigateTo() + FINOS_PAGES[130+]
    WS client            ws://127.0.0.1:8765 (plain)
    Web Speech fallback  pumpSpeakQueue() + SpeechSynthesis API
         │
         │  ws://127.0.0.1:8765
         ▼
Local Python
    voiceagent/agent.py        faster-whisper tiny + qwen2.5:3b (preferred) + edge-tts
                               WS_HOST="127.0.0.1", WS_PORT=8765, HISTORY_TURNS=10, no SSL
    Porfolio Analyser/server.py  Arya AI HTTP :8766 (llama3.1:latest + llama3.2:3b, local only)
    alerts/alert-engine.py     FastAPI :8001 (APScheduler, 10 rules)
    app.py                     Flask :5000   (News Intel)
    chatbot/brain.py           Python :8000  (QFT engine)
    stock-engine/              FastAPI  (6 services, 14 endpoints)
    stock-dashboard/app.py     Flask :5001
         │                         │
         ▼                         ▼
    Supabase                   Ollama :11434
  (Auth + Postgres + RLS)     (local LLM server)

  ─── Vercel Edge (serverless) ───
  api/chat.js               POST /api/chat — OpenRouter proxy
                            Runtime: Vercel Edge (ESM → CJS compiled)
                            Model: google/gemini-2.0-flash-001 (default)
                            Status: deployed, CLOUD_MODE=false (disabled)
```

---

## Component Map

### Frontend — Deployed to Vercel

| Component | Path | Tech | Notes |
|---|---|---|---|
| Main app pages | `html/` | HTML5 + CSS + JS | 94 pages |
| Public pages | `index.html`, `login.html` | HTML5 + CSS + JS | No auth guard |
| Calculator suite | `calculators/` | Standalone HTML | 88 tools, 9 categories |
| Budget app | `ExpenseTracker/finos-budget/` | React 19 + Vite 5 + Tailwind | 11 pages |
| Voice agent UI | `voiceagent/index.html` | HTML + Vanilla JS | iframe target for widget |
| Trade Journal | `TradeJournal/` | HTML + JS + Supabase | |
| Portfolio Analyser | `Porfolio Analyser/` | HTML + JS | CSV upload + voice |
| Stock Dashboard | `stock-dashboard/index.html` | HTML + JS | |
| Chat Edge Function | `api/chat.js` | Vercel Edge Runtime | OpenRouter proxy |

### Backend — Local Only (never deployed to Vercel)

| Service | Path | Tech | Port |
|---|---|---|---|
| Voice AI WebSocket | `voiceagent/agent.py` | Python asyncio + websockets 16.x | **ws://127.0.0.1:8765** (plain) |
| Arya AI Backend | `Porfolio Analyser/server.py` | Python + Ollama HTTP | **http://127.0.0.1:8766** |
| Alert Engine + Health Score | `alerts/alert-engine.py` | FastAPI 0.110+ + APScheduler | http://127.0.0.1:8001 |
| News Intel API | `app.py` | Flask 3.0+ | http://127.0.0.1:5000 |
| Chatbot Brain | `chatbot/brain.py` | Python (QFT engine) | http://127.0.0.1:8000 |
| Market Intelligence | `market intelligence/app.py` | Flask + pandas + ta | varies |
| Stock Engine | `stock-engine/` | FastAPI + yfinance | varies |
| Stock Dashboard API | `stock-dashboard/app.py` | Flask + yfinance | http://127.0.0.1:5001 |
| Budget Backend | `ExpenseTracker/finos_backend/` | Django REST Framework 5.0+ | http://127.0.0.1:8000 |
| Document AI Parser | `document-ai/server.py` | FastAPI + DocParser | varies |

---

## Voice Agent Architecture (Updated June 10 2026)

### Protocol — Plain ws:// (reverted to git HEAD)

The agent runs over **plain `ws://`** (no TLS). `agent.py` does NOT generate SSL certs and does NOT pass an `ssl=` argument to `websockets.serve()`.

The browser client (`voiceagent/index.html`) always connects to:
```javascript
const WS_URL = 'ws://127.0.0.1:8765';
```

No one-time browser cert trust step is needed. The voice agent works immediately on `python agent.py`.

### Model Picker (smallest-first for latency)

`_pick_ollama_model()` queries Ollama's `/api/tags` and returns the first available model in this order:
```
qwen2.5:3b  →  qwen3:4b  →  qwen3:8b  →  qwen3:14b
```
Override via `OLLAMA_MODEL` in `voiceagent/.env`.

### Inference Configuration

| Parameter | Value | What it controls |
|---|---|---|
| `WS_HOST` | `"127.0.0.1"` | Binds IPv4 loopback only |
| `WS_PORT` | `8765` | WebSocket port |
| `HISTORY_TURNS` | `10` | Turns kept in RAM for context |
| `num_ctx` | `8192` | Ollama KV-cache size |
| `num_predict` | `400` | Max output tokens |
| `num_keep` | `0` | KV reuse disabled |
| `LLM_FIRST_TOKEN_TIMEOUT` | `45 s` | Fail-fast threshold |

### AI Pipeline

```
Microphone (MediaRecorder, WebM/Opus or WAV)
  ↓ binary frames over ws://
faster-whisper tiny (int8, 8 threads, VAD filter)
  ↓ transcript
qwen2.5:3b via Ollama :11434 (streaming, num_ctx=8192)
  ↓ streamed tokens → token/audio_seq WS messages
Edge Neural TTS (edge-tts, en-IN-PrabhatNeural / hi-IN-MadhurNeural)
  ↓ base64 MP3 chunks → audio_seq WS messages
AudioContext playback in browser
```

### Memory Context Priority (injected into every LLM prompt)

1. Live page state — from `finos-context.js` via postMessage bridge
2. Session history — last 10 turns in `deque(maxlen=20)` in `agent.py`
3. Persistent memory — `agent_memories` Supabase table (vector-matched)
4. Financial DNA — `profiles.financial_dna`, life stage, risk tolerance
5. Intent rules — `_INTENT_RULES` dict in `agent.py`

---

## Navigation Engine (voiceagent/index.html)

Added June 7, 2026. Intercepts navigation intent **before** the message is sent to Ollama.

```
User text / voice transcript
  ↓
detectNavIntent(text)
  ├─ NAV_TRIGGER regex (English + Hindi/Hinglish trigger words)
  └─ FINOS_PAGES[130+] keyword matching (longest-match wins)
       ↓ match found
navigateTo(page)
  ├─ shows "📍 Navigating to [Label]..." bubble in chat
  └─ after 200ms: postMessage { type:'finos_navigate', url, label }
       ↓ received by finos-widget.js in parent
closeWidget() → setTimeout(240ms) → window.location.href = url
```

`FINOS_PAGES` covers all 96 HTML pages and all 88 calculators.
Both `sendText()` (typed) and the `user_transcript` WebSocket message handler check `detectNavIntent()` and short-circuit if a match is found.

---

## Widget Architecture (`js/finos-widget.js?v=7`)

### Coverage

`finos-widget.js?v=7` is included on **every page** of the platform:
- All 96 HTML pages (via `../js/finos-widget.js?v=7`)
- All 88 calculator pages (via `../../js/finos-widget.js?v=7`)

Total: **184 pages** with the widget script.

### Lifecycle

```
Page loads
  → 2 s after DOMContentLoaded: _loadIframe() sets iframe.src = AGENT_URL
      (preload — iframe is ready before user clicks the FAB)
  → iframe loads voiceagent/index.html (same Vercel origin)
  → 200 ms delay: sendContextToIframe() pushes finos_user_context postMessage
  → every 90 s: sendContextToIframe() refreshes context

User clicks FAB
  → openWidget() (no iframe load wait — already preloaded)
  → backdrop + popup CSS transitions open (0.22 s)

User says "take me to SIP calculator"
  → voiceagent/index.html detectNavIntent() returns match
  → navigateTo() postMessage { type:'finos_navigate', url:'/calculators/investment & wealth/sip.html' }
  → widget.js listener: closeWidget() → 240 ms → window.location.href = url

Alert badge (localhost only)
  → polls http://127.0.0.1:8001/alerts/:userId (localhost check guards this)
  → shows red badge on FAB if unread_count > 0
```

---

## Design System Architecture

### CSS Load Order

```
1. design-tokens.css    133 CSS variables — all theme values defined once
2. base.css             imports design-tokens; reset + typography + focus rings
3. layout.css           sidebar + mobile nav
4. components.css       shared UI components
5. theme.css            360 light-mode overrides (loaded last among globals)
6. interactions.css     hover system (uses !important to beat inline styles)
7. [page].css           page-specific styles
```

### Design Token System

`css/design-tokens.css` is the single source of truth for all 133 CSS variables.
Dark mode values defined in `:root` and `:root[data-theme="dark"]`.
Light mode values defined in `:root[data-theme="light"]`.

Key token groups:
- Backgrounds:  `--bg-main`, `--bg-surface`, `--bg-glass`, `--bg-sidebar`
- Text:         `--text-primary`, `--text-secondary`, `--text-muted`, `--text-inverse`
- Accent:       `--accent`, `--accent-primary`, `--accent-secondary`, `--accent-soft`
- Semantic:     `--color-success/error/warning/info` (+ `-soft` variants)
- Borders:      `--border-soft`, `--border-medium`, `--border-hard`
- Shadows:      `--card-shadow`, `--card-shadow-hover`, `--shadow-0..5`
- Spacing:      `--space-1` (4px) to `--space-36` (144px) — 8-point scale
- Typography:   `--font-sans`, `--font-mono`, `--fs-xs..--fs-hero`, `--fw-normal..--fw-black`

### Hover System

`css/interactions.css` — zero-fill hover vocabulary:
- Cards:     `translateY(-4px)` + border-glow + depth shadow
- Nav:       text brightens + icon to accent (no fill)
- Buttons:   brightness + glow ring (no flat fill)
- Tabs:      border brightens + accent (no fill)
- TOC:       2px left accent bar slides in
- Rows:      left accent bar + text shift

`js/interactions.js` runs once at `DOMContentLoaded`:
1. Scans `[onmouseover]` / `[onmouseout]` for background fills
2. Classifies elements (card/link/button) → assigns `data-hover` attribute
3. Strips background-setting handlers
4. Applies `MutationObserver` to catch JS-set backgrounds during hover

### Anti-FOUC Architecture

Every HTML `<head>` starts with this inline script (before any `<link>`):

```html
<script>
  (function(){
    var t=localStorage.getItem('finos-theme')||localStorage.getItem('theme')||'dark';
    document.documentElement.setAttribute('data-theme',t);
  })();
</script>
```

Theme is persisted to: `localStorage['finos-theme']`, `localStorage['theme']`, `FINOS_SYS_SETTINGS.theme`.

---

## Arya AI Architecture (Portfolio.AI, June 10 2026)

Arya AI is the embedded analyst inside Portfolio.AI (`portfolio-analyser-v10.html`). It uses a separate local backend (`server.py`) distinct from the voice agent.

### Backend — `Porfolio Analyser/server.py`

```
POST /arya         → non-streaming JSON response
POST /arya/stream  → SSE streaming (text/event-stream)
Port: 8766 (HTTP, local only — NOT deployed to Vercel)

Analysis model:  llama3.1:latest  — num_ctx=2560, temperature=0.25
Chat model:      llama3.2:3b      — num_ctx=1536, temperature=0.45
Client max_tokens: 700 (analysis) / 300 (chat follow-up)
```

### Page Detection — MutationObserver

```javascript
// Replaces fragile go() hook chain
const observer = new MutationObserver(() => {
    const activePage = document.querySelector('.page.on[id^="page-"]');
    if (activePage) _aryaHandlePageChange(activePage.id);
});
observer.observe(document.body, { subtree: true, attributeFilter: ['class'] });
// Also fires immediately for the currently active page on setup
```

Immune to all `go()` overrides. Fires once per real page change.

### Pre-Computed Signals (JS → LLM)

| Signal | Formula |
|---|---|
| Kelly criterion | `f* = winRate - (1-winRate)/(avgGain/avgLoss)`, capped at 40% |
| Earnings yield vs G-Sec | `earningsYield - 7.2%` — positive = margin of safety |
| Downside risk stocks | Stocks >20% from 52-week low |
| Portfolio Health Score | 0–100 across P&L, win rate, diversification, quality, momentum |
| Top-3 concentration | Combined weight of top 3 holdings (%) |

### Cross-Page Intelligence

```javascript
// Each page stores facts when Arya runs
_aryaFacts['overview'] = { healthScore: 72, topHolding: 'RELIANCE 18%', ... };
_aryaFacts['equity']   = { kellyF: 0.28, earningsYieldSpread: 1.4, ... };

// Current page's prompt includes other pages' facts
function _aryaGetCrossCtx(currentPage) {
    return Object.entries(_aryaFacts)
        .filter(([k]) => k !== currentPage)
        .map(([k, v]) => `[${k}] ${JSON.stringify(v)}`)
        .join('\n');
}
```

### QGLP System Prompt

Based on Motilal Oswal PMS / Saurabh Mukherjea framework:
- **Quality:** ROE > 15%, D/E < 1, consistent earnings
- **Growth:** Revenue CAGR > 15% (5Y), EPS growth acceleration
- **Longevity:** Competitive moat, low promoter pledge, no debt spiral
- **Price:** Earnings yield > G-Sec (7.2%) margin of safety

Output format: VERDICT sentence first → 3 focused sections → `⚡ ARYA'S CALL: NSE:SYMBOL — [ACTION] ₹[amount] · [conviction] · [10-word reason]`

### TTS Architecture

Voices pre-loaded at page load (`speechSynthesis.getVoices()`). `speak()` called synchronously inside `onclick` handler (inside user-gesture call stack). Chrome heartbeat: `pause()` / `resume()` every 10 seconds prevents Chrome's TTS from cutting off long responses.

---

## Alert Engine Architecture

```
FastAPI :8001  (http://127.0.0.1:8001)
  APScheduler (15-min interval)
    → all 10 AlertRule subclasses → each active user
       check(user, profile) → Optional[Alert]
       cooldown per rule (1–7 days)
       priority: info / warning / critical
  Supabase client
    reads:  profiles, transactions, holdings, goals
    writes: alerts, push_subscriptions
  pywebpush (VAPID)
    → Web Push to subscribed browsers

finos-widget.js polls http://127.0.0.1:8001/alerts/:userId
  (localhost only — guarded by hostname check)
  interval: every 5 min, initial delay: 3 s
```

---

## Security Model

| Layer | Control |
|---|---|
| Authentication | Supabase Auth (JWT, email/password) |
| Row-level security | RLS on all tables — `auth.uid() = user_id` |
| Service keys | Only in backend `.env` — never in browser code |
| AI processing | Fully local — no external LLM API calls |
| Voice data | Cleared from RAM on WebSocket disconnect |
| Session context | `sessionStorage` only — tab-scoped, never sent external |
| HTTPS | Enforced by Vercel (`Strict-Transport-Security: max-age=63072000`) |
| WebSocket | ws:// (plain) — 127.0.0.1 only (loopback), no external access |
| Iframe embedding | `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'` on voiceagent/index.html |
| CSP | `connect-src` explicitly allows `ws://127.0.0.1:*`, `wss://127.0.0.1:*`, `wss://localhost:*` |
| Cloud AI key | `OPENROUTER_API_KEY` stored in Vercel env vars only — never in frontend code |

---

## Performance Targets

| Metric | Target |
|---|---|
| LCP (Vercel CDN) | <800ms |
| Calculator load | <1000ms |
| Calculator result | <100ms after input |
| Voice first audio | <2s |
| LLM first token (qwen2.5:3b) | <500ms |
| LLM first token (qwen3:14b) | <1500ms |
| Theme switch | 0ms (CSS variable update) |
| FOUC | 0 (anti-FOUC on all 96 pages) |
| JS bundle per page | <50KB |
| Widget iframe preload | 2 s after page load (background) |
| Navigation latency | ~440ms total (200ms postMessage + 240ms close animation) |
| Alert badge poll | every 5 min, localhost only |
