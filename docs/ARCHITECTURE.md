# FIN-OS — Architecture

> Version: 1.7 | Date: June 20, 2026 | Live: https://finos1.vercel.app

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
    arya-sidebar-panel.js Arya AI panel — 4-tab sidebar (all 94 pages)
      ├─ 💬 Chat | 🗺️ Plan | 🧠 Map | 🌅 Life
      ├─ switchAryaTab() + lazy-render flags
      ├─ ensureRoadmapEngine() — dynamic <script> injection
      └─ AryaSidebar public API: open/close/ask/clearHistory
    arya-roadmap.js       Self-contained visual engine (935 lines)
      ├─ injectStyles() — all .rm-* / .mm-* / .tl-* CSS injected on init
      ├─ renderRoadmap() — DNA-themed step cards
      ├─ renderMindmap() — pan/zoom SVG with touch support
      └─ renderTimeline() — horizontal drag-scroll life-journey
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
    rag-engine/server.py       FastAPI :7476 (RAG — see RAG_SYSTEM.md) [PLANNED]
      ├─ Qdrant :6333            local vector DB (HNSW, 1024-dim)
      ├─ Redis :6379             query result cache (1hr TTL)
      └─ calls Ollama :11434     qwen3:14b (gen) + qwen3:8b (utility) + mxbai-embed-large (embed)
         │                         │
         ▼                         ▼
    Supabase                   Ollama :11434
  (Auth + Postgres + RLS,     (local LLM server)
   + rag_documents/rag_feedback)

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
| RAG Engine **[PLANNED]** | `rag-engine/server.py` | FastAPI + LlamaIndex + Qdrant + Ollama | http://127.0.0.1:7476 |

---

## RAG System (Planned — Not Yet Implemented)

Full retrieval-augmented generation layer for grounded, cited answers over SEBI/RBI regulations, user-uploaded documents, and FIN-OS's own content. Planned for an Apple M5 24GB/1TB local machine, fully local (no cloud dependency by default). See:

- [RAG_SYSTEM.md](RAG_SYSTEM.md) — master reference and design decisions
- [RAG_HARDWARE.md](RAG_HARDWARE.md) — M5 RAM/storage budget and performance targets
- [RAG_PIPELINE.md](RAG_PIPELINE.md) — ingestion → chunking → embedding → retrieval → generation
- [RAG_MODELS.md](RAG_MODELS.md), [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md), [RAG_API.md](RAG_API.md)
- [RAG_INTEGRATION.md](RAG_INTEGRATION.md), [RAG_SECURITY.md](RAG_SECURITY.md), [RAG_EVALUATION.md](RAG_EVALUATION.md)
- [RAG_SETUP.md](RAG_SETUP.md), [RAG_PHASES.md](RAG_PHASES.md) — setup guide and 6-phase build plan

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
Chat model:      llama3.2:3b      — num_ctx=1536, temperature=0.30
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

NSE Sector Map is baked into `_ARYA_SYSTEM` — 10 sectors mapped to ~50 specific stocks. `SECTOR DISCIPLINE` rule prevents cross-sector misclassification (e.g. HDFC Life = Financial Services, never Consumer Goods).

Anti-hallucination rules: (1) only cite portfolio context numbers; (2) no invented PE/ROE/price targets; (3) only OVERWEIGHT/UNDERWEIGHT/NEUTRAL vocabulary; (4) FII flows/RBI dates → redirect to portfolio data; (5) benchmark locked to 12–14% annual Nifty CAGR.

### Live Macro Context (`_aryaGetMarketCtx()` — June 13, 2026)

Appended to every prompt via `aryaPortfolioCtx()`. Reads from `window._macroLive` (populated by `renderMacroTile()` when the macro dashboard updates). Injects:

| Data | Source | Regime signal |
|---|---|---|
| Today's date + FY quarter | `new Date()` | FY-end countdown if <90 days |
| Nifty 50 price + % change | `_macroLive['mac-nifty']` | Session tone (bull/bear/flat) |
| India VIX | `_macroLive['mac-vix']` | 6-tier regime: LOW FEAR → CRISIS MODE |
| USD/INR | `_macroLive['mac-usdinr']` | Import-cost signal (IT vs OMC impact) |
| Crude WTI | `_macroLive['mac-crude']` | ONGC/OMC sector signal |
| Gold | `_macroLive['mac-gold']` | Risk-on / risk-off signal |

`window._macroLive` is populated by `renderMacroTile()` each time the macro dashboard updates (both live fetch and fallback paths). Numeric values are cached alongside display strings. If no macro data is available, only the date + FY quarter is injected.

### Smart Dynamic Chips (`_aryaDynamicChips()` — June 13, 2026)

Computed fresh on every `aryaCall()` response. Returns 2 highest-priority chips based on live portfolio state. Prepended before each page's static chips. Signals checked (in priority order):

| Signal | Threshold | Chip shown |
|---|---|---|
| HHI (concentration) | > 0.25 | `🔴 Fix concentration risk NOW` |
| Tax-loss harvest | FY-end <90d + >₹10K losses | `📅 Tax harvest — ₹Xk savings (Nd left)` |
| India VIX | ≥ 20 | `🛡️ VIX at X — protect my portfolio now` |
| Positions underwater | > 55% of holdings | `💊 X% positions underwater — diagnose` |
| Single stock overweight | > 15% of portfolio | `⚠️ SYMBOL = X% — trim plan?` |
| Nifty sell-off | < −1.5% today | `📉 Nifty X% — what to do right now?` |

### Enhanced Formatter (`aryaFormat()` — June 13, 2026)

`VERDICT:` lines → `.arya-verdict` div (purple left-border callout box).
`⚡ ARYA'S CALL:` → `.arya-callout` div (teal highlighted footer box).
Bullet points (`•`, `·`, `-`) → `.arya-bullet` div with `▸` marker.
Added badges: `OVERWEIGHT` (green), `UNDERWEIGHT` (red), `NEUTRAL` (yellow).

### TTS Architecture

Voices pre-loaded at page load (`speechSynthesis.getVoices()`). `speak()` called synchronously inside `onclick` handler (inside user-gesture call stack). Chrome heartbeat: `pause()` / `resume()` every 10 seconds prevents Chrome's TTS from cutting off long responses.

---

## Arya Sidebar Panel Architecture (v2.0, June 14 2026)

`js/arya-sidebar-panel.js` — 1,879 lines, IIFE pattern, injected on all 94 app pages.

### Panel DOM Structure

```
#arya-sidebar-panel (slide-in panel, right edge)
  #arya-sp-header         (avatar + title + close button)
  #arya-sp-tabs           (tab bar)
    .asp-tab[data-view="chat"]      💬 Chat (active by default)
    .asp-tab[data-view="roadmap"]   🗺️ Plan
    .asp-tab[data-view="mindmap"]   🧠 Map
    .asp-tab[data-view="timeline"]  🌅 Life
  #asp-view-chat   .asp-view.active   (chat messages + chips + input)
  #asp-view-roadmap .asp-view         (arya-rm-container + ask button)
  #asp-view-mindmap .asp-view         (arya-mm-container + ask button)
  #asp-view-timeline .asp-view        (arya-tl-container + ask button)
```

### Tab Switching — `switchAryaTab(name)`

```javascript
switchAryaTab('roadmap')
  ↓ toggles .active on .asp-tab + .asp-view elements
  ↓ if first-time render (_rmRendered === false):
      ensureRoadmapEngine(cb)
        → if window.AryaRoadmap exists: cb() immediately
        → else: inject <script src="arya-roadmap.js"> → s.onload = cb
      cb: el.innerHTML = ''; AryaRoadmap.init(el, null, null)
```

Lazy-render flags prevent double-render: `_rmRendered`, `_mmRendered`, `_tlRendered`.

### `ensureRoadmapEngine(cb)` — Dynamic Script Injection

Resolves the arya-roadmap.js URL by reading the `src` of the currently loaded `arya-sidebar-panel.js` script tag and replacing the filename. This works from any page depth:

```javascript
const panelSrc = Array.from(document.scripts)
  .find(sc => sc.src?.includes('arya-sidebar-panel'))?.src || '';
const roadmapSrc = panelSrc
  ? panelSrc.replace('arya-sidebar-panel.js', 'arya-roadmap.js').split('?')[0]
  : '../js/arya-roadmap.js';  // fallback
```

### CSS Injection Pattern

Both modules inject their own CSS via `document.createElement('style')` at runtime:
- `arya-sidebar-panel.js` → `<style id="arya-sp-styles">` (panel chrome, tabs, views, spinner)
- `arya-roadmap.js` → `<style id="arya-rm-styles">` (roadmap, mindmap, timeline classes)

Both guards check `document.getElementById('*-styles')` before injecting — safe to call multiple times.

### Public API — `window.AryaSidebar`

| Method | Description |
|---|---|
| `AryaSidebar.open()` | Opens the panel |
| `AryaSidebar.close()` | Closes the panel |
| `AryaSidebar.ask(q)` | Switches to Chat tab and sends message `q` |
| `AryaSidebar.clearHistory()` | Clears chat message history |

`AryaRoadmap.init()` uses `window.AryaSidebar.ask(q)` from `.rm-arya-btn` / `.tl-arya-btn` click handlers.

---

## arya-roadmap.js Engine Architecture (935 lines)

`js/arya-roadmap.js` — self-contained visual engine, works with no page-level CSS.

### Public API

```javascript
AryaRoadmap.init(roadmapEl, mindmapEl, timelineEl)
// Pass null for any view to skip rendering.
// Called at top of init(): injectStyles(); const d = loadUserData();
```

### `injectStyles()`

Injects `<style id="arya-rm-styles">` once (idempotent). Covers:
- `.rm-hero`, `.rm-steps`, `.rm-step`, `.rm-step-img-wrap`, `.rm-step-badge`, `.rm-step-body`, `.rm-step-detail`, `.rm-arya-btn`
- `.mm-legend`, `.mm-leg-item`, `.mm-leg-dot`, `.mm-reset-btn`
- `.tl-header`, `.tl-scroll`, `.tl-track`, `.tl-milestones`, `.tl-milestone`, `.tl-milestone-dot`, `.tl-milestone-card`, `.tl-card-*`, `.tl-legend`
- `@keyframes rmFadeIn`, `@keyframes rmSpin`
- Light-theme overrides

### `loadUserData()`

Reads from `localStorage`:
- `finos_dna_result` → archetype (Builder/Guardian/Explorer/Optimizer/Achiever/Visionary/Realist) + gradient pair
- `finos_user_profile` → income, age, risk tolerance, goals

### `renderRoadmap(el, d)`

Generates persona-specific step cards based on DNA archetype and life stage. Each card has:
- Unsplash image `https://images.unsplash.com/{photoID}?w=400&h=220&fit=crop`
- Progress badge, step title, detail text
- `.rm-arya-btn` → calls `AryaSidebar.ask(question)`

### `renderMindmap(el, d)`

SVG-based mind map with:
- Size: `W = Math.min(container.clientWidth, 900)`, `H = Math.max(600, Math.min(720, window.innerHeight - 200))`
- Pan: `mousedown` + `mousemove` (translateX/Y on SVG group)
- Zoom: `wheel` event (scale 0.3–3×)
- Touch: pinch-zoom + drag support
- Reset button `.mm-reset-btn` → restores transform to identity
- DNA color theming per archetype

### `renderTimeline(el, d)`

Horizontal life-journey timeline:
- Drag-scroll via `mousedown` + `mousemove` on `.tl-scroll`
- Milestone cards with Unsplash photos and estimated ages
- `.tl-arya-btn` → calls `AryaSidebar.ask(question)`
- Decade markers + legend

---

## roadmap.html — Interactive 3-View Page (rebuilt June 14 2026)

`html/roadmap.html` was rebuilt from the old static "Cyber GPS" questionnaire into a full interactive 3-view page.

### Old version (removed)
Age slider + income / emergency backup / dependants selectors → generated static protocol advice text.

### New version
3 tabs: **Roadmap** (arya-roadmap.js `renderRoadmap`), **Mind Map** (`renderMindmap`), **Life Journey** (`renderTimeline`).

Key behaviour:
- Roadmap renders immediately on page load
- Mind Map and Life Journey render lazily on first tab click
- Timeline drag-scroll attached via `setTimeout(attachTlDrag, 500)` after timeline renders
- Re-renders on `finos-context-ready` event with `phase === 'full'`
- Scripts: `arya-sidebar-panel.js` + `arya-roadmap.js` both loaded — panel already has the engine, so `ensureRoadmapEngine()` is a no-op

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
