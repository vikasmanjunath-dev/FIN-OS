# FIN•OS — Financial Operating System

> India's most complete personal finance platform.  
> Education · Intelligence · Voice AI · Calculators · Markets · Tracking — all in one place.

**Last updated:** June 13, 2026 — Portfolio.AI v10 Arya deep upgrade: rich live macro context (Nifty session tone, India VIX regime signal, USD/INR, Crude, Gold — injected into every prompt), smart dynamic chips (_aryaDynamicChips: concentration/tax/VIX/momentum alerts), enhanced aryaFormat (VERDICT callout, ⚡ ARYA'S CALL styled box, OVERWEIGHT/UNDERWEIGHT badges, bullet styling), window._macroLive wired to renderMacroTile. Anti-hallucination: 16 vectors eliminated, NSE sector map, chat temp 0.30. File: 22,570 lines. Voice agent: ws://127.0.0.1:8765.

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
| [DATABASE.md](docs/DATABASE.md) | All Supabase tables, RLS policies, migrations, env vars |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel deployment (no git), vercel.json, api/chat.js, checklist |
| [API_REFERENCE.md](docs/API_REFERENCE.md) | All backend endpoints (Flask, FastAPI, Django, Portfolio.AI) |
| [WEBSOCKET_PROTOCOL.md](docs/WEBSOCKET_PROTOCOL.md) | Full ws:// message schema between browser and agent.py |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md) | Adding calculators, pages, alert rules, voice intents |

---

## What Is FIN•OS

FIN•OS is a full-stack personal finance operating system built for Indian users. It is not a single app — it is an entire ecosystem of interconnected tools, education modules, market dashboards, AI assistants, and financial calculators running under one roof.

**Platform metrics (June 10, 2026):**

| Dimension | Count / Value |
|---|---|
| HTML pages | **96** (94 in `html/` + `index.html` + `login.html`) |
| Financial calculators | **88** across 9 categories |
| CSS stylesheets | **45** (incl. design tokens + interaction system) |
| JavaScript modules | **88** |
| Design tokens (CSS vars) | **133** |
| Light-mode CSS rules | **360** |
| React budget app pages | 11 |
| Python backend services | 9 |
| Supabase tables | 10+ |
| Voice AI WebSocket | `ws://127.0.0.1:8765` (plain, no SSL — local only) |
| Voice AI model | qwen2.5:3b preferred / auto-selected via `_pick_ollama_model()` (Ollama, local) |
| STT | faster-whisper tiny int8 (local, 8 threads) |
| TTS | Edge Neural — en-IN-PrabhatNeural / hi-IN-MadhurNeural |
| Widget coverage | ALL 96 pages + ALL 88 calculators (`finos-widget.js?v=7`) |
| Navigation engine | 130+ routes, voice + text navigation |
| Vercel Edge Function | `api/chat.js` — OpenRouter proxy (deployed, `CLOUD_MODE=false`) |
| Portfolio.AI version | **v10** — **22,570 lines**, 10 pages, Arya AI on all pages, QGLP + rich macro context + smart chips, server.py :8766 |

---

## Platform Architecture (Summary)

```
Browser (finos1.vercel.app — HTTPS)
├── 96 HTML pages + 88 calculators + React budget app
│
├── css/design-tokens.css    → 133 CSS variables — single source of truth
├── css/interactions.css     → 180+ premium hover effects (zero-fill)
├── css/theme.css            → 360 light-mode override rules
├── css/base.css             → Reset, typography, focus rings
├── css/layout.css           → Sidebar, mobile nav
├── css/components.css       → Shared UI components
│
├── js/theme-init.js         → Anti-FOUC: runs before first CSS paint
├── js/interactions.js       → Inline hover override engine
├── js/ui.js                 → Theme toggle, card entrance, focus tracking
├── js/finos-widget.js?v=7   → AI overlay (ALL 184 pages)
│     ├─ preloads iframe 2s after page load (zero-wait on open)
│     ├─ postMessage bridge (finos_user_context / finos_request_context)
│     └─ navigation listener (finos_navigate → window.location.href)
├── js/finos-context.js      → User state collector
├── js/finos-alerts.js       → Real-time alert bell
└── js/finos-health-score.js → Live 0–100 score badge
       │
       │  iframe: voiceagent/index.html (same Vercel origin)
       │    ├─ Navigation Engine: FINOS_PAGES[130+] + detectNavIntent()
       │    └─ WS_URL: ws://127.0.0.1:8765 (plain, no SSL)
       │
       │  ws://127.0.0.1:8765  (plain WebSocket — no SSL)
       ▼
Local Python services
├── voiceagent/agent.py      → faster-whisper tiny + qwen2.5:3b + edge-tts
│     ├─ WS_HOST: "127.0.0.1", WS_PORT: 8765 (plain ws://)
│     ├─ HISTORY_TURNS: 10, num_ctx: 8192, num_predict: 400
│     └─ No SSL cert — plain WebSocket
├── Porfolio Analyser/server.py → Arya AI HTTP :8766 (llama3.1:latest + llama3.2:3b)
├── alerts/alert-engine.py   → FastAPI :8001 (APScheduler, 10 rules)
├── app.py                   → Flask :5000 (News Intel)
└── chatbot/brain.py         → Python :8000 (QFT engine)
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

All 96 pages, 88 calculators, and education modules work with just this.

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
| Page coverage | 100% — all 96 pages have anti-FOUC + theme toggle |

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
├── html/                       94 main app pages
├── css/                        45 stylesheets
├── js/                         88 JavaScript modules
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
│   ├── index.html              Voice agent UI + navigation engine (original UI)
│   ├── requirements.txt        faster-whisper, ollama, edge-tts, websockets, httpx
│   ├── schema.sql              Supabase agent_memories table DDL
│   └── .env.example            Env var template
├── alerts/
│   └── alert-engine.py         FastAPI :8001 — 10 rules, VAPID push
├── ExpenseTracker/
│   └── finos-budget/           React 19 + Vite 5 budget app
├── TradeJournal/               Trade journal
├── Porfolio Analyser/          Portfolio.AI v10 (22,570-line single-file quant app)
│   ├── portfolio-analyser-v10.html   Full institutional quant suite + Arya AI on all 10 pages
│   └── server.py                    Arya AI backend — HTTP :8766 (llama3.1:latest + llama3.2:3b)
├── docs/                       12 documentation files (v1.3+)
└── .vercelignore               Excludes Python backends, node_modules, SSL certs
```

---

## Deployment

**No git repository** — deploy directly:

```bash
cd "Initial Deployment"
vercel --prod --yes
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full checklist, vercel.json reference, and rollback procedure.
