# FIN•OS — Financial Operating System

> India's most complete personal finance platform.  
> Education · Intelligence · Voice AI · Calculators · Markets · Tracking — all in one place.

---

## What Is FIN•OS

FIN•OS is a full-stack personal finance operating system built for Indian users. It is not a single app — it is an entire ecosystem of interconnected tools, education modules, market dashboards, AI assistants, and financial calculators running under one roof.

**At a glance:**
- **76 HTML pages** spanning every corner of personal finance
- **100+ financial calculators** across 8 categories, each purpose-built
- **A desi voice AI** that speaks English, Hindi, and Hinglish and knows your complete financial picture
- **A proactive alert engine** watching your money 24/7 with 10 intelligent rules
- **A financial health score** — live 0–100 rating across 6 pillars
- **A React budget app** with AI war room, debt destroyer, FIRE calculator
- **A Django REST backend** for structured data and API services
- **Market intelligence signals** — intraday, swing, fundamental, long-term
- **Trade journal** with P&L analytics and Supabase sync
- **Everything runs locally** — zero cloud AI cost, full privacy

---

## Folder Structure

```
Initial Deployment/
│
├── index.html                    # Public landing page
├── login.html                    # Supabase authentication
├── manifest.json                 # PWA manifest
├── sw.js                         # Service worker
├── app.py                        # News Intel API  (Flask :5000)
│
├── html/                         # 76 main application pages
├── css/                          # 44 stylesheets
├── js/                           # 59 JavaScript files
├── assets/                       # Icons (SVG) + 24 editorial images
├── calculators/                  # 100+ calculators in 8 category folders
│
├── voiceagent/                   # FIN-OS Voice AI v10
├── alerts/                       # Proactive Alert Engine + Health Score
├── chatbot/                      # QFT text chatbot
├── market intelligence/          # AI trade signal API
├── stock-engine/                 # FastAPI stock data engine
├── stock-dashboard/              # Standalone stock research dashboard
│
├── ExpenseTracker/
│   ├── finos-budget/             # React + Vite budget app (11 pages)
│   └── finos_backend/            # Django REST API backend
│
├── TradeJournal/                 # Standalone trade journal + analytics
├── News1/                        # TypeScript/Vite news aggregator
├── Porfolio Analyser/            # Standalone portfolio analyser
└── finos 2/                      # Django project scaffold (legacy)
```

---

## Port Map

| Port | Service | File |
|---|---|---|
| `3000` | Main frontend | `python -m http.server 3000` |
| `5000` | News Intel API | `app.py` (Flask) |
| `8000` | Chatbot Brain | `chatbot/brain.py` |
| `8001` | Alert Engine + Health Score API | `alerts/alert-engine.py` (FastAPI) |
| `8080` | Voice Agent UI | `voiceagent/index.html` |
| `8765` | Voice Agent WebSocket | `voiceagent/agent.py` |
| `11434` | Ollama (local LLM) | system process |

---

## 1. Main Frontend — `html/` + `css/` + `js/`

The core of FIN•OS. 76 HTML pages, each with a dedicated CSS file and JS module.

### Pages by Category

**Core App**
| Page | What It Does |
|---|---|
| `index.html` | Public landing page |
| `login.html` | Supabase email auth |
| `html/home.html` | Post-login hub — quick actions, market snapshot, health score |
| `html/dashboard.html` | Full financial overview — net worth, cashflow, goal progress |
| `html/onboarding.html` | First-run wizard — life stage, goals, risk tolerance, income |
| `html/profile.html` | User profile and account management |
| `html/settings.html` | Preferences — theme, language, persona, currency, number format |
| `html/start.html` | Getting started guide for new users |

**Money Management**
| Page | What It Does |
|---|---|
| `html/track-finances.html` | Expense tracker — add, categorise, view history |
| `html/tracker.html` | Budget tracker — monthly budgets vs actuals |
| `html/portfolio.html` | Investment portfolio — holdings, P&L, allocation |
| `html/tax.html` | Tax calculator — Old vs New regime, deductions |
| `html/calculators.html` | Hub linking to all 100+ calculator tools |
| `html/know-your-finances.html` | Net worth calculator |

**Markets & Investing**
| Page | What It Does |
|---|---|
| `html/markets.html` | Nifty 50, Sensex, sector heatmap |
| `html/market-intel.html` | AI-generated trade signals |
| `html/market-visualizer.html` | Interactive charts and visual tools |
| `html/stock-platform.html` | Full stock research platform |
| `html/quantedge.html` | Quantitative analysis engine |
| `html/equitydetail.html` | Equity deep-dive |
| `html/mfdetail.html` | Mutual fund analyser |
| `html/etfdetail.html` | ETF comparison |
| `html/cryptodetail.html` | Cryptocurrency overview |
| `html/commoditydetail.html` | Gold, Silver, Oil tracking |
| `html/forexdetail.html` | Currency rates |
| `html/derivativesdetail.html` | F&O overview |
| `html/debtdetail.html` | Bonds, NCDs, G-Secs |
| `html/moneydetail.html` | Money market instruments |
| `html/hedgefund.html` | Hedge fund strategies |

**Education — 14 Learn Modules**

| Page | Topic |
|---|---|
| `learn-equity.html` | Equity investing basics and valuations |
| `learn-mf.html` | Mutual funds — SIP, direct vs regular, NAV |
| `learn-debt.html` | Fixed income — FDs, bonds, duration risk |
| `learn-etf.html` | ETFs — tracking error, index selection |
| `learn-fno.html` | F&O — with SEBI warning (90% lose money) |
| `learn-crypto.html` | Crypto basics and India regulation |
| `learn-commodity.html` | Gold, SGBs, commodity ETFs |
| `learn-forex.html` | Currency markets, RBI intervention |
| `learn-insurance.html` | Term vs ULIP vs endowment |
| `learn-fundamental.html` | P/E, P/B, ROE, ROCE |
| `learn-technical.html` | Candlesticks, patterns, trends |
| `learn-analysis.html` | FA + TA combined approach |
| `learn-metrics.html` | Key financial metrics deep-dive |
| `learn-indicators.html` | RSI, MACD, Bollinger Bands |
| `learn-money-market.html` | T-bills, liquid funds, overnight funds |

**5 Deep-Dive Insights**

`insight-sip.html` · `insight-emi.html` · `insight-debt.html` · `insight-inflation.html` · `insight-rbi.html`

**Psychology & Behavioural Finance**

`dna.html` · `clarity.html` · `investor-mindset.html` · `investor-profile.html` · `train-mindset.html` · `mindset-sim-hub.html` · `financial-being.html` · `decision.html` · `not-money.html` · `system-leak.html`

**Roadmaps & Planning**

`roadmap.html` · `roadmaps.html` · `trader-roadmap.html` · `traditional-roadmap.html` · `fear-roadmap.html` · `life-wealth.html` · `principles.html` · `foundations.html` · `finance101.html`

**Tools & Simulators**

`simulator.html` · `trading-simulator.html` · `simulator-landing.html` · `simulator-guide.html` · `impact.html` · `impact-detail.html` · `diagnostics.html` · `insurance-directory.html` · `news.html` · `chat.html`

### Key JS Files (`js/`)

| File | Role |
|---|---|
| `finos-widget.js` | FAB widget + auto-injection of alerts, context, health score |
| `finos-context.js` | Two-phase user context collector (page state + Supabase data) |
| `finos-alerts.js` | Alert bell, slide-out drawer, Supabase Realtime, Web Push |
| `finos-health-score.js` | Health score floating button + animated panel |
| `finos-search.js` | Global search across all pages |
| `guard.js` | Auth route protection on every page |
| `auth.js` | Supabase auth helpers |
| `ui.js` | Global UI utilities and shared components |
| `theme.js` / `theme-init.js` | Dark/light theme management |
| `pwa-init.js` | Service worker registration |
| `firebase-config.js` | Firebase config (auth guard fallback) |
| `mobile-nav.js` | Mobile navigation drawer |
| `data_feed.js` | Live market data feed helpers |

### Shared CSS (`css/`)

`base.css` (reset + CSS variables) · `layout.css` (grid + sidebar) · `components.css` (shared UI) · `animations.css` (global keyframes) + 40 page-specific stylesheets

### Assets (`assets/`)

- `assets/icons/icon-192.svg` + `icon-512.svg` — PWA icons
- `assets/images/` — 24 editorial images used across insight and education pages (sip.jpg, emi.jpg, inflation.jpg, lic-myth.jpg, rbi.jpg, gold-vs-equity.jpg, etc.)

---

## 2. Calculator Suite — `calculators/`

100+ standalone HTML calculators organised into 8 themed categories. Each category has a shared `calculator-base.css` + `calculator-base.js` for consistent UI.

### Category Breakdown

**Banking & Fixed Income** (10 calculators)
`fd.html` · `rd.html` · `ppf.html` · `epf.html` · `nps.html` · `ssy.html` · `scss.html` · `postoffice.html` · `bond.html` · `savingsinvestment.html`

**Investment & Wealth** (15 calculators)
`sip.html` · `stepup.html` · `lupsum.html` · `swp.html` · `cagr.html` · `xirr.html` · `mutualfunds.html` · `etf.html` · `dividend.html` · `goalbased.html` · `assetalloc.html` · `portfolio.html` · `rebalancing.html` · `rollingreturns.html` · `taxadj.html`

**Loans, Debt & EMI** (11 calculators)
`emi.html` · `home.html` · `car.html` · `personal.html` · `education.html` · `creditcard.html` · `emiprepay.html` · `debtsnow.html` · `loaneligibility.html` · `loantenure.html` · `interest.html`

**Tax & Salary** (10 calculators)
`income.html` · `oldnew.html` · `inhand.html` · `80c.html` · `hra.html` · `captalgains.html` · `shortlong.html` · `gratuity.html` · `professional.html` · `leave.html`

**Retirement & Life Planning** (8 calculators)
`retirement.html` · `pensiongap.html` · `postretirement.html` · `annuity.html` · `healthcare.html` · `longevity.html` · `lifeexpentancy.html` · `lifestyle.html`

**Financial Health** (6 calculators)
`networth.html` · `emergencyfund.html` · `savings.html` · `expenseratio.html` · `insurancecoverage.html` · `lifestyle.html`

**Trading & Markets** (10 calculators)
`options.html` · `futurespl.html` · `margin.html` · `positionsize.html` · `brokerage.html` · `breakeven.html` · `riskper.html` · `volatility.html` · `riskper.html` · `volatility.html`

**Core Thinking** (10 calculators)
`compounding-visualizer.html` · `inflation-impact.html` · `time-value-of-money.html` · `opportunity-cost.html` · `real-rate-of-return.html` · `purchasing-power-loss.html` · `risk-vs-reward.html` · `wealth-vs-income-gap.html` · `financial-age-calculator.html` · `money-behavior-analyzer.html`

**Desi Reality Check** (9 calculators)
`buyhouse.html` · `emidiease.html` · `shaadicost.html` · `childedu.html` · `lifestyle.html` · `middleclass.html` · `govvspvt.html` · `parental.html` · `creditaddiction.html` · `logkyakahenge.html`

---

## 3. News Intel API — `app.py` (Port 5000)

Flask backend that aggregates live financial news from Google News RSS feeds.

**Regions:** India + Global  
**Cache:** 10 minutes (600s)  
**Endpoint:** `GET /api/intel`

Returns:
```json
{
  "status": "online",
  "cached_ago": 120,
  "items": [
    {
      "id": "India_0",
      "title": "Sensex surges 400 points...",
      "link": "...",
      "source": "Economic Times",
      "type": "stocks",
      "high_impact": true,
      "region": "India",
      "timestamp": 1716000000
    }
  ]
}
```

**Impact detection:** Auto-flags articles containing surge, crash, record, RBI, Fed, crisis, breakout, inflation, etc. as `high_impact: true`.

```bash
python app.py
# Running on http://0.0.0.0:5000
```

---

## 4. Voice Agent v10 — `voiceagent/`

A fully local, personalised desi voice AI. Runs 100% on your machine — no paid API.

### Files

| File | Role |
|---|---|
| `agent.py` | WebSocket server — STT + LLM + TTS pipeline, all AI logic |
| `index.html` | Full voice agent UI |
| `requirements.txt` | Python: faster-whisper, ollama, edge-tts, websockets, httpx, python-dotenv |
| `schema.sql` | `agent_memories` Supabase table for persistent memory |
| `.env.example` | Template for `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` |
| `run.sh` | Production launch script — setup/start/stop/restart commands |

### AI Pipeline

```
🎤  Microphone
     ↓
faster-whisper tiny   (STT — CPU int8, 8 threads, VAD filter)
     ↓
qwen2.5:3b via Ollama (LLM — fully local, ~2GB RAM)
     ↓   ← User context + health score + persistent memory injected here
edge-tts Neural TTS   (en-IN-PrabhatNeural / hi-IN-MadhurNeural)
     ↓
🔊  Speaker  (streamed sentence-by-sentence, < 500ms first audio)
```

### Language Support

| Mode | Voice | Auto-Detected When |
|---|---|---|
| English | en-IN-PrabhatNeural | Default |
| Hindi | hi-IN-MadhurNeural | Devanagari script in speech |
| Hinglish | en-IN-PrabhatNeural | 2+ desi casual words (yaar, bhai, karo, paise…) |

### Persona

FIN-OS is the brilliant friend who studied finance at IIM and still talks like a real person over chai. Key rules:
- 2–3 sentences max per response (voice-optimised)
- Answer first, explain second — never bury the answer
- Zero markdown — pure spoken language
- Always uses the user's name when known
- 8 Laws of Money baked in (LIC trap, F&O gambling, EMI reality, direct vs regular MF, compounding, insurance separation, home as liability, inflation)
- 10 intent patterns auto-inject topic-specific financial context (LIC / F&O / SIP / Tax / EMI / FIRE / Real estate / PPF / Windfall / Beginner)

### In-RAM Memory

Extracts facts from conversation in real time via regex:
- **Name** (6 patterns) → "my name is Rahul" → `name: Rahul`
- **Income** (3 patterns) → "I earn 12 lakhs" → `income: ₹12L/yr`
- **Age** (4 patterns) → "I am 28" → `age: 28, life_stage: growth`
- **Goals** (7 patterns) → house, FIRE, business, abroad, wedding, education, retire age
- **Family** (4 patterns) → married, kids, dependent parents, single
- **City** (2 patterns) → metro, metro-adjacent
- **Debts** (5 patterns) → home loan, car loan, personal loan, CC debt, edu loan

### Persistent Cross-Session Memory (`MemoryStore`)

On disconnect: LLM generates a 120-word factual summary of the session and saves it to Supabase (`agent_memories` table). On next connect: profile + last 20 turns + summary are restored before the first message.

**Session flow:**
```
Connect → load_persistent_memory() → autosave every 5 min → disconnect → generate_summary() → save
```

Run `voiceagent/schema.sql` in Supabase SQL Editor to create the `agent_memories` table.

### UI Features

3-column layout: Memory panel | Chat + Orb | Stats panel

- **Orb states (desi):** READY HAI / SOCH RAHA... / BOL RAHA... / SUN RAHA... / SAMAJH RAHA... / REC ON BHAI!
- **Canvas waveform** — amplitude driven by state
- **Profile card** — auto-populated from extracted memory (name, age, income, goals, debts)
- **Alerts panel** — shows pending financial alerts, "ALERTS SUNO" reads them aloud via TTS
- **Quick chips** — 5 preset Hinglish question shortcuts
- **Stats panel** — USER / SYNC / MEM / STT / LLM / TTS / LANG / TURNS / LATENCY
- **MEM stat + banner** — shows "✅ cloud" and purple "🧠 MEMORY RESTORED" banner on session restore
- **Persona toggle** — YAAR (casual) / GURU (wise) / STRICT (direct)
- **Language selector** — English / Hinglish / हिंदी
- **Voice speed slider** — 0.6× to 2.0×

### Start

```bash
cd voiceagent
pip install -r requirements.txt
cp .env.example .env        # add SUPABASE_SERVICE_KEY

ollama pull qwen2.5:3b
ollama serve                # terminal 1

python agent.py             # terminal 2 — WS server on :8765
python -m http.server 8080  # terminal 3 — UI on :8080
```

Or use the all-in-one script:
```bash
./run.sh setup    # first time — creates venv, installs deps
./run.sh start    # starts agent + HTTP server
./run.sh stop     # kills all FIN-OS processes
./run.sh restart  # stop + start
```

---

## 5. Proactive Alert Engine — `alerts/`

FastAPI service on port 8001. Watches every user's finances every 15 minutes. Sends alerts in-app (Supabase Realtime) and as native OS push notifications (Web Push / VAPID).

### Files

| File | Role |
|---|---|
| `alert-engine.py` | FastAPI app + APScheduler + yfinance + push delivery |
| `rules.py` | 10 alert rule classes |
| `health_score.py` | 6-pillar financial health scorer |
| `schema.sql` | Supabase tables: alerts, push_subscriptions, alert_preferences |
| `requirements.txt` | fastapi, uvicorn, apscheduler, supabase, pywebpush, py-vapid, yfinance, httpx |
| `.env.example` | Template for Supabase + VAPID keys |

### 10 Alert Rules

| Rule | Cooldown | Priority | Fires When |
|---|---|---|---|
| `sip_missed` | 72h | ⚠️ Warning | No SIP transaction this month (had one before) |
| `salary_credited` | 25 days | 🎉 Celebration | Income transaction in last 5 days |
| `market_drop` | 12h | ⚠️ Warning | Nifty 50 drops > 3% in one day |
| `goal_behind` | 7 days | ⚠️ Warning | Goal < 180 days away but funded < 30% |
| `cc_bill_due` | 48h | 🚨 Critical | Credit card bill due within 5 days |
| `budget_overrun` | 48h | ⚠️ Warning | Spend > 20% over budget in any category |
| `emergency_fund_low` | 7 days | 🚨 Critical | Liquid savings < 3 months of expenses |
| `tax_season` | 6h | ℹ️ Info | 8 calendar triggers (advance tax, ITR, 80C deadline…) |
| `fno_expiry_week` | 7 days | ⚠️ Warning | F&O positions + expiry Thursday within 7 days |
| `net_worth_milestone` | 30 days | 🎉 Celebration | Portfolio crosses ₹1L / ₹5L / ₹10L / ₹25L / ₹50L / ₹1Cr |

### API Endpoints

```
POST   /alerts/subscribe              Register device push subscription
DELETE /alerts/subscribe              Unregister push subscription
GET    /alerts/{user_id}              Fetch user alerts
POST   /alerts/{alert_id}/read        Mark alert read
POST   /alerts/mark-all-read/{uid}    Mark all read
PUT    /alerts/preferences            Set rule on/off per user
GET    /alerts/preferences/{uid}      Get all preferences
GET    /vapid-public-key              Serve VAPID public key to browser
GET    /market                        Nifty 50 live snapshot
POST   /alerts/run                    Manual trigger (dev/admin)
GET    /health                        Engine status + rule count
GET    /health-score/{uid}            Full 6-pillar health score
GET    /health-score/{uid}/summary    Lightweight score summary + 2 tips
```

### Start

```bash
cd alerts
pip install -r requirements.txt
cp .env.example .env

# Generate VAPID keys (once)
python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print('PRIVATE:', v.private_key); print('PUBLIC:', v.public_key)"

# Fill .env: SUPABASE_SERVICE_KEY, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY
python alert-engine.py
```

Run `alerts/schema.sql` in Supabase SQL Editor to create the required tables.  
Enable Realtime in Supabase Dashboard → Database → Replication for `alerts` and `alert_preferences`.

---

## 6. Financial Health Score — `alerts/health_score.py`

Called by `GET /health-score/{user_id}`. Computes a 0–100 score from the user's live Supabase data.

| Pillar | Max | Full Score When |
|---|---|---|
| 🛡️ Emergency Fund | 20 pts | 6+ months of expenses in liquid savings |
| 💳 Debt Management | 20 pts | Zero EMI burden (penalty for CC debt + personal loan) |
| 💰 Savings Rate | 20 pts | 30%+ of income saved (bonus for SIP) |
| 📈 Investment Growth | 20 pts | Diversified portfolio, no heavy F&O, goals funded |
| 🏥 Insurance | 10 pts | Term ≥ 10× income + health cover ≥ ₹10L (ULIP penalty) |
| 📋 Tax Efficiency | 10 pts | 80C maxed + NPS opened + PPF account active |

**Tiers:** 🚨 DANGER (0–39) · ⚠️ FAIR (40–59) · ✅ GOOD (60–74) · 🌟 GREAT (75–89) · 🏆 ELITE (90–100)

The score is injected into the voice agent's LLM context so it can reference it conversationally:  
*"Bhai, tera health score 42 hai — FAIR zone mein ho. Sabse badi problem emergency fund nahi hai..."*

---

## 7. Platform Intelligence Layer — `js/`

Four JS files auto-injected on every page by one script tag. Zero additional markup needed on any of the 76 pages.

```html
<script src="./js/finos-widget.js"></script>
```

This single line gives every page:

| What | File | Description |
|---|---|---|
| **Voice AI FAB** | `finos-widget.js` | Gradient pill button bottom-right, opens voice agent popup |
| **Alert Bell** | `finos-alerts.js` | Bell icon + badge + slide-out drawer + real-time + push |
| **Health Score Button** | `finos-health-score.js` | Live score badge + animated SVG ring panel |
| **Context Pipeline** | `finos-context.js` | Collects full user data from page + Supabase → voice agent |

### How Context Flows

```
finos-context.js (runs on every page)
   Phase 1 (instant): localStorage → onboarding, DNA, settings, cached profile
   Phase 2 (async):   Supabase → profile, transactions, goals, holdings, health score
         ↓
   window.FINOS_USER_CONTEXT + sessionStorage
         ↓ postMessage
Voice Agent iframe (voiceagent/index.html)
         ↓ WebSocket
agent.py — UserContext.to_prompt()
         ↓
Every LLM call — agent knows: name, income, portfolio, goals, page, health score
```

Security: `sessionStorage` only (tab-scoped). `user_id` bound — cross-user injection rejected at both frontend and backend. Context cleared from RAM on WebSocket disconnect.

---

## 8. Chatbot Brain — `chatbot/`

Text-based finance Q&A chatbot powering `html/chat.html`.

| File | Role |
|---|---|
| `brain.py` | QFT Engine Python server on port 8000 |
| `qft-engine.js` | Frontend chat interface JS |
| `qft-hud.css` | HUD-style chat styling |

```bash
python chatbot/brain.py
```

---

## 9. Market Intelligence — `market intelligence/`

Flask API providing AI-generated trade signals across four time horizons.

| File | Strategy | Indicators |
|---|---|---|
| `intraday.py` | Scalping + day trading | VWAP, RSI, Bollinger Bands, Volume |
| `swing.py` | 3–10 day setups | EMA crossovers, MACD, volume surge |
| `fundamental.py` | Value/growth screening | P/E, P/B, ROE, D/E ratio |
| `long.py` | Long-term analysis | CAGR trends, moat indicators, sector momentum |
| `bridge.py` | Data normalisation | Unifies format across all modules |

**Dependencies:** flask, flask-cors, yfinance, pandas, numpy, ta, gunicorn

```bash
cd "market intelligence"
pip install -r requirements.txt
python app.py
```

---

## 10. Stock Engine — `stock-engine/`

FastAPI-based stock data and indicators engine with caching.

```
stock-engine/
├── backend/
│   └── app/
│       ├── main.py          # FastAPI app
│       ├── cache.py         # In-memory cache layer
│       └── services/
│           ├── market_data.py    # yfinance data fetcher
│           └── indicators.py     # Technical indicator calculations
└── frontend/
```

---

## 11. Stock Dashboard — `stock-dashboard/`

Standalone mini stock research dashboard — runs independently.

| File | Role |
|---|---|
| `app.py` | Flask backend (yfinance data) |
| `index.html` | Dashboard UI |
| `app.js` | Frontend logic |
| `styles.css` | Styles |

**Dependencies:** flask==3.0.3, flask-cors==4.0.1, yfinance==0.2.40, requests==2.32.3

```bash
cd stock-dashboard
pip install -r requirements.txt
python app.py
```

---

## 12. Expense Tracker — `ExpenseTracker/`

A React-based budget app with a Django REST backend.

### `finos-budget/` — React + Vite Frontend

Built with React, Vite, and Tailwind CSS. 11 full-page modules:

| Page | What It Does |
|---|---|
| `WealthInterface.jsx` | Main wealth overview dashboard |
| `BudgetIntelligenceDashboard.jsx` | AI-powered budget analysis |
| `AIWarRoom.jsx` | AI financial war room — scenario analysis |
| `DebtDestroyer.jsx` | Debt payoff strategy planner (snowball / avalanche) |
| `FIRECalculator.jsx` | Financial Independence / Retire Early calculator |
| `Goals.jsx` | Goal tracking and progress |
| `FlowMap.jsx` | Visual cashflow map |
| `ReportsPage.jsx` | Monthly and annual reports |
| `AchievementsPage.jsx` | Gamified financial milestones |
| `SubscriptionManager.jsx` | Track and manage subscriptions |
| `SettingsPage.jsx` | App preferences |

**Components:** Sidebar, ParticleField, ConfettiEffect, CurrencyDisplay, NotificationBadge, PageTransition  
**Hooks:** `usePersistedState.js` — persists state across sessions

```bash
cd ExpenseTracker/finos-budget
npm install
npm run dev
# or serve the built dist/
```

### `finos_backend/` — Django REST API

Django REST framework backend for the budget app.

| Module | Role |
|---|---|
| `api/models.py` | Data models — transactions, budgets, goals |
| `api/views.py` | REST API views |
| `api/urls.py` | URL routing |
| `api/admin.py` | Django admin config |
| `api/migrations/` | Database migrations |

```bash
cd ExpenseTracker/finos_backend
python manage.py migrate
python manage.py runserver
```

---

## 13. Trade Journal — `TradeJournal/`

A standalone trade journaling app with Supabase sync and full analytics.

| File | Role |
|---|---|
| `index.html` | Main journal UI |
| `landing.html` | Marketing landing page |
| `app.js` | Core logic |
| `sync.js` | Supabase Realtime sync |
| `insights.js` | Analytics — P&L, win rate, expectancy, R-multiple |
| `stats.js` | Statistical analysis |
| `hub_upgrades.js` | Portfolio hub view |
| `features-v2.js` | v2 feature additions |
| `supabase_setup.sql` | Supabase schema for trade entries |

---

## 14. News Aggregator — `News1/`

TypeScript + Vite + Express news aggregation server with a modern React-style UI.

```
News1/
├── server.ts        # Express + Vite dev server
├── src/
│   ├── App.tsx
│   ├── components/
│   └── hooks/
└── index.html
```

```bash
cd News1
npm install
npm run dev    # Express + Vite on :3000
```

---

## 15. Portfolio Analyser — `Porfolio Analyser/`

Standalone portfolio analysis tool with a Python backend.

```bash
cd "Porfolio Analyser"
python server.py
# open portfolio-analyser-v10.html in browser
```

---

## 16. Django Legacy Scaffold — `finos 2/`

A Django project scaffold from an earlier phase of development. Kept as reference.

```
finos 2/
├── core/           # Django project (settings, urls, wsgi)
├── finos/          # Main app (models, views, urls, admin)
├── scratch/        # Migration scripts
└── db.sqlite3      # SQLite dev database
```

---

## 17. Database — Supabase

**Project URL:** `https://oeapcyucnduhwpgxfknb.supabase.co`

### All Tables

| Table | Source | Key Columns |
|---|---|---|
| `profiles` | Core app | id, full_name, income_range, life_stage, city, financial_dna, interests, has_* flags |
| `transactions` | Core app | user_id, amount, type, category, date |
| `goals` | Core app | user_id, name, target_amount, current_amount, target_date |
| `holdings` | Core app | user_id, symbol, asset_type, quantity, avg_price, current_price |
| `budgets` | Core app | user_id, month, year, category limits |
| `alerts` | `alerts/schema.sql` | user_id, rule_id, title, message, priority, read, action_url |
| `push_subscriptions` | `alerts/schema.sql` | user_id, endpoint (UNIQUE), p256dh, auth_key |
| `alert_preferences` | `alerts/schema.sql` | (user_id, rule_id) PK, enabled, channels |
| `agent_memories` | `voiceagent/schema.sql` | user_id (PK), profile jsonb, summary, mem_items jsonb, session counts |

### Run Migrations

Paste each file into [Supabase SQL Editor](https://supabase.com/dashboard/project/oeapcyucnduhwpgxfknb/sql/new) and click Run:

```
1. alerts/schema.sql         → creates alerts, push_subscriptions, alert_preferences
2. voiceagent/schema.sql     → creates agent_memories
```

### Enable Realtime

Supabase Dashboard → Database → Replication → toggle ON:
- ✅ `alerts`
- ✅ `alert_preferences`

---

## 18. PWA & Service Worker — `sw.js` + `manifest.json`

### Manifest

```json
{
  "name": "FIN•OS — Financial Operating System",
  "short_name": "FIN•OS",
  "display": "standalone",
  "start_url": "./html/home.html",
  "shortcuts": [
    { "name": "Home", "url": "./html/home.html" },
    { "name": "Track Finances", "url": "./html/track-finances.html" },
    { "name": "Calculators", "url": "./html/calculators.html" }
  ]
}
```

### Service Worker Strategies

| Request Type | Strategy |
|---|---|
| `.html` pages | Network-first → cache fallback → offline page |
| `.css` / `.js` / `.svg` / images / `.json` | Cache-first → network → 204 empty |
| Non-GET / cross-origin | Pass-through |

**Pre-cached:** home.html, dashboard.html, calculators.html, track-finances.html, foundations.html, all core CSS + JS, manifest, icons

**Push notifications:** Handles `push`, `notificationclick`, and `pushsubscriptionchange` events for the alert engine's Web Push delivery.

---

## 19. Authentication & Security

| Layer | Mechanism |
|---|---|
| Route guard | `js/guard.js` — Firebase `onAuthStateChanged` protects every page |
| Primary auth | Supabase email/password |
| DB access control | Supabase RLS — users read/write only their own rows |
| Voice agent session | `user_id` bound on first WS message — mismatches rejected |
| Context storage | `sessionStorage` only — tab-scoped, never synced externally |
| RAM clearing | Full context cleared on WS disconnect |
| Service keys | Backend `.env` files only — never in browser code |
| AI privacy | Voice transcriptions + LLM conversations never leave localhost |

---

## 20. Environment Setup

### Prerequisites

```bash
python3 --version        # 3.11+
node --version           # 18+
ollama --version         # install from https://ollama.com
ffmpeg -version          # brew install ffmpeg (macOS) / apt install ffmpeg (Linux)
```

### Voice Agent `.env`

```bash
cp voiceagent/.env.example voiceagent/.env
```
```
SUPABASE_URL=https://oeapcyucnduhwpgxfknb.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...    # Supabase → Settings → API → service_role
```

### Alert Engine `.env`

```bash
cp alerts/.env.example alerts/.env
```
```
SUPABASE_URL=https://oeapcyucnduhwpgxfknb.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...    # service_role key
SUPABASE_ANON_KEY=eyJhbG...       # anon/public key
VAPID_PRIVATE_KEY=...             # generate below
VAPID_PUBLIC_KEY=...              # generate below
```

**Generate VAPID keys once:**
```bash
pip install py-vapid
python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print('PRIVATE:', v.private_key, '\nPUBLIC:', v.public_key)"
```

---

## 21. Running Everything

### Minimum — Static frontend only

```bash
python -m http.server 3000
# Open http://localhost:3000
```

### Full Stack

```bash
# Terminal 1 — Ollama
ollama serve

# Terminal 2 — Voice Agent
cd voiceagent && python agent.py

# Terminal 3 — Voice Agent UI
cd voiceagent && python -m http.server 8080

# Terminal 4 — Alert Engine + Health Score
cd alerts && python alert-engine.py

# Terminal 5 — News API
python app.py

# Terminal 6 — Chatbot Brain (optional)
python chatbot/brain.py

# Terminal 7 — Market Intelligence (optional)
cd "market intelligence" && python app.py

# Terminal 8 — Main Frontend
python -m http.server 3000
```

### Expected Startup Output

```
voiceagent/agent.py:
  INFO  fin-os.memory: Persistent memory: ENABLED  (Supabase ...)
  INFO  fin-os: Whisper tiny ready
  INFO  fin-os: Ollama warmed up (qwen2.5:3b)
  INFO  fin-os: TTS warmed up
  INFO  fin-os: Ready — http://localhost:8080
  INFO  websockets.server: server listening on 0.0.0.0:8765

alerts/alert-engine.py:
  INFO  finos-alerts: FIN-OS Alert Engine started — 10 rules loaded
  INFO  finos-alerts: Endpoints: http://0.0.0.0:8001
  INFO  uvicorn: Uvicorn running on http://0.0.0.0:8001
```

### Health Checks

```
http://localhost:8001/health              → alert engine + rule count
http://localhost:8001/market              → Nifty 50 live
http://localhost:8001/health-score/{uid}  → user health score
http://localhost:5000/api/intel           → news feed
```

---

## Quick Reference

```
┌──────────────────────────────────────────────────────────────────────┐
│  ZERO-CONFIG — Add this to any page for full AI intelligence layer   │
│                                                                      │
│  <script src="./js/finos-widget.js"></script>                        │
│                                                                      │
│  → Voice AI FAB (bottom-right)                                       │
│  → Alert bell with real-time notifications + push                    │
│  → Financial Health Score button (live 0–100)                        │
│  → Full user context pipeline to the AI                              │
│  → Persistent cross-session memory                                   │
└──────────────────────────────────────────────────────────────────────┘

PORTS
  3000  Frontend static
  5000  News Intel API (Flask)
  8000  Chatbot Brain
  8001  Alert Engine + Health Score (FastAPI)
  8080  Voice Agent UI
  8765  Voice Agent WebSocket
  11434 Ollama

SQL MIGRATIONS (run once in Supabase SQL Editor)
  alerts/schema.sql         alerts · push_subscriptions · alert_preferences
  voiceagent/schema.sql     agent_memories

ENV FILES
  alerts/.env               SUPABASE_SERVICE_KEY + VAPID keys
  voiceagent/.env           SUPABASE_SERVICE_KEY

SUPABASE REALTIME (Dashboard → Database → Replication)
  ✅  alerts
  ✅  alert_preferences
```

---

*Built for India. Runs entirely on your machine.*  
*All AI is local — no paid API, no cloud inference, complete privacy.*
