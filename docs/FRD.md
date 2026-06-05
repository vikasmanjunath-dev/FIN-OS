# FIN-OS — Functional Requirements Document (FRD)

**Owner:** Vikas Manjunath | **Version:** 1.2 | **Date:** June 5, 2026 | **Status:** Active

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

## 11. FR-10 — Portfolio Analyser

- File input: Zerodha holdings CSV
- On upload: parse → holdings table → inject into voice agent context
- Voice-queryable: "which stocks should I sell?" → AI analyses with context
- XIRR calculation per holding
- Accessible via: Dashboard quick-access → `track-finances.html#portfolio-xray`
