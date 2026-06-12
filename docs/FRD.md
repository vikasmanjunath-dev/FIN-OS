# FIN-OS — Functional Requirements Document (FRD)

**Owner:** Vikas Manjunath | **Version:** 1.4 | **Date:** June 8, 2026 | **Status:** Active

---

## 1. Purpose

Defines functional requirements for every FIN-OS module — what each feature does, inputs, outputs, and acceptance criteria.

---

## 2. FR-01 — Authentication

### FR-01.1 Login
- Input: email + password → Supabase `signInWithPassword()`
- Success: redirect to `html/home.html`
- Failure: inline error, no redirect
- Session persistence: Supabase JWT in localStorage; auto-restored on reload

### FR-01.2 Signup
- Input: email + password + confirm password (≥8 chars, must match)
- Action: `signUp()` → confirmation email
- Post-confirm: redirect to `html/onboarding.html`

### FR-01.3 Route Guard (`js/guard.js`)
- Runs on every protected page load
- Invalid/expired session → redirect to `login.html`
- Public pages exempt: `index.html`, `login.html`

### FR-01.4 Logout
- `signOut()` → clear sessionStorage → redirect to `login.html`

**Acceptance criteria:**
- [ ] Unauthenticated user on `html/home.html` → redirected to `login.html`
- [ ] Wrong password → error shown, no redirect
- [ ] Session persists across browser refresh
- [ ] Logout clears all sessionStorage user data

---

## 3. FR-02 — Onboarding (`html/onboarding.html`)

6-step wizard collecting:

| Step | Fields |
|---|---|
| 1. Life Stage | student / early_career / growth / peak / pre_retirement / retirement |
| 2. Income | range selector (below 3L to 50L+) |
| 3. Goals | multi-select: emergency fund, house, FIRE, education, business, travel |
| 4. Situation | has SIP / home loan / car loan / PPF / term insurance / health insurance |
| 5. Risk Profile | conservative / moderate / aggressive |
| 6. Financial DNA | 5-question behaviour quiz → DNA type |

On completion: writes `profiles` row → redirect to `html/home.html`. Skipped if row exists.

DNA types: `wealth_builder` · `cautious_saver` · `growth_seeker` · `security_seeker` · `balanced_planner`

---

## 4. FR-03 — Dashboard (`html/dashboard.html`)

### FR-03.1 KPI Snapshot Row
- Displays: net worth · savings rate · FIRE progress · streak
- Data from `profiles` + `transactions` (Supabase)
- Skeleton loader during fetch

### FR-03.2 Arya + Nudges Layout
- Left: Arya AI brief (voice summary or text)
- Right: priority action nudges from alert engine
- Responsive: stacks on mobile

### FR-03.3 Portfolio Quick-Access
- "Portfolio" button → `track-finances.html#portfolio-xray` (not a standalone holding page)

### FR-03.4 Health Score Badge
- Live 0–100 in header
- Calculated by `alerts/health_score.py`; updated every 15 minutes

---

## 5. FR-04 — Calculators (88 tools across 9 categories)

### Individual Calculator Requirements

Each tool must:
- Load in <1s
- Work offline (no external API calls)
- Show visual output (chart / table / comparison) — not just numbers
- Use Indian benchmarks as defaults
- Be mobile-responsive
- Show results on same page (no redirect)
- Use CSS tokens from `design-tokens.css` — no hardcoded colours
- Support both light and dark themes
- Include back-link to `html/calculators.html`

### Calculator Categories

| Category | Count | Key tools |
|---|---|---|
| Banking & Fixed Income | 10 | FD, RD, PPF, EPF, NPS, SSY |
| Core Thinking | 10 | Compounding, Inflation, Real Return |
| Desi Reality Check | 10 | Buy House, Shaadi Cost, Middle Class Trap |
| Financial Health | 6 | Emergency Fund, Net Worth, Savings Rate |
| Investment & Wealth | 16 | SIP, SIP Optimizer, XIRR, CAGR, Goal Based |
| Loans, Debt & EMI | 11 | Home, Car, EMI, Debt Snowball |
| Retirement & Life | 7 | Retirement Corpus, Pension Gap, Longevity |
| Tax & Salary | 10 | Old vs New Regime, In-Hand, Capital Gains |
| Trading & Markets | 8 | Brokerage, Options, Position Size, F&O P&L |

---

## 6. FR-05 — Voice Agent

### FR-05.1 Widget (`js/finos-widget.js`)
- Included on every page
- Floating mic button for logged-in users
- Opens voice agent iframe on click
- Passes `sessionStorage.FINOS_CTX` (user context) to agent

### FR-05.2 AI Processing (`voiceagent/agent.py`)
- WebSocket at `ws://localhost:8765`
- Input: audio chunks OR text transcript
- Pipeline: faster-whisper → qwen3:14b → edge-tts
- Output: streamed audio chunks + transcript
- Memory: reads/writes `agent_memories` Supabase table

### FR-05.3 Language Support
- Auto-detects English / Hindi / Hinglish
- Responds in detected language
- Indian benchmarks always injected

### FR-05.4 Persona Rules
- Never starts with filler phrases ("Sure!", "Great question!")
- 2–3 sentences default; full detail only when asked
- Zero markdown in spoken output
- Uses user's name from profile when known

---

## 7. FR-06 — Alert Engine (10 rules)

| Rule | Trigger | Priority |
|---|---|---|
| SIP missed | Expected SIP date passed, no matching transaction | warning |
| Salary credited | Large income transaction detected | info |
| Emergency fund low | <3 months expenses in liquid savings | critical |
| Net worth milestone | Crosses ₹5L / ₹10L / ₹25L / ₹50L / ₹1Cr | info |
| Credit card due | Bill due in ≤5 days | warning |
| F&O overtrading | >3 options/futures trades in 7 days | warning |
| LIC premium | LIC-type premium payment detected | warning |
| High expense ratio | Fund expense ratio >1% | info |
| Tax deadline | Advance tax / ITR due dates | warning |
| Portfolio drift | Allocation deviates >10% from target | info |

Scheduler: every 15 minutes via APScheduler.  
Push notifications: VAPID via pywebpush + `push_subscriptions` Supabase table.

---

## 8. FR-07 — Financial Health Score (6 pillars, 0–100)

| Pillar | Factors |
|---|---|
| Emergency Fund | Months of expenses in liquid savings |
| Debt Load | EMI-to-income ratio |
| Investment Rate | SIP as % of income |
| Insurance Cover | Term + health coverage adequacy |
| Net Worth Growth | Month-on-month delta |
| Expense Discipline | Discretionary spend % of income |

Score = average of 6 pillar scores. Updated every 15 minutes.

---

## 9. FR-08 — UI System

### FR-08.1 Hover System (`css/interactions.css` + `js/interactions.js`)

Zero-fill hover vocabulary — no background fills on hover:

| Pattern | Required effect |
|---|---|
| `.card`, `.feat-card`, `.tool-card` | `translateY(-4px)` + border-glow + depth shadow |
| `.sb-link` (sidebar nav) | Text brightens + icon to accent; no fill |
| `.btn-secondary`, `.btn-outline` | Border glow + ring; no fill |
| `[class*="-tab"]`, `.tf-mod-tab` | Border accent + underline; no fill |
| `.toc-link` | 2px left accent bar slides in |
| `.matrix-row`, `.tf-step-check` | Left accent bar + text shift |

`js/interactions.js` patches inline `onmouseover` background handlers at `DOMContentLoaded`.

### FR-08.2 Theme System

| Requirement | Specification |
|---|---|
| Anti-FOUC | Inline IIFE **first child of `<head>`** before any `<link>` |
| Toggle | Every page has `#themeToggle` or fixed-position button |
| Persistence | Written to `finos-theme`, `theme`, `FINOS_SYS_SETTINGS.theme` |
| CSS tokens | All colour values via `var(--token)` — no hardcoded hex |
| Light coverage | 360 rules in `theme.css` |
| New page checklist | See FR-08.3 |

### FR-08.3 New Page Requirements

- [ ] Anti-FOUC IIFE first in `<head>`
- [ ] `design-tokens.css` before page CSS
- [ ] `interactions.css` and `theme.css` linked
- [ ] Theme toggle present
- [ ] `ui.js` and `interactions.js` included
- [ ] No hardcoded dark colours in inline `<style>` blocks

---

## 10. FR-09 — Education Modules (14 modules)

Each module must:
- Have a dedicated page `html/learn-[topic].html`
- Include scrolling card deck (key concepts)
- Include at least one interactive simulation
- Link to related calculators
- Work fully offline
- Support both themes

| Page | Topic |
|---|---|
| `learn-equity.html` | Stocks, indices, market mechanics |
| `learn-mf.html` | Mutual funds, SIP, categories |
| `learn-fno.html` | F&O — with risk warnings |
| `learn-insurance.html` | Term vs ULIP vs endowment |
| `learn-debt.html` | Bonds, FDs, fixed income |
| `learn-etf.html` | ETFs vs mutual funds |
| `learn-commodity.html` | Gold, silver, oil |
| `learn-crypto.html` | Crypto — with risk warnings |
| `learn-forex.html` | Currency markets |
| `learn-analysis.html` | Fundamental analysis |
| `learn-technical.html` | Technical analysis |
| `learn-indicators.html` | Key market indicators |
| `learn-fundamental.html` | Balance sheet, P&L, ratios |
| `learn-metrics.html` | Valuation metrics |

---

## 11. FR-10 — Portfolio Analyser (Portfolio.AI)

**File:** `Porfolio Analyser/portfolio-analyser-v10.html` (**21,691 lines**, single-file app)
**Version:** v10 | **Updated:** June 8, 2026

### FR-10.0 Core Infrastructure
- File input: Zerodha EQ holdings CSV + MF holdings CSV (separate upload zones)
- On upload: parse → `EQ[]` and `MF[]` global arrays → inject into `sessionStorage.FINOS_CTX` for voice agent
- Voice-queryable: "which stocks should I sell?" → AI analyses with full context
- XIRR calculation per holding
- Accessible via: Dashboard quick-access → `track-finances.html#portfolio-xray`
- XSS prevention: `_esc(s)` helper sanitises all user data inserted into innerHTML
- `visibilitychange` handler: pauses wake word SR and alert check interval when tab hidden

### FR-10.1 Overview Page
- Portfolio treemap: squarified layout split into two independent SVG blocks
  - `tm-eq-svg`: Stocks + ETFs, clickable cells → Research tab
  - `tm-mf-svg`: Mutual Funds, hover-only
- Treemap cells show: symbol (adaptive font), P&L % (on every visible cell, proportionally centred), weight % (large cells only)
- Sankey diagram: fund flow from sectors to holdings (XSS-safe)
- Bubble chart: sector clustering by return vs weight

### FR-10.2 Rebalance Planner

| Mode | Behaviour |
|---|---|
| ⚖ Rebalance | Sells overweight + buys underweight. Tax-aware, drift-band configurable |
| 💰 Deploy Cash | Buy-only using new capital. No sells → no capital gains tax |
| 📅 SIP Allocator | Distributes monthly SIP amount across underweight holdings proportionally to deficit |

**SIP Auto-Allocation Engine (FR-10.2.3)**
- Input: `RB_SIP_AMT` (monthly SIP ₹)
- Algorithm: for each holding, `gap = max(0, targetPct - currentPct)`; SIP allocated `∝ gap × (totInv + SIP)`
- Output: BUY/HOLD per holding, ₹ allocation, resulting new weight%, insight summary
- Constraint: zero selling, zero capital gains tax triggered

**Common controls:** strategy templates (Equal Weight, Core-Satellite, 60/40, etc.), drift band ±3/5/10/15%, min trade ₹500–₹10K, turnover cap ≤20/50/100%, sort by priority/drift/action/return/tax

### FR-10.3 Quant Intelligence — Alpha Metrics Tab
- Information Ratio, Jensen's Alpha, Treynor Ratio, Active Share, Tracking Error, Beta (realized), Sharpe, Sortino
- Factor Return Decomposition (Fama-French 5-factor, see FR-10.8)
- Rolling 90-day Jensen's Alpha chart
- Per-holding alpha contribution bar chart

### FR-10.4 Quant Intelligence — Monte Carlo Tab

**Portfolio Monte Carlo**
- 1,000–10,000 paths; 1Y/2Y/3Y/5Y horizon; Bull/Bear/Crash scenario overlays
- Fan chart with P5/P25/P50/P75/P95 percentile paths
- Weekly return stats from `QUANT_DATA` (live fetched price history)

**Per-Holding Monte Carlo (FR-10.4.2)**
- Per-holding μ: `pnlPct / 252` (annualised P&L as return proxy)
- Per-holding σ: `(SECTOR_BETA[sec] × 0.18 + |pnlPct| × 0.2) / √252`
- 1,000 paths × configurable horizon; P5/P25/P50/P75/P95 table per holding
- Click any row → probability cone chart using analytical lognormal percentile paths

### FR-10.5 Quant Intelligence — Backtesting Tab

**Strategy Backtester:** Momentum / Equal Weight / Quality / Low-Vol / Value Factor strategies on actual holdings.

**Rebalance Frequency Comparison (FR-10.5.2)**
- Strategies: Quarterly, Annual, Buy-and-Hold
- Per-holding vol: `SECTOR_BETA[sec] × 0.18`; txn cost: 0.12% per rebalance event
- Configurable: 3/5/10-year simulation, starting capital (current portfolio or fixed ₹)
- Output: final value, CAGR, Sharpe ratio, max drawdown, total txn cost per strategy
- Line chart overlays all 3 equity curves; verdict + India tax note

### FR-10.6 Quant Intelligence — Options Overlay Tab (🛡️ Hedge)

**Nifty Put Insurance**
- Black-Scholes put: `P = K·e^(-rT)·N(-d2) - N(-d1)` (S=1, India RFR=7%)
- `_normCDF` via `erf(|x|/√2)` (Abramowitz & Stegun 7.1.26) — correct for all moneyness
- Inputs: portfolio value ₹, strike (ATM/5%/10% OTM), expiry (1M/3M/6M), India VIX
- Outputs: put premium ₹, annual hedge cost %, break-even portfolio fall %, net floor ₹

**Covered Call Builder**
- BS call pricing for top 8 equity holdings
- Implied vol per holding: `min(0.6, max(0.12, VIX/100 × beta + |pnlPct| × 0.3))`
- ATM / 5% OTM / 10% OTM monthly premiums; total monthly call income summary

**IV vs HV Comparison**
- IV proxy = `VIX × beta` (annualised %)
- HV proxy = `beta × 15 + |pnlPct| × 0.4` (realised vol estimate)
- Signal per holding: sell calls (IV > HV + 5%) / buy puts (IV < HV − 5%) / fair

### FR-10.7 Quant Intelligence — Factor & Risk Tab
- Portfolio Factor Exposure radar (Value · Momentum · Quality · Low-Vol · Size)
- Advanced Risk Decomposition: systematic + idiosyncratic + sector concentration
- Rolling performance vs Nifty 50
- Full correlation heatmap (Pearson, click-to-scatter)
- Expected Shortfall / CVaR (95%)
- Drawdown statistics
- Momentum decay analysis
- Brinson-Fachler attribution
- Efficient Frontier

### FR-10.8 Quant Intelligence — Fama-French 5-Factor Tab (🧬 FF5 Factors)

**Regression model:** `R = α + β_mkt×Mkt-RF + β_smb×SMB + β_hml×HML + β_rmw×RMW + β_cma×CMA + ε`

| Factor | Proxy source | Historical India premium |
|---|---|---|
| Mkt-RF | Weighted `SECTOR_BETA` | 15% |
| SMB (Size) | Cap-adjusted sector loading | 4% |
| HML (Value) | P/B tilt from sector loading | 5% |
| RMW (Profitability) | ROE proxy from sector loading | 4% |
| CMA (Investment) | Capex discipline from sector loading | 3% |

- `FF5_SECTOR_LOADS`: 30 sectors × 5 factor loadings (academic literature values)
- Portfolio betas = weighted average across all holdings
- Attribution sentence with ranked factor contributions and alpha
- Stacked attribution bar chart
- Rolling 12-month factor betas: line chart (5 quarterly snapshots)
- Per-holding attribution table: top 8 holdings × 5 factors
- R² indicates systematic factor coverage vs idiosyncratic alpha

### FR-10.9 Acceptance Criteria

- [ ] SIP allocations sum to exactly the entered monthly SIP amount (rounding correction applied)
- [ ] Rebalance frequency chart shows 3 distinct curves with correct labels
- [ ] Per-holding MC: clicking a row updates the cone chart to that holding
- [ ] Options: ATM put premium ≈ 1–3% of portfolio at VIX=15 for 3M expiry
- [ ] FF5: factor card betas visible within 100ms of tab click
- [ ] All user-data fields passed through `_esc()` before innerHTML insertion
- [ ] Treemap cells display P&L % on all cells where `pw>10 && ph>7`
- [ ] SIP mode `rbEl.innerHTML = html; return` exits without executing normal rebalance view

---

### FR-10.10 Research Page — Live News Feed + AI Sentiment (Feature 20)

- **Tab:** 📰 News & Insights (4th tab in Research page tab bar)
- Button-triggered (not auto-fetch): `riLoadNews()` called on "Fetch Latest News" click
- `claudeFetch()` with web search — fetches 6–8 recent headlines for the selected stock symbol
- Per-headline AI sentiment badge: Bullish (green `#34d399`) / Neutral (amber `#ffb932`) / Bearish (red `#f43f5e`)
- Summary bar above headlines shows tally: "X Bullish · Y Neutral · Z Bearish"
- XSS safe: all headline text passed through `_esc()` before innerHTML

**Acceptance criteria:**
- [ ] Fetch button shows spinner while API call in progress
- [ ] Each headline has one sentiment badge (not multiple)
- [ ] Summary bar updates to reflect all fetched headlines
- [ ] Switching stock symbols clears news feed (requires re-fetch)

---

### FR-10.11 Research Page — Peer Comparison Table (Feature 21)

- **Location:** 📰 News & Insights tab, below news feed
- `PEER_GROUPS` constant: 17 sectors × 85+ stocks with P/E, P/B, ROE%, Revenue Growth% (values in **%** not decimals)
- `PEER_LOOKUP` reverse map built at load time: `sym → {sector, peers[]}`
- `riRenderPeerTable(sym)` — ranks current stock within its sector on P/E, P/B, ROE, RevGr; composite rank = mean of per-metric ranks
- Current stock row highlighted in gold with 2px amber left border
- Sector chip shown in chart header (e.g. "Private Banking")
- Falls back gracefully if symbol not in PEER_LOOKUP

**Data note:** `PEER_GROUPS` stores metric values as % (e.g. `roe:16.9` = 16.9%). `FUND_DB` stores as decimal (e.g. `roe:0.168` = 16.8%). Do NOT mix.

**Acceptance criteria:**
- [ ] Rank badges shown for P/E, P/B, ROE, RevGr per row
- [ ] Current stock highlighted and sorted to visible position
- [ ] "Not enough peer data" fallback shown gracefully for unlisted stocks

---

### FR-10.12 Research Page — Promoter Holding Trend (Feature 22)

- **Location:** 📰 News & Insights tab, below Peer Table
- `PROMOTER_DB` constant: 52 major NSE stocks × 8 quarters (Q1FY24–Q4FY25) of promoter holding %
- `riRenderPromoterTrend(sym)` — Chart.js line chart; line colour = green (uptrend) / red (downtrend) / amber (stable)
- Alert logic: `declineStreak >= 3` consecutive falling quarters → 🚩 red warning box
- Pledge-aware: `pledge > 0` → amber "pledged shares" warning even if trend is stable
- Special handling: `noPromoter:true` (ITC, LT, ICICIBANK) → informational blue message instead of chart
- Fallback: "Fetch via AI" button for stocks not in curated DB — calls `riLoadPromoterFromAI()`

**Acceptance criteria:**
- [ ] Chart renders for all 52 stocks in PROMOTER_DB
- [ ] 3+ quarter decline shows red warning box, not just red line
- [ ] noPromoter stocks show informational message (not blank / error)
- [ ] Pledge warning shown independently of trend direction

---

### FR-10.13 Watchlist & Screener Page (Feature 25)

**Navigation:** ⭐ Watchlist & Screener — 11th item in sidebar nav; `go('watchlist')` / `id="page-watchlist"`

#### Screener

- Universe: `SCREENER_UNIVERSE` built lazily from `FUND_DB` (~80 stocks); converts `roe × 100`, `divYield × 100`, `revGr × 100` from decimal to %
- Sector resolution: `PEER_LOOKUP[sym]?.sector` first, then `_SUPP_SECTOR` map (100+ stocks)
- **6 preset screens:**

| Preset | Criteria |
|---|---|
| 🟢 Deep Value | P/E ≤ 15 AND P/B ≤ 2 |
| 💪 Quality Compounder | ROE ≥ 20% AND D/E ≤ 0.5 AND RevGr ≥ 10% |
| 🏦 Debt-Free Stars | D/E = 0 AND ROE ≥ 15% |
| 📉 52W Near Low | Price in bottom 15% of 52W range (requires QUANT_DATA or EQ price data) |
| 💰 High Dividend | Div Yield ≥ 3% |
| 🚀 Growth Runway | RevGr ≥ 15% AND ROE ≥ 15% |

- Custom mode: 6 filter inputs (P/E max, P/B max, ROE min, D/E max, Div Yield min, RevGr min)
- Results table: colour-coded metrics (green = good, amber = ok, red = poor); sortable by any column
- 52W bar: visual mini-bar showing position in 52W range (pulls from QUANT_DATA → EQ array)
- Portfolio stocks flagged "IN PORTFOLIO"; watchlist stocks show "✓ WL" button state
- "Add All to Watchlist" button — adds all screener results (excluding held stocks) at once
- Helpful note shown if 52W Near Low used but no price data loaded

#### Watchlist

- Storage: `localStorage` key `pa_watchlist`; format: `[{sym, note, addedAt}]`
- Add methods: screener "＋ WL" button, "Add All" button, typed symbol (validated against FUND_DB)
- Per-item display: P/E · ROE · D/E · Div Yield metrics; auto-saving note textarea; `🔬 Research` (→ Research page, sym pre-set); `✕` remove
- Empty state: friendly placeholder message
- Validation error shown if symbol not in curated FUND_DB

**Acceptance criteria:**
- [ ] All 6 preset screens return correct results from FUND_DB
- [ ] `_esc()` used on all sym/name/sector values before innerHTML
- [ ] Watchlist persists across page reload and browser restart
- [ ] Research button navigates to Research page with correct symbol selected
- [ ] 52W Near Low screen shows helpful note when QUANT_DATA unavailable

---

### FR-10.14 Command Palette ⌘K (Feature 27)

- **Trigger:** `Cmd+K` (Mac) / `Ctrl+K` (Windows/Linux) anywhere in the app; floating `⌘K Search…` pill chip (bottom-right)
- Toggle: second `Cmd+K` closes palette; `ESC` closes palette and Share modal
- **Search index:**
  - **11 Pages:** Upload · Overview · Equity · Sectors · Insights · Tax · Rebalance · Analytics · Quant · Research · Watchlist
  - **11 Actions:** Print · Toggle Theme · Set Dark/Light/Bloomberg/Saffron · Share Link · Refresh Prices · Scheduled Reports · Clear Portfolio · Export CSV
  - **80+ Stocks:** Filtered from FUND_DB on query ≥ 2 chars; also searches current EQ holdings; shows P/E, ROE, sector
- Results grouped by category: Pages | Stocks | Actions
- Keyboard navigation: `↑↓` moves active item; `↵` executes; active item highlighted in accent colour
- Stock execute: navigates to Research page with stock symbol pre-selected in `ri-sym-sel`
- Page execute: calls `go(id)` directly

**Acceptance criteria:**
- [ ] `Cmd+K` opens palette on all pages
- [ ] Typing "HDFC" shows HDFCBANK, HDFCAMC, HDFCLIFE in Stocks section
- [ ] `↑↓` + `↵` navigates and executes the highlighted item
- [ ] `ESC` closes without executing
- [ ] Stock selection opens Research page with correct symbol pre-loaded

---

### FR-10.15 Drag-and-Drop Overview Layout (Feature 28)

- **Draggable sections** (5): 🗺️ Treemap · 🌊 Fund Flow Sankey · 📊 Charts · 🔔 AI Alerts · 🤖 AI Insights
- **Fixed (non-draggable):** Hero KPIs, Stats, Score, Cap/Risk/Perf/Comp boxes
- Drag handle: `⠿` grip icon + section label, appears on hover; hidden at rest
- Drop target: accent-coloured border (top or bottom) shows insert position
- Uses HTML5 native drag API — no external library
- Order persisted to `pa_ov_layout` (localStorage) as array of section IDs
- `↺ Reset Layout` button restores default order
- `window.dispatchEvent('resize')` fired on drop to trigger Chart.js canvas repaint
- Initialisation: `initOverviewDrag()` called 500ms after `go('overview')` to allow sections to render

**Acceptance criteria:**
- [ ] Sections can be dragged to any order
- [ ] Order persists across page reload
- [ ] Charts inside dragged sections render correctly after reposition
- [ ] Reset Layout restores original order

---

### FR-10.16 Shareable Portfolio Link (Feature 29)

- **Access:** `🔗 Share Analysis` button in sidebar → modal
- **Encoding:** `JSON.stringify(payload)` → `encodeURIComponent` → `btoa` → appended as `?share=<base64>`
- **Anonymize option** (default ON): strips `qty` and `avgP` from each holding; preserves symbol, sector, P&L%, weight
- **Copy:** `📋 Copy` button — uses `navigator.clipboard.writeText()` with `document.execCommand('copy')` fallback
- **Load detection:** `_detectShareParam` IIFE runs at script-end; on `?share=` param detected:
  - Decodes and restores EQ/MF from payload
  - Shows sticky purple `👁 Shared read-only` banner (dismissible)
  - Auto-navigates to Overview page
- **No server:** entirely client-side encoding/decoding; no data sent to any backend
- URL length warning shown if >8,000 chars

**Acceptance criteria:**
- [ ] Generated link opens in new tab and shows shared portfolio
- [ ] Anonymize=ON: qty and avgP not visible in URL-decoded payload
- [ ] Read-only banner visible immediately on shared URL load
- [ ] Copy button shows "✓ Copied!" confirmation for 2 seconds

---

### FR-10.17 4-Theme System (Feature 30)

| Theme | `data-theme` attr | Primary palette |
|---|---|---|
| Dark (default) | *(none)* | Indigo/violet on near-black |
| Light | `light` | Navy on white/gray |
| Bloomberg Terminal | `bloomberg` | `#00ff41` green on `#000000` black |
| Saffron | `saffron` | `#ff8c00` saffron + `#f5e6c8` cream on `#160800` dark amber |

- `setTheme(t)` = single source of truth: sets `data-theme`, writes `portfolioai_theme` to localStorage, updates button text + swatch `.active`, re-renders TradingView chart
- `toggleTheme()` cycles: Dark → Light → Bloomberg → Saffron → Dark
- 4-swatch picker row in sidebar for direct one-click access (alongside cycle button)
- Anti-FOUC IIFE patched: applies Bloomberg/Saffron themes at script-parse time (before first paint)
- Bloomberg overrides: sidebar, nav buttons, cards, tables (including `th`/`td`), inputs, scrollbars, export buttons
- Saffron overrides: same component set in warm amber tones
- Persisted to `portfolioai_theme` (same key as dark/light, now accepts 4 values)

**Acceptance criteria:**
- [ ] All 4 themes cycle correctly via button click
- [ ] Direct swatch click sets theme without cycling
- [ ] Theme persists across page reload
- [ ] No FOUC on Bloomberg or Saffron themes
- [ ] TradingView Research chart re-renders correctly after theme change

---

### FR-10.18 Consolidated Acceptance Criteria (FR-10.9 updated)

- [ ] SIP allocations sum to exactly the entered monthly SIP amount (rounding correction applied)
- [ ] Rebalance frequency chart shows 3 distinct curves with correct labels
- [ ] Per-holding MC: clicking a row updates the cone chart to that holding
- [ ] Options: ATM put premium ≈ 1–3% of portfolio at VIX=15 for 3M expiry
- [ ] FF5: factor card betas visible within 100ms of tab click
- [ ] All user-data fields passed through `_esc()` before innerHTML insertion
- [ ] Treemap cells display P&L % on all cells where `pw>10 && ph>7`
- [ ] SIP mode `rbEl.innerHTML = html; return` exits without executing normal rebalance view
- [ ] News feed fetches and displays sentiment badges on "Fetch Latest News" click
- [ ] Peer table ranks current stock within its sector; gold highlight visible
- [ ] Promoter trend chart renders for all 52 PROMOTER_DB stocks; decline streak ≥3 shows red warning
- [ ] Screener 6 presets return correct results; custom filter applies all active fields
- [ ] Watchlist persists across reload; `🔬 Research` navigates with symbol pre-selected
- [ ] `Cmd+K` opens palette; stock search shows matching symbols with metrics
- [ ] Drag-to-reorder overview sections; order persists on reload
- [ ] Share link opens in new tab showing anonymized portfolio
- [ ] All 4 themes switch correctly; no FOUC; persist across reload
