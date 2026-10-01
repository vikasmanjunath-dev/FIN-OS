# FIN•OS — Financial Operating System

> India's most complete personal finance platform.  
> Education · Intelligence · Voice AI · Calculators · Markets · Tracking — all in one place.

**Last updated:** October 1, 2026 — Sitewide JS runtime-error sweep across all 117 `html/` pages + all 88 calculators (10 real bugs found and fixed, including a systemic voice-widget path bug affecting all calculator pages); sidebar nav simplified (Goals/Household removed); `track-finances.html` reorganized from a flat 33-card grid into 9 labeled categories. Previous: Arya AI Sidebar Panel v4.0 (`js/arya-sidebar-panel.js`, 7,945 lines) — 8-tab system (💬 Chat · 🗺️ Plan · 🧠 Map · 🌅 Life · 📊 Pulse · 📅 Cal · 🇮🇳 India · 🤖 Agent) embedded on 113 pages; `arya-roadmap.js` self-contained visual engine (990 lines, `injectStyles()`, pan/zoom SVG mindmap, life-journey timeline with Unsplash cards); `roadmap.html` rebuilt as interactive 3-view page. Portfolio.AI v10 (22,570 lines). Voice agent: ws://127.0.0.1:8765.

---

## Documentation

**Product & Process**

| Doc | What it covers |
|---|---|
| [PRD.md](docs/PRD.md) | Product requirements — goals, user personas, feature list, milestones |
| [FRD.md](docs/FRD.md) | Functional requirements — every module's behaviour, acceptance criteria |
| [TRD.md](docs/TRD.md) | Technical requirements — stack specs, performance budgets, security, integrations |
| [SOP.md](docs/SOP.md) | Standard operating procedures — deploy, debug, incidents, onboarding |

**Engineering Reference**

| Doc | What it covers |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System map, AI pipeline, widget lifecycle, navigation engine, data flows |
| [SETUP.md](docs/SETUP.md) | Local dev setup — voice agent, Portfolio.AI server, all services |
| [VOICE_AGENT.md](docs/VOICE_AGENT.md) | Voice agent config, ws:// connection, navigation engine, latency tuning |
| [VOICE_AI.md](docs/VOICE_AI.md) | Voice AI model selection, STT/TTS pipeline |
| [ARYA_AI.md](docs/ARYA_AI.md) | Arya AI assistant architecture across the site |
| [ARYA_UPGRADES.md](docs/ARYA_UPGRADES.md) | Arya feature upgrade history |
| [DATABASE.md](docs/DATABASE.md) | All Supabase tables, RLS policies, migrations, env vars |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel deployment (no git), vercel.json, api/chat.js, checklist |
| [API_REFERENCE.md](docs/API_REFERENCE.md) | All backend endpoints (Flask, FastAPI, Django, Portfolio.AI) |
| [DJANGO.md](docs/DJANGO.md) | Django service reference |
| [WEBSOCKET_PROTOCOL.md](docs/WEBSOCKET_PROTOCOL.md) | Full ws:// message schema between browser and agent.py |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md) | Adding calculators, pages, alert rules, voice intents |

**RAG Engine**

| Doc | What it covers |
|---|---|
| [RAG_SYSTEM.md](docs/RAG_SYSTEM.md) | RAG system overview |
| [RAG_ARCHITECTURE / PHASES](docs/RAG_PHASES.md) | Build phases |
| [RAG_PIPELINE.md](docs/RAG_PIPELINE.md) | Ingestion/retrieval pipeline |
| [RAG_MODELS.md](docs/RAG_MODELS.md) | Embedding/LLM model choices |
| [RAG_KNOWLEDGE_BASE.md](docs/RAG_KNOWLEDGE_BASE.md) | Knowledge base structure |
| [RAG_API.md](docs/RAG_API.md) | RAG service API |
| [RAG_INTEGRATION.md](docs/RAG_INTEGRATION.md) | Integration with the main app |
| [RAG_SETUP.md](docs/RAG_SETUP.md) | Local setup |
| [RAG_HARDWARE.md](docs/RAG_HARDWARE.md) | Hardware/resource requirements |
| [RAG_SECURITY.md](docs/RAG_SECURITY.md) | Security considerations |
| [RAG_EVALUATION.md](docs/RAG_EVALUATION.md) | Evaluation methodology & metrics |

---

## What Is FIN•OS

FIN•OS is a full-stack personal finance operating system built for Indian users. It is not a single app — it is an entire ecosystem of interconnected tools, education modules, market dashboards, AI assistants, and financial calculators running under one roof.

**Platform metrics (October 1, 2026):**

| Dimension | Count / Value |
|---|---|
| HTML pages | **119** (117 in `html/` + `index.html` + `login.html`) |
| Financial calculators | **88** across 9 categories |
| CSS stylesheets | **44** (incl. design tokens + interaction system) |
| JavaScript modules | **111** (incl. arya-sidebar-panel.js, arya-roadmap.js) |
| Design tokens (CSS vars) | **137** |
| Light-mode CSS rules | **360** |
| Standalone sub-apps | `voiceagent/` (Python), `News1/` (Vite+Express), `TradeJournal/`, `Porfolio Analyser/` — each with its own dev server, not served statically from this root |
| Python backend services | 9 |
| Supabase tables | 10+ |
| Voice AI WebSocket | `ws://127.0.0.1:8765` (plain, no SSL — local only) |
| Voice AI model | qwen2.5:3b preferred / auto-selected via `_pick_ollama_model()` (Ollama, local) |
| STT | faster-whisper tiny int8 (local, 8 threads) |
| TTS | Edge Neural — en-IN-PrabhatNeural / hi-IN-MadhurNeural |
| Widget coverage | ALL 119 pages + ALL 88 calculators (`finos-widget.js?v=10`) |
| Navigation engine | 130+ routes, voice + text navigation |
| Vercel Edge Function | `api/chat.js` — OpenRouter proxy (deployed, `CLOUD_MODE=false`) |
| Portfolio.AI version | **v10** — **22,570 lines**, 10 pages, Arya AI on all pages, QGLP + rich macro context + smart chips, server.py :8766 |

---

## Platform Architecture (Summary)

```
Browser (finos1.vercel.app — HTTPS)
├── 119 HTML pages + 88 calculators
│
├── css/design-tokens.css    → 137 CSS variables — single source of truth
├── css/interactions.css     → 180+ premium hover effects (zero-fill)
├── css/theme.css            → 360 light-mode override rules
├── css/base.css             → Reset, typography, focus rings
├── css/layout.css           → Sidebar, mobile nav
├── css/components.css       → Shared UI components
│
├── js/theme-init.js         → Anti-FOUC: runs before first CSS paint
├── js/interactions.js       → Inline hover override engine
├── js/ui.js                 → Theme toggle, card entrance, focus tracking
├── js/finos-widget.js?v=10  → AI overlay (ALL 119 pages + 88 calculators)
│     ├─ preloads iframe 2s after page load (zero-wait on open)
│     ├─ postMessage bridge (finos_user_context / finos_request_context)
│     └─ navigation listener (finos_navigate → window.location.href)
├── js/finos-context.js      → User state collector
├── js/finos-alerts.js       → Real-time alert bell
├── js/finos-health-score.js → Live 0–100 score badge
├── js/arya-sidebar-panel.js → Arya AI sidebar panel (113 pages)
│     ├─ 8-tab system: 💬 Chat | 🗺️ Plan | 🧠 Map | 🌅 Life | 📊 Pulse | 📅 Cal | 🇮🇳 India | 🤖 Agent
│     ├─ switchAryaTab() — lazy-renders visual views on first click
│     ├─ ensureRoadmapEngine() — dynamic <script> injection for arya-roadmap.js
│     └─ AryaSidebar public API: open(), close(), ask(q), clearHistory()
└── js/arya-roadmap.js       → Self-contained visual engine (990 lines)
      ├─ injectStyles() — injects all .rm-* / .mm-* / .tl-* CSS on init
      ├─ renderRoadmap() — DNA-themed step cards with Unsplash images
      ├─ renderMindmap() — pan/zoom SVG (mousedown, wheel, touch)
      └─ renderTimeline() — horizontal life-journey timeline (drag-scroll)
       │
       │  iframe: voiceagent/index.html (same Vercel origin)
       │    ├─ Navigation Engine: FINOS_PAGES[130+] + detectNavIntent()
       │    └─ WS_URL: ws://127.0.0.1:8765 (plain, no SSL)
       │
       │  ws://127.0.0.1:8765  (plain WebSocket — no SSL)
       ▼
Local Python services (9 total)
├── voiceagent/agent.py      → faster-whisper tiny + qwen2.5:3b + edge-tts
│     ├─ WS_HOST: "127.0.0.1", WS_PORT: 8765 (plain ws://)
│     ├─ HISTORY_TURNS: 10, num_ctx: 8192, num_predict: 400
│     └─ No SSL cert — plain WebSocket
├── Porfolio Analyser/server.py → Arya AI HTTP :8766 (llama3.1:latest + llama3.2:3b)
├── alerts/alert-engine.py   → FastAPI :8001 (APScheduler, 10 rules)
├── app.py                   → Flask :5000 (News Intel)
├── chatbot/brain.py         → Python :8000 (QFT engine)
├── arya-ai/server.py        → Arya AI service (auth.py, config.py, tts.py)
├── document-ai/server.py    → Document analysis (parser.py)
├── market intelligence/app.py → Market data (fundamental/intraday/long/swing)
└── rag-engine/server.py     → RAG pipeline (jobs.py, scheduler.py, metrics.py)
       │
       ▼
Supabase  (Auth + Postgres 15 + Realtime + RLS)
Ollama    :11434  (local LLM server)

─── Vercel Edge ───────────────────────────────────
api/chat.js  →  POST /api/chat  →  OpenRouter (deployed, disabled)
```

---

## Quick Start

### Frontend only (no AI)

```bash
cd "Initial Deployment"
python -m http.server 3000
# Open http://localhost:3000
```

All 119 pages, 88 calculators, and education modules work with just this.

### Voice AI (local Ollama)

```bash
# 1. Pull fastest model
ollama pull qwen2.5:3b

# 2. Start Ollama
ollama serve

# 3. Start voice agent (plain ws://, no SSL)
cd voiceagent && source .venv/bin/activate && python agent.py

# 4. Open http://localhost:3000 → click AI FAB → widget shows ONLINE ✅
#    (No SSL cert trust step needed — plain ws://)
```

---

## UI/UX Design System

### Hover System (`css/interactions.css` + `js/interactions.js`)

The site uses a **zero-fill hover vocabulary** — no flat background fills on hover, only depth and light cues:

| Element type | Effect |
|---|---|
| Cards | `translateY(-4px)` + border-glow + ambient depth shadow |
| Nav / sidebar links | Text brightens + icon shifts to accent (zero fill) |
| Ghost / outline buttons | Border accent glow + box-shadow ring |
| Primary buttons | `filter: brightness(1.06)` + deeper glow shadow |
| Tabs / chips | Border brightens + accent colour (zero fill) |
| TOC links | Left 2px accent bar slides in |
| Table rows / list items | Left accent bar + slight text shift |

`js/interactions.js` runs once on `DOMContentLoaded` to strip inline `onmouseover` background handlers and apply `data-hover` attribute overrides. Uses `MutationObserver` to catch JS-set backgrounds during hover.

### Design Token System (`css/design-tokens.css`)

133 CSS variables — single source of truth. All values adapt when `[data-theme="light"]` is applied to `<html>`.

```css
/* Backgrounds */  --bg-main, --bg-surface, --bg-glass, --bg-sidebar
/* Text */         --text-primary, --text-secondary, --text-muted, --text-inverse
/* Accent */       --accent, --accent-primary, --accent-secondary, --accent-soft
/* Semantic */     --color-success/error/warning/info  (+ -soft variants)
/* Borders */      --border-soft, --border-medium, --border-hard
/* Shadows */      --card-shadow, --card-shadow-hover, --shadow-0 … --shadow-5
/* Spacing */      --space-1 (4px) … --space-36 (144px)  [8-point scale]
/* Typography */   --font-sans, --font-mono, --fs-xs … --fs-hero
```

### Theme System

| Mechanism | Detail |
|---|---|
| Anti-FOUC | Inline `<script>` IIFE in `<head>` before any `<link>` |
| Persistence | `localStorage['finos-theme']`, `localStorage['theme']`, `FINOS_SYS_SETTINGS.theme` |
| Light-mode coverage | 360 rules in `theme.css` |
| Page coverage | 100% — all 119 pages have anti-FOUC + theme toggle |

---

## Portfolio.AI — Feature Map (v10, June 13, 2026)

`Porfolio Analyser/portfolio-analyser-v10.html` is a standalone **22,570-line** single-page institutional quant suite for Zerodha portfolios. Arya AI is embedded on all 10 pages.

**Arya backend:** `server.py` on port **8766** (HTTP, local only). Analysis model: `llama3.1:latest` (num_ctx 2560, temp 0.25). Chat model: `llama3.2:3b` (num_ctx 1536, temp 0.30).

**Arya AI improvements (June 13, 2026):** Rich live macro context (Nifty session tone, India VIX regime signal, USD/INR, Crude, Gold) injected into every prompt via `_aryaGetMarketCtx()`. Smart dynamic chips auto-computed from portfolio state (`_aryaDynamicChips` — concentration/tax-harvest/VIX/momentum). Enhanced `aryaFormat()` with VERDICT callout box, styled ⚡ ARYA'S CALL footer, OVERWEIGHT/UNDERWEIGHT/NEUTRAL badges, bullet styling. `window._macroLive` cache wired to `renderMacroTile()`. Anti-hallucination: 16 vectors eliminated, NSE sector map enforced, chat temperature 0.30.

### Pages / Tabs

| Section | Feature |
|---|---|
| **Overview** | Squarified treemap (EQ+ETF / MF split) · Sankey flow · Sector bubble chart · Arya AI |
| **Holdings (Equity)** | EQ table · MF table · ETF deep-dive · SIP future value calculator · Arya AI |
| **Sectors** | Sector-level allocation, P&L, concentration risk · Arya AI |
| **Insights** | AI-generated portfolio insights · Arya AI |
| **Tax Planner** | Tax-loss harvesting · STCG/LTCG breakdowns · cost-basis estimation · Arya AI |
| **Rebalance Planner** | ⚖ Rebalance · 💰 Deploy Cash · 📅 SIP Auto-Allocator · Arya AI |
| **Analytics & Health** | Health score · Risk-adjusted metrics · Correlation matrix · Factor exposure · Arya AI |
| **Quant Intelligence** | 10-tab quant engine · Arya AI |
| **Research Hub** | Per-stock technical analysis · fundamentals · quant screens · Arya AI |
| **Watchlist & Screener** | 6 preset screens, custom filters, localStorage watchlist · Arya AI |

### Quant Intelligence Tabs

| Tab | Feature |
|---|---|
| 📐 Alpha Metrics | IR · Jensen's α · Treynor · Active Share · Tracking Error · Sharpe · Sortino |
| 📡 Signals | Momentum/reversal · RSI · pairs detector · statistical alpha predictions |
| 🎲 Monte Carlo | 10,000-path portfolio fan chart **+ Per-Holding MC probability cones** (new) |
| ⚙️ Optimization | Mean-variance efficient frontier · Sharpe-maximising weights |
| 📜 Backtesting | Strategy backtester **+ Rebalance Frequency Comparison Q vs A vs B&H** (new) |
| ⚡ Stress Tests | Historical scenario stress · CVaR · return distribution |
| 🔗 Correlation | Full Pearson heatmap · best/worst pairs · diversification score |
| 📊 Factor & Risk | Factor radar · risk decomposition · rolling perf · attribution · frontier |
| 🛡️ Hedge | **Options Overlay** (new): Nifty put insurance · covered call builder · IV vs HV |
| 🧬 FF5 Factors | **Fama-French 5-Factor Regression** (new): Mkt-RF · SMB · HML · RMW · CMA |

### SIP Auto-Allocation Algorithm

```
deficit(holding) = max(0, targetPct - currentPct) × (totInv + sipAmount)
sipAlloc(holding) = deficit(holding) / Σdeficits × sipAmount
```
Holdings at or above target receive ₹0. Zero selling → zero capital gains tax.

### Black-Scholes Hedging (Options Overlay)

```
d1 = (ln(S/K) + (r + σ²/2)T) / (σ√T)
d2 = d1 - σ√T
Put = K·e^(-rT)·N(-d2) - S·N(-d1)   [S=1 normalized, r=7% India RFR]
N(x) via erf(|x|/√2) — Abramowitz & Stegun 7.1.26
```

### Fama-French 5-Factor Model

| Factor | Source | India Premium |
|---|---|---|
| Mkt-RF | `SECTOR_BETA` weighted avg | 15%/yr |
| SMB | Cap-adjusted sector loading | 4%/yr |
| HML | P/B tilt from sector | 5%/yr |
| RMW | ROE proxy from sector | 4%/yr |
| CMA | Capex discipline from sector | 3%/yr |

---

## Arya AI Sidebar Panel (v4.0 header label, internal sections go up to v6.0)

`js/arya-sidebar-panel.js` (7,945 lines) is an IIFE injected on 113 app pages. It provides a slide-in panel with an **8-tab system** so users can access AI chat, financial roadmap, mind map, life timeline, financial pulse, spending calendar, India affordability map, and a standalone agent view from any page without navigating away.

### Tab System

| Tab | Label | Content |
|---|---|---|
| 💬 Chat | Chat | Arya AI chat (existing) — Ollama `qwen3:14b`, page-scoped context, follow-up chips |
| 🗺️ Plan | Plan | Personalised financial roadmap — DNA-themed step cards (Unsplash images, progress badges) |
| 🧠 Map | Map | Interactive SVG mind map — pan (drag), zoom (scroll/pinch), click-to-expand nodes |
| 🌅 Life | Life | Life-journey timeline — horizontal scroll, milestone cards with photos, drag-scroll |
| 📊 Pulse | Pulse | Live financial pulse/health dashboard (`#arya-pulse-container`) |
| 📅 Cal | Cal | Spending calendar (`#arya-cal-container`) |
| 🇮🇳 India | India | India affordability map (`#arya-map-container`) |
| 🤖 Agent | Agent | Standalone agent view (`#arya-agent-container`) |

### Architecture

- **Lazy rendering** — visual tabs only render on first click; `_rmRendered`/`_mmRendered`/`_tlRendered` flags prevent double-renders.
- **`ensureRoadmapEngine(cb)`** — if `arya-roadmap.js` is not on the page, dynamically injects a `<script>` tag by deriving the URL from the panel script's own `src` attribute. Calls `cb` on load.
- **`switchAryaTab(name)`** — swaps `active` class on `.asp-tab` buttons and `.asp-view` panels; triggers lazy-render for roadmap / mindmap / timeline.
- **"Ask Arya" buttons** — each visual view has an `.asp-view-ask-btn` that switches to the Chat tab and fires a pre-filled question via `sendMessage()`.
- **Public API** — `AryaSidebar.open()`, `AryaSidebar.close()`, `AryaSidebar.ask(q)`, `AryaSidebar.clearHistory()`.

### arya-roadmap.js Engine (990 lines)

`js/arya-roadmap.js` is a fully self-contained visual module. It can be loaded on any page (no additional CSS required):

```javascript
// Public API
AryaRoadmap.init(roadmapEl, mindmapEl, timelineEl);
// Pass null for views you don't want rendered.
// injectStyles() is called automatically — no <style> block needed.
```

`injectStyles()` injects a `<style id="arya-rm-styles">` tag (guard: runs once) with all `.rm-*`, `.mm-*`, and `.tl-*` classes. The engine reads `localStorage` for Financial DNA archetype, risk profile, income, age, and goals to personalise all three views.

---

## Folder Structure

```
Initial Deployment/
├── index.html                  Public landing page
├── login.html                  Auth page
├── manifest.json               PWA manifest
├── sw.js                       Service worker
├── vercel.json                 Rewrites, security headers, CSP, iframe override
├── api/
│   └── chat.js                 Vercel Edge Function — OpenRouter proxy
├── html/                       117 main app pages
├── css/                        44 stylesheets
├── js/                         111 JavaScript modules
├── assets/                     Images, icons, fonts
├── calculators/                88 standalone HTML calculators
│   ├── investment & wealth/    sip.html, sip-optimizer.html, swp.html ...
│   ├── loans, debt & emi/      emi.html, home.html, car.html ...
│   ├── banking & fixed income/ fd.html, ppf.html, epf.html, nps.html ...
│   ├── tax & salary/           income.html, oldnew.html, 80c.html ...
│   ├── retirement & life planning/
│   ├── financial health/
│   ├── trading & markets/
│   ├── desi reality check/
│   └── core-thinking/
├── voiceagent/
│   ├── agent.py                WebSocket AI server (ws://127.0.0.1:8765 — plain, no SSL)
│   ├── index.html              Voice agent UI + navigation engine (standalone — needs its own run.sh, 404s under a plain static server)
│   ├── requirements.txt        faster-whisper, ollama, edge-tts, websockets, httpx
│   ├── schema.sql              Supabase agent_memories table DDL
│   └── .env.example            Env var template
├── alerts/
│   └── alert-engine.py         FastAPI :8001 — 10 rules, VAPID push
├── arya-ai/                    Arya AI service — server.py, auth.py, config.py, tts.py
├── chatbot/                    brain.py — QFT engine, Python :8000
├── document-ai/                Document analysis — server.py, parser.py
├── market intelligence/        Market data service — app.py, fundamental/intraday/long/swing.py
├── rag-engine/                 RAG pipeline — server.py, jobs.py, scheduler.py, metrics.py, .venv/
├── stock-engine/                Stock research backend
├── mobile/                      Expo/React Native app ("finos-mobile") — separate from the web site
├── scripts/                     Maintenance/one-off scripts
├── tests/                       pytest suite (conftest.py, test_health_score.py, test_rules.py)
├── supabase/                    Supabase project config/migrations
├── News1/                       Standalone Vite+Express+Supabase news microservice — needs its own `npm run dev`, raw index.html 404s under a plain static server
├── TradeJournal/               Trade journal (standalone, own CSS/JS, no build step)
├── Porfolio Analyser/          Portfolio.AI v10 (22,570-line single-file quant app)
│   ├── portfolio-analyser-v10.html   Full institutional quant suite + Arya AI on all 10 pages
│   └── server.py                    Arya AI backend — HTTP :8766 (llama3.1:latest + llama3.2:3b)
├── docs/                       27 documentation files
└── .vercelignore               Excludes Python backends, node_modules, SSL certs
```

Note: the Expense Engine card on `track-finances.html` links to `http://localhost:5173/`, a standalone Vite dev server that is not currently present in this repo snapshot — run it separately if you have that project checked out elsewhere, or the card shows its own "local app offline" message.

---

## Deployment

Tracked in git (`origin` → `github.com/vikasmanjunath-dev/FIN-OS`, branch `main`), but Vercel deploys directly from the local files regardless of git state — no push required first:

```bash
cd "Initial Deployment"
vercel --prod --yes
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full checklist, vercel.json reference, and rollback procedure.
