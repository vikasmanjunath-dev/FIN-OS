# FIN-OS — Functional Requirements Document (FRD)

**Document owner:** Vikas Manjunath  
**Version:** 1.0  
**Date:** May 2026  
**Status:** Active  

---

## 1. Purpose

This document defines the functional requirements for every module of FIN-OS — what each feature must do, how it behaves, what inputs it accepts, what outputs it produces, and what the acceptance criteria are.

---

## 2. Module FR-01 — Authentication

### FR-01.1 Login

- **Input:** Email + password
- **Action:** Supabase `signInWithPassword()`
- **On success:** Redirect to `html/home.html`
- **On failure:** Show inline error message. No redirect.
- **Session persistence:** Supabase session stored in localStorage. Auto-restored on page reload.

### FR-01.2 Signup

- **Input:** Email + password + confirm password
- **Validation:** Password ≥ 8 characters, passwords must match
- **Action:** Supabase `signUp()` → sends confirmation email
- **On success:** Show "Check your email" message
- **Post-confirm redirect:** `html/onboarding.html`

### FR-01.3 Route Guard (`js/guard.js`)

- Runs on every protected page load
- Checks Supabase session validity
- If session invalid or expired → redirect to `login.html`
- Does not block public pages: `index.html`, `login.html`

### FR-01.4 Logout

- Calls Supabase `signOut()`
- Clears sessionStorage
- Redirects to `login.html`

**Acceptance criteria:**
- [ ] Unauthenticated user accessing `html/home.html` is redirected to `login.html`
- [ ] Login with wrong password shows error, does not redirect
- [ ] Logged-in session persists across browser refresh
- [ ] Logout clears all user data from sessionStorage

---

## 3. Module FR-02 — Onboarding

### FR-02.1 Multi-step wizard (`html/onboarding.html`)

Collects user profile data across 6 steps:

| Step | Fields |
|---|---|
| 1. Life Stage | student / early_career / growth / peak / pre_retirement / retirement |
| 2. Income | income range selector (below 3L / 3-5L / 5-10L / 10-15L / 15-25L / 25-50L / 50L+) |
| 3. Goals | multi-select: emergency fund, house, FIRE, education, business, travel |
| 4. Current Situation | checkboxes: has SIP, has home loan, has car loan, has PPF, has term insurance, etc. |
| 5. Risk Profile | conservative / moderate / aggressive (with description) |
| 6. Financial DNA | 5-question behaviour quiz → DNA type |

**On completion:**
- Writes all data to `profiles` table in Supabase
- Redirects to `html/home.html`
- Skipped if `profiles` row already exists for user (onboarding is one-time)

### FR-02.2 DNA Assessment

- 5 behavioural questions with 4 options each
- Score mapped to DNA type: wealth_builder, cautious_saver, growth_seeker, security_seeker, balanced_planner
- DNA stored in `profiles.financial_dna`
- Drives personalised content throughout app

---

## 4. Module FR-03 — Voice AI Agent

### FR-03.1 Connection

- Browser requests microphone permission via `getUserMedia()`
- If permission denied → show error chip, fallback to typed input
- Connects to `ws://localhost:8765`
- If connection refused → show "OFFLINE" chip, all other features still work
- On connect → sends `context` message with full user state

### FR-03.2 Voice Input

- User clicks orb or presses spacebar to begin recording
- AudioWorkletProcessor captures PCM audio at 16kHz
- Audio sent as binary WebSocket frames continuously
- VAD (Voice Activity Detection) in `agent.py` detects end-of-speech
- Processing begins automatically after silence detected

### FR-03.3 Speech-to-Text

- faster-whisper tiny model
- Returns transcript + confidence score
- Low-confidence transcript (<0.6) → agent asks "Sorry, didn't catch that"

### FR-03.4 Language Response

- Language detected from transcript (see `VOICE_AGENT.md` language detection)
- Response language matches input language
- Voice switches automatically per message

### FR-03.5 LLM Response

- qwen3:14b via Ollama
- System prompt includes: persona, 8 laws of money, Indian benchmarks, user context
- Default: 2–3 sentences
- Detail mode (triggered by keywords): up to 1200 tokens
- Thinking mode disabled (`think=False`) for qwen3

### FR-03.6 Text-to-Speech

- edge-tts Neural TTS
- Sentence-streamed: TTS starts on first sentence while LLM generates rest
- English/Hinglish → en-IN-PrabhatNeural
- Hindi → hi-IN-MadhurNeural
- Audio sent to browser as base64-encoded MP3 chunks

### FR-03.7 Profile Card

- Populated from `context` message (Supabase data) + extracted conversation facts
- Shows: name, age (Supabase only), city, income, life stage, financial DNA, mindset
- Family status (married, kids, single) extracted from conversation with possessive-phrase matching only
- Profile card renders on first context message and updates on memory events

### FR-03.8 Memory Panel

- Shows last N conversation turns as `[user]` and `[agent]` tagged items
- Scrolls automatically to latest
- Persists during session in RAM
- Saved to Supabase on disconnect

### FR-03.9 Persistent Memory

- On reconnect: agent greets user by name, shows "🧠 MEMORY RESTORED" banner
- Memory includes: extracted profile + session summary + last 20 turns
- Autosave every 5 minutes during active session

### FR-03.10 Portfolio Query

- If `window.FINOS_PORTFOLIO_DATA` is set (Portfolio Analyser page), agent knows full holdings
- User can ask: "which of my stocks should I sell?", "what is my total P&L?", "what is my biggest loser?"
- Agent answers with specific stock names and numbers from the actual portfolio

**Acceptance criteria:**
- [ ] Orb shows READY HAI within 3 seconds of page load (with Ollama running)
- [ ] Speaking "my name is Rahul" → profile card shows "Rahul" within next 2 responses
- [ ] Speaking "my son is starting school" does NOT trigger "Has kids" card (topic mention, not ownership)
- [ ] Speaking "my son Arjun needs a laptop" DOES trigger "Has kids" card
- [ ] Asking "explain SIP in detail" gets ≥5 sentences, not 2–3
- [ ] Disconnecting and reconnecting → profile card restored from memory
- [ ] Typing when mic is off works identically to voice input

---

## 5. Module FR-04 — Financial Calculators

### FR-04.1 Calculator Grid (`html/calculators.html`)

- Renders 87 calculator cards across 9 categories on page load
- Cards grouped by category with expandable sections
- Search filter narrows visible cards by name
- Category sections collapsible
- Grid renders on first load (no refresh required — `readyState` guard)

### FR-04.2 Individual Calculators

Each calculator must satisfy:

| Requirement | Detail |
|---|---|
| Loads without backend | Pure HTML/JS — no API calls |
| Inputs have sensible defaults | Pre-filled with Indian-context values |
| Outputs update on change | Real-time (no submit button needed for basic calc) |
| Shows visual result | Chart or comparison table, not just a number |
| Works on mobile | Responsive layout, inputs tappable |
| URL is shareable | Each calculator has a unique URL |

### FR-04.3 Calculator Categories and Files

| Category | Count | Folder |
|---|---|---|
| Core Thinking | 10 | `calculators/core-thinking/` |
| Investment & Wealth | 15 | `calculators/investment & wealth/` |
| Banking & Fixed Income | 10 | `calculators/banking & fixed income/` |
| Loans, Debt & EMI | 11 | `calculators/loans, debt & emi/` |
| Tax & Salary | 10 | `calculators/tax & salary/` |
| Retirement & Life | 7 | `calculators/retirement & life planning/` |
| Trading & Markets | 8 | `calculators/trading & markets/` |
| Financial Health | 6 | `calculators/financial health/` |
| Desi Reality Check | 10 | `calculators/desi reality check/` |

**Acceptance criteria:**
- [ ] All 87 calculator links in `calculators.html` resolve to 200 (no 404s)
- [ ] SIP calculator: ₹10,000/month, 12%, 20 years → ~₹99.9 lakhs
- [ ] EMI calculator: ₹50L, 8.5%, 20 years → ₹43,391/month
- [ ] Old vs New regime correctly applies 87A rebate for income ≤ ₹7L under new regime

---

## 6. Module FR-05 — Alert Engine

### FR-05.1 Scheduled Evaluation

- APScheduler runs every 15 minutes
- Fetches all active user profiles from Supabase
- Runs 10 rule classes in sequence for each user
- Each rule checks cooldown before firing (prevents spam)

### FR-05.2 Alert Rules

| Rule | Trigger Condition | Cooldown |
|---|---|---|
| `sip_missed` | No SIP transaction this calendar month (user had SIP before) | 72 hours |
| `salary_credited` | Income transaction in last 5 days | 25 days |
| `market_drop` | Nifty 50 falls > 3% in one day | 12 hours |
| `goal_behind` | Goal deadline < 180 days, funded < 30% | 7 days |
| `cc_bill_due` | Credit card bill due within 5 days | 48 hours |
| `budget_overrun` | Any category spend > 20% over budget | 48 hours |
| `emergency_fund_low` | Liquid savings < 3 months of expenses | 7 days |
| `tax_season` | 8 calendar-based triggers (advance tax, ITR deadline, 80C deadline, etc.) | 6 hours |
| `fno_expiry_week` | User has F&O positions AND expiry Thursday is within 7 days | 7 days |
| `net_worth_milestone` | Portfolio crosses ₹1L / ₹5L / ₹10L / ₹25L / ₹50L / ₹1Cr | 30 days |

### FR-05.3 Alert Delivery

- **In-app:** Supabase Realtime INSERT fires → `finos-alerts.js` updates bell badge
- **Push notification:** Web Push (VAPID) via `pywebpush` — OS-level notification
- User can disable individual rules via preferences API

### FR-05.4 Alert UI

- Bell icon on every page (injected by `finos-widget.js`)
- Badge shows unread count
- Click opens slide-out drawer with all alerts, newest first
- Each alert has: priority icon, title, message, timestamp, optional action link
- "Mark all read" button clears badge

**Acceptance criteria:**
- [ ] Nifty drops 3.1% → `market_drop` alert appears in bell within 15 minutes
- [ ] Alert marked read → badge count decreases
- [ ] Push notification arrives on OS when app is in background (requires subscribed device)
- [ ] User disables `sip_missed` rule → no more SIP alerts for that user

---

## 7. Module FR-06 — Financial Health Score

### FR-06.1 Scoring

Computed by `GET /health-score/{user_id}` from live Supabase data:

| Pillar | Max Points | Full Score Condition |
|---|---|---|
| Emergency Fund | 20 | ≥ 6 months of expenses in liquid savings |
| Debt Management | 20 | Zero EMI burden; penalty for CC debt + personal loans |
| Savings Rate | 20 | ≥ 30% savings rate + active SIP |
| Investment Growth | 20 | Diversified portfolio, no F&O >10%, goals funded |
| Insurance | 10 | Term insurance ≥ 10× income + health cover ≥ ₹10L |
| Tax Efficiency | 10 | 80C maxed + NPS open + PPF active |

### FR-06.2 UI

- Floating score badge on every page (injected by `finos-widget.js`)
- Click opens animated SVG ring chart showing all 6 pillars
- Top 2 actionable tips shown below chart
- Badge colour: red (0–39), amber (40–59), green (60–74), teal (75–89), gold (90–100)

**Acceptance criteria:**
- [ ] User with no emergency fund, no SIP, no insurance → score < 40 (DANGER)
- [ ] Score badge visible on all pages with `finos-widget.js` included
- [ ] Score refreshes if user updates profile data without hard reload

---

## 8. Module FR-07 — Portfolio Analyser

### FR-07.1 CSV Upload

- User uploads Zerodha Holdings export (CSV)
- Parser reads: symbol, quantity, avg cost, LTP, P&L
- Parses both EQ (equity/ETF) and MF (mutual fund) sections
- Displays holdings table with sortable columns

### FR-07.2 Analytics

After upload, shows:
- Total portfolio value, cost basis, absolute P&L, P&L %
- Holdings table: symbol, type, quantity, avg price, LTP, P&L, P&L %
- Asset allocation pie chart (equity / MF / ETF / other)
- Sector breakdown (for equity holdings)
- Top 5 gainers + top 5 losers

### FR-07.3 Voice Integration

- After CSV parse, `_buildVoicePortfolioCtx()` builds `window.FINOS_PORTFOLIO_DATA`
- Voice agent context updated via `window._finosRequestContext()`
- User can ask voice agent: "what is my total P&L?", "should I sell HDFC Bank?", "which sector am I overweight in?"
- Agent answers with specific stock names, numbers, and percentages from the actual portfolio

**Acceptance criteria:**
- [ ] Zerodha CSV upload → portfolio table renders within 2 seconds
- [ ] "What is my biggest loser?" → agent names the actual stock with its P&L%
- [ ] Portfolio with RELIANCE +18% → voice agent can confirm this gain when asked

---

## 9. Module FR-08 — Budget & Expense Tracker

### FR-08.1 Transaction Entry

- Add transaction: amount, type (income/expense), category, date, optional note
- Categories: salary, rent, food, transport, utilities, entertainment, medical, SIP, EMI, investment, other
- Edit and delete existing transactions
- Bulk import (CSV) for historical data

### FR-08.2 Budget Setting

- Set monthly budget per category
- Visual progress bars: spent / budget limit
- Over-budget categories highlighted in red
- Budget carries forward month-to-month unless changed

### FR-08.3 Reports

- Monthly summary: income vs expense vs savings
- Category breakdown for any date range
- Savings rate trend (last 12 months)
- Export to CSV

### FR-08.4 React Budget App (Separate Module)

The React app at `ExpenseTracker/finos-budget/` extends the tracker with:
- FIRE Calculator (time to financial independence)
- Debt Destroyer (snowball + avalanche comparison)
- AI War Room (scenario analysis: "what if I increase SIP by ₹5,000?")
- Gamified achievements
- Subscription manager

---

## 10. Module FR-09 — Market Intelligence

### FR-09.1 Markets Overview (`html/markets.html`)

- Nifty 50 and Sensex price + change (via yfinance)
- Sector heatmap (11 NIFTY sectors)
- Top gainers and losers (Nifty 500)
- Data refreshes every 5 minutes during market hours

### FR-09.2 Trade Signals (`html/market-intel.html`)

- 4 signal categories: intraday, swing, fundamental, long-term
- Each signal: symbol, signal type (buy/sell/hold), confidence, key indicators, entry/exit levels
- Signals generated by local Python APIs — not bought from any data vendor

### FR-09.3 Asset Detail Pages

Individual deep-dive pages for: equity, mutual funds, ETFs, bonds, commodities, forex, derivatives, crypto. Each shows: historical price chart, key metrics, India-specific context.

---

## 11. Module FR-10 — News Intel

### FR-10.1 Feed (`app.py` :5000)

- Aggregates Google News RSS for financial terms
- Regions: India + Global
- Categories: stocks, mutual_funds, economy, personal_finance, crypto
- High-impact flag: articles with words like crash, surge, RBI, Fed, crisis, record, inflation

### FR-10.2 Display (`html/news.html`)

- Card layout: title, source, category chip, high-impact badge, timestamp
- Filter by category
- Cached 10 minutes — no rate limiting issues
- Opens article in new tab

---

## 12. Module FR-11 — Education Suite

### FR-11.1 Finance 101 (`html/finance101.html`)

Core concepts covered:
- Time value of money
- Compounding
- Inflation and real returns
- Risk and reward tradeoff
- Asset classes overview

### FR-11.2 Learn Modules (14 pages)

Each learn page covers: what it is, how it works in India, red flags, what to use it for, and practical starting steps.

### FR-11.3 Insight Articles (5 pages)

Long-form deep dives: SIP myths, EMI reality, debt traps, inflation impact, RBI rate decisions.

### FR-11.4 Psychology / Behavioural Finance (10 pages)

DNA assessment, mindset simulations, fear roadmap, decision framework, money behaviours.

---

## 13. Module FR-12 — PWA

### FR-12.1 Installability

- `manifest.json` with icons, name, display: standalone
- Service worker registered on first load
- Install prompt shown after 2 page visits

### FR-12.2 Offline Support

- All HTML pages cached after first visit (network-first strategy)
- CSS, JS, assets cached immediately (cache-first strategy)
- Offline fallback page shown for uncached pages
- Calculators work fully offline (no external dependencies)

### FR-12.3 Push Notifications

- Service worker handles Web Push
- Bell subscription prompt on alert engine pages
- OS-level notifications for critical and warning alerts

**Acceptance criteria:**
- [ ] App installable from Chrome on Android + Safari on iOS
- [ ] SIP calculator works with no network connection
- [ ] Push notification received when market drops 3% (requires subscription + device)
