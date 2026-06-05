# FIN•OS — Financial Operating System

> India's most complete personal finance platform.  
> Education · Intelligence · Voice AI · Calculators · Markets · Tracking — all in one place.

**Last updated:** June 6, 2026 — UI/UX overhaul complete: hover system rebuilt (180+ effects, zero-fill vocabulary), light/dark theme deep audit (360 rules, 96 pages fully verified), 133-token design system, FOUC prevention on all pages, theme toggle 100% coverage.

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
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System map, AI pipeline, data flows, security model |
| [SETUP.md](docs/SETUP.md) | Local dev setup — prerequisites, voice agent, all services |
| [VOICE_AGENT.md](docs/VOICE_AGENT.md) | Voice agent config, profile extraction, intent rules, extending |
| [DATABASE.md](docs/DATABASE.md) | All Supabase tables, RLS policies, migrations, env vars |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel deployment, checklist, rollback |
| [API_REFERENCE.md](docs/API_REFERENCE.md) | All backend endpoints (Flask, FastAPI, Django) |
| [WEBSOCKET_PROTOCOL.md](docs/WEBSOCKET_PROTOCOL.md) | Full WS message schema between browser and agent.py |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md) | Adding calculators, pages, alert rules, voice intents |

---

## What Is FIN•OS

FIN•OS is a full-stack personal finance operating system built for Indian users. It is not a single app — it is an entire ecosystem of interconnected tools, education modules, market dashboards, AI assistants, and financial calculators running under one roof.

**Platform metrics (June 2026):**

| Dimension | Count |
|---|---|
| HTML pages | **96** (94 in `html/` + `index.html` + `login.html`) |
| Financial calculators | **88** across 9 categories |
| CSS stylesheets | **45** (incl. design tokens + interaction system) |
| JavaScript modules | **88** |
| Design tokens (CSS vars) | **133** |
| Light-mode CSS rules | **326** |
| React budget app pages | 11 |
| Python backend services | 9 |
| Supabase tables | 10+ |
| Voice AI model | qwen3:14b (Ollama, local) |
| STT | faster-whisper tiny (local) |
| TTS | Edge Neural TTS (local, en-IN / hi-IN) |

---

## Platform Architecture (Summary)

```
Browser (finos1.vercel.app)
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
├── js/finos-widget.js       → Zero-config AI layer (every page)
├── js/finos-context.js      → User state collector
├── js/finos-alerts.js       → Real-time alert bell
└── js/finos-health-score.js → Live 0–100 score badge
       │
       │  WebSocket  ws://localhost:8765
       ▼
Local Python services
├── voiceagent/agent.py      → faster-whisper + qwen3:14b + edge-tts
├── alerts/alert-engine.py   → FastAPI :8001 (APScheduler, 10 rules)
├── app.py                   → Flask :5000 (News Intel)
└── chatbot/brain.py         → Python :8000 (QFT engine)
       │
       ▼
Supabase  (Auth + Postgres + Realtime + RLS)
Ollama    :11434  (local LLM server)
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
| Action buttons | `filter: brightness` + 36px shadow |
| Theme / utility buttons | Rotate + scale + glow ring |

`js/interactions.js` runs once on `DOMContentLoaded` to neutralise inline `onmouseover` background handlers and apply `data-hover` attribute overrides.

### Design Token System (`css/design-tokens.css`)

133 CSS variables are the single source of truth. All values adapt when `[data-theme="light"]` is applied to `<html>`.

```css
/* Backgrounds */    --bg-main, --bg-surface, --bg-glass, --bg-sidebar
/* Text */           --text-primary, --text-secondary, --text-muted, --text-inverse
/* Accent */         --accent, --accent-primary, --accent-secondary, --accent-soft
/* Semantic */       --color-success/error/warning/info  (+ -soft variants)
/* Borders */        --border-soft, --border-medium, --border-hard
/* Shadows */        --card-shadow, --card-shadow-hover, --shadow-0 … --shadow-5
/* Spacing */        --space-1 (4px) … --space-36 (144px)   [8-point scale]
/* Radii */          --radius-sm … --radius-pill
/* Typography */     --font-sans, --font-mono, --fs-xs … --fs-hero, --fw-normal … --fw-black
```

### Theme System

| Mechanism | Detail |
|---|---|
| Anti-FOUC | Inline `<script>` IIFE in `<head>` before any `<link>` — reads `localStorage`, sets `data-theme` before first paint |
| Persistence | Written to `finos-theme`, `theme`, and `FINOS_SYS_SETTINGS.theme` on every toggle |
| Light-mode coverage | 360 rules in `theme.css` cover all card types, inputs, tables, modals, search, toasts, skeletons, inline-style patterns |
| WCAG compliance | `color-scheme` set per theme; native controls (scrollbars, checkboxes, selects) adapt automatically |
| Page coverage | 100% — all 96 pages have anti-FOUC + theme toggle |

---

## Folder Structure

```
Initial Deployment/
├── index.html                  Public landing page
├── login.html                  Auth page (no guard)
├── manifest.json               PWA manifest
├── sw.js                       Service worker (network-first HTML, cache-first assets)
├── app.py                      News Intel API (Flask :5000)
│
├── html/                       94 app pages
├── css/                        45 stylesheets
│   ├── design-tokens.css       133 CSS variables (single source of truth)
│   ├── interactions.css        Premium hover system (180+ rules)
│   ├── theme.css               Light/dark overrides (360 rules)
│   ├── base.css                Global reset, typography, focus rings
│   ├── layout.css              Sidebar, mobile nav, topbar
│   ├── components.css          Shared UI components
│   └── [page].css              38 per-page stylesheets
├── js/                         88 JS modules
│   ├── theme-init.js           Anti-FOUC theme applier
│   ├── interactions.js         Hover override engine
│   ├── ui.js                   Theme toggle + card animation + focus tracking
│   ├── finos-widget.js         AI overlay (every page)
│   ├── finos-context.js        User state collector
│   ├── finos-alerts.js         Alert bell
│   ├── finos-health-score.js   Health score badge
│   └── [page].js               80 per-page modules
├── assets/
│   ├── icons/                  SVG PWA icons
│   └── images/                 Editorial images
│
├── calculators/                88 standalone calculators
│   ├── banking & fixed income/      10 tools
│   ├── core-thinking/               10 tools
│   ├── desi reality check/          10 tools
│   ├── financial health/             6 tools
│   ├── investment & wealth/         16 tools
│   ├── loans, debt & emi/           11 tools
│   ├── retirement & life planning/   7 tools
│   ├── tax & salary/                10 tools
│   └── trading & markets/            8 tools
│
├── voiceagent/                 Voice AI (local Python only)
│   ├── agent.py                WebSocket server :8765
│   ├── index.html              Voice UI (iframe target)
│   ├── requirements.txt
│   ├── schema.sql              agent_memories Supabase table
│   └── .env.example
│
├── alerts/                     Alert Engine (FastAPI :8001, local only)
│   ├── alert-engine.py
│   ├── rules.py                10 proactive alert rules
│   ├── health_score.py         6-pillar 0–100 score engine
│   ├── schema.sql
│   └── requirements.txt
│
├── chatbot/                    Text chatbot (Python :8000)
├── market intelligence/        Trade signal API (Flask)
├── stock-engine/               Stock data API (FastAPI — 6 services, 14 endpoints)
├── stock-dashboard/            Stock research UI (Flask :5001)
├── document-ai/                Document AI parser (FastAPI — PDF/statement ingestion)
│
├── ExpenseTracker/
│   ├── finos-budget/           React + Vite + Tailwind budget app (11 pages)
│   └── finos_backend/          Django REST API
│
├── TradeJournal/               Trade journal with Supabase sync
├── News1/                      TypeScript/Vite news aggregator
├── Porfolio Analyser/          Portfolio analysis (CSV → voice-queryable)
│
└── docs/                       Technical documentation (12 docs)
    ├── PRD.md                  Product requirements
    ├── FRD.md                  Functional requirements
    ├── TRD.md                  Technical requirements
    ├── SOP.md                  Standard operating procedures
    ├── ARCHITECTURE.md         System architecture
    ├── SETUP.md                Local development setup
    ├── VOICE_AGENT.md          Voice agent reference
    ├── DATABASE.md             Database schema + RLS
    ├── DEPLOYMENT.md           Vercel deployment guide
    ├── API_REFERENCE.md        All backend API endpoints
    ├── WEBSOCKET_PROTOCOL.md   WS message protocol
    └── CONTRIBUTING.md         Contributing guide
```

---

## Quick Start

```bash
# 1. Serve the frontend (no build step needed)
cd "Initial Deployment"
python -m http.server 3000
# → Open http://localhost:3000

# 2. Start voice agent (requires Ollama + qwen3:14b pulled)
cd voiceagent
source .venv/bin/activate
python agent.py

# 3. Start alert engine
cd alerts
source .venv/bin/activate
uvicorn alert-engine:app --port 8001

# 4. Start news API
cd ..
python app.py
```

Full setup including Ollama, Supabase env vars, and all Python services: see [SETUP.md](docs/SETUP.md).

---

## Live URL

**[https://finos1.vercel.app](https://finos1.vercel.app)**

Deploy: `vercel --prod` from inside `Initial Deployment/`
