# FIN·OS Mobile App (Expo)

React Native companion to the FIN·OS website. Lives in [`mobile/`](../mobile). It reuses the website's
`finos_*` storage keys and formulas, so data and numbers match between the two.

> **Status (Oct 11 2026):** runs end-to-end against the local `arya-ai` backend. Cloud login, holdings sync and
> tracker sync are built and tested against the website's own code and a local mock Supabase, but have **never
> run against the real project** (it is reachable again, but the `holdings` and `tracker_snapshot` tables had not been
> created when last checked). No iOS/Android build has been produced — see [Known gaps](#known-gaps).
>
> **Oct 15 2026 integration:** the Learn section, PULSE feed with Arya memory and life events, insurance hub, mutual-fund
> search, market research, six planners, onboarding, feedback, crash notes, the new erase flow and the release pack were merged
> into the shared files (search index, privacy notice, Hindi table, dashboard tiles, calendar and reminders). `npm test` is at
> 676 tests; `npx tsc --noEmit` is clean. Hindi for the new screens is a first pass nobody fluent has reviewed.

---

## 1. Stack

| Layer | Choice |
| --- | --- |
| Framework | Expo SDK 53, React Native 0.79 (new architecture on), React 19 |
| Navigation | expo-router 5 (file-based, typed routes) |
| Storage | `@react-native-async-storage/async-storage` |
| Cloud | `@supabase/supabase-js` (optional — null client = guest mode) |
| UI | Dark and light themes (Settings → Appearance: Auto / Dark / Light), `constants/theme.ts`; `expo-linear-gradient`, `expo-haptics`, `react-native-svg` |
| Targets | iOS, Android, web (Expo web is how it is currently previewed) |

Bundle id / package: `com.finos.mobile`, URL scheme `finos`.

## 2. Run it

```bash
cd "Initial Deployment/mobile"
npm install --legacy-peer-deps      # peer-dep conflicts without the flag
npx expo start --web --port 8082    # or: npm run ios / android
```

- Port 8081 is used by another Expo project on this machine, hence 8082. In Claude Code, `preview_start finos-mobile-web`
  (defined in `Finos/.claude/launch.json`) does the same.
- There is no Xcode on this Mac, so the iOS simulator is unavailable; use Expo web or Expo Go on a phone.
- **Backend:** start `arya-ai` (port 7475) with `Initial Deployment/arya-ai/start.sh`. Without it the app still opens;
  Markets shows demo index values and Arya chat falls back to an error message. Local Ollama only has `qwen3:8b`.

### Backend host resolution (`constants/endpoints.ts`)
First match wins:
1. Host saved in **Settings** (`finos_host_ip`) — IP, hostname or full `http(s)://` URL
2. The machine running `expo start` (works for a phone on the same LAN)
3. Browser hostname (web)
4. `127.0.0.1` (iOS simulator) / `10.0.2.2` (Android emulator)

### Environment (`mobile/.env`, optional)
Copy `.env.example`:
```
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```
Anon key only, never `service_role`. Expo inlines these at build time — restart `expo start` after editing.
Missing or malformed values put the app in guest/local-only mode (`isSupabaseConfigured` is false).

## 3. Screens

Entry (`app/index.tsx`) redirects to Dashboard.

| Route | File | What it does | Data source |
| --- | --- | --- | --- |
| Dashboard tab | `app/(tabs)/dashboard.tsx` | Net worth, portfolio, SIP, spent-this-month strip, over-budget alert, quick-log chips, tappable tracker cards, "next best step", Retirement & Protection, Recurring Costs and Money Tools tiles (Money Score, Retirement odds, Prepay, Debt payoff, Future loss, Tax savings, Home loan, SIP step-up, Salary structure, Financial calendar, Offers) | On-device trackers + holdings |
| Markets tab | `markets.tsx` | NIFTY 50 / SENSEX / NIFTY IT / NIFTY BANK (every 30 s) and 8 NSE sector indices (every 60 s); links to Market research and Mutual fund search; an unknown change shows "Change not available", never 0 | Live: `GET :7475/api/market/overview` and `/api/market/sectors`. When the backend is unreachable the screen says so — no invented prices. (Needs a restarted backend for the sectors route.) |
| Arya tab | `arya.tsx` | Streaming chat, sends the user's profile context. Safety guardrails (`lib/aryaGuardrails.ts`, same rules as the website): tax-evasion / forged-document requests are refused on the phone before any network call; notes about buy/sell calls, guaranteed returns and price predictions are appended to finished answers (never rewriting them) | Live: `POST :7475/api/chat` (SSE) |
| Track tab | `track.tsx` | Income vs spend, savings note, and the two ways to get transactions in: log them, or **import a bank statement** (opens `tracker/import`) | On-device. Account Aggregator is **not** offered — there is no live integration to connect |
| Portfolio tab | `portfolio.tsx` | Holdings (stocks, mutual funds, ELSS), SIP tab, computed insights, add/remove, **Import** from a Zerodha / Groww / generic holdings CSV (preview, then units and average cost replace those of a matching holding; importing the same file twice changes nothing; holdings without a ticker or scheme code keep the broker's price) | Live prices: `/api/quotes`, `/api/quote/`, AMFI NAV via `/api/mf/search`, `/api/mf/nav/` |
| Privacy & your data (modal) | `privacy.tsx` | What is on the phone (live counts), every flow that can leave it (sign-in/sync, your own Arya backend, files, share sheet), what the app never does, permissions asked, and your controls: export, delete everything on the phone, delete the cloud copy, delete the account | On-device; cloud deletes need a signed-in session |
| Terms of use (modal) | `terms.tsx` | Port of the website's terms — a draft for legal review; operator, liability and law are left blank on purpose | Static |
| Settings (modal) | `settings.tsx` | Name, income, backend host, account & sync, reminders, appearance, language, links to What Arya remembers, PULSE, Your dates, Feedback, Diagnostics, Welcome tour, Privacy and Terms; clear data | AsyncStorage |
| Learn | `app/learn/index.tsx`, `app/learn/[id].tsx` | 22 readable lessons and 3 interactive-only pages (a card says so and links to the matching phone tool). Progress, continue / up next, search over title, summary and body. Passages whose facts may be out of date carry a "check before relying" box | Bundled `content/learn/*.json` (extracted from `html/*.html`); on-device `finos_learned_modules` |
| PULSE (`/pulse`) | `app/pulse/index.tsx` | Ranked cards from what the phone has recorded (14 of the website's 27 sections; the other 13 are assumption-driven or need history, listed on the screen with reasons), "since your last visit", and what is missing for each card | On-device; ranking is a parity-tested port of `js/arya-pulse-rank.js` |
| What Arya remembers, Life events | `app/pulse/memory.tsx`, `app/pulse/life.tsx` | Notes and topics (never the question text), per-note "never send", the exact request body that will be sent, switches for online / figures / memory / life events (memory and life events are off by default); seven life-event types with "because" lists of the recorded facts | On-device; `finos_session_arya_*` keys are never synced |
| Insurance hub | `app/insurance/index.tsx`, `[type].tsx`, `compare.tsx` | Cover types (what pays / does not pay), questions to ask, your policies against them, compare. No insurer or product is named or ranked; every figure the website states shows its source line and "date not stated" | Bundled `content/insurance/*` extracted from the website pages; `finos_insurance_checks_v1` |
| Mutual fund search | `app/funds/index.tsx`, `[code].tsx`, `compare.tsx`, `expense.tsx` | Search, each Direct/Regular x Growth/IDCW version separately, NAV with its date, compare up to 3, Direct vs Regular cost, SIP consistency from your own entries. Returns appear only when the NAV history really covers the window | Your backend: `/api/mf/search`, `/api/mf/nav/{code}`, `/api/mf/history/{code}` |
| Market research | `app/market/index.tsx`, `news.tsx`, `screener.tsx`, `commodities.tsx`, `fx.tsx`, `crypto.tsx`, `stock/[symbol].tsx`, `fund/[code].tsx` | News with stated keyword-sentiment, share and fund look-up, price-only screener, gold/silver/oil (world prices converted at a live rate, not MCX), currency, crypto. Each answer shows when it was fetched; offline shows the last saved answer with its time | Your backend; cache `marketcache_v1:*` (not exported; erased with all data, or "Clear saved market data") |
| Planners | `app/plan/forecast.tsx`, `lifegoals.tsx`, `growth.tsx`, `couple.tsx`, `benchmark.tsx`, `mydates.tsx` | Spending forecast (this month, from logged spending), life-goals roadmap from derived figures only, growth projection at a return you set, couple finance kept on this phone, rule-of-thumb benchmarks (no peer comparison), your own dates and an .ics export | On-device; website ports parity-tested |
| Welcome tour, Feedback, Diagnostics | `app/onboarding/welcome.tsx`, `app/feedback.tsx`, `app/diagnostics.tsx` | Skippable first-run tour (at most twice, never for a phone that already holds data); feedback saved on the phone and shared only through the share sheet; redacted crash notes and opt-in screen counts, read and deleted by the person | On-device; nothing is sent automatically |
| Login (modal) | `login.tsx` | Supabase email/password sign in / sign up | Supabase |
| Tool screens | `app/tools/{retirement,score,prepay,offers,tax,taxplanner,debt,leak,salary,stepup,homeloan,calendar,credit,windfall,lifecover,rebalance,itr,goalopt}.tsx`, `app/tracker/{fixed,gold,crypto,passive,harvest}.tsx` | **Passive income** (dividend / FD / rental / SWP / SGB streams, how much of your spending they cover, freedom milestones, what-if and the extra corpus needed at a 4% payout) · **Credit score** (CIBIL band, estimated home-loan rate and extra interest vs the best band, ranked tips; nothing is assumed for a figure you did not type) · **Crypto** (holdings at the prices you enter, P&L, 30% + 4% cess on each coin's gain, 1% TDS what-if) · **Financial calendar** (month grid with event dots, day detail, a 45-day coming-up list grouped Today / This week / Later with urgency, and this-month SIP / EMI / insurance / next tax date; no phone notifications yet) · **Gold** (physical gold, SGBs, gold ETFs and funds valued at the price you type; SGB coupon) · **Salary structure** (CTC breakup → gross, HRA exemption as the three-way minimum, tax in both regimes, monthly take-home, restructuring tips; take-home becomes your income only when you tap the button) · **SIP step-up** (flat vs stepped-up SIP, 5/10/15/20% scenarios, corpus chart, milestones) · **Home loan** (EMI, total interest, year-by-year schedule, 40% affordability, 24(b)+80C deductions, prepayment impact; "Save as my home loan" fills Net Worth and Debt payoff) · **Goal optimizer** (opened from Goals: each goal's inflation-adjusted target and the SIP it needs, a priority ranking, whether your savings cover them all, and goals competing for the same months) · **ITR prep kit** (opened from the Tax planner: income, 80C itemised, other deductions, tax in both regimes, TDS paid and the balance to pay or refund; figures other trackers know are offered, not written silently) · **Rebalancer** (equity, debt, gold, property, crypto, govt savings from your trackers against a target mix: drift, what to add or trim, and where fresh money should go so nothing needs selling) · **Life cover needed** (opened from Insurance: human life value and income replacement plus debts, less existing cover; a rough premium illustration) · **Windfall allocator** (a bonus, RSU vest, FD maturity or sale: the ordered places it should go, and the extra tax on a bonus / RSU) · **Tax planner** (opened from Tax savings: both regimes side by side with surcharge, HRA, 80C / 80D / NPS / 24(b), capital gains and an action list; prefilled from salary, PPF and health policies) · **Tax savings** (current tax and regime, what the old-regime deductions could still save, headroom per section, break-even deductions; the website's Tax Savings Tracker) · **Debt payoff** (avalanche vs snowball over your loans, home-loan prepayment impact; balances shared with Net Worth) · **Future loss** (what the monthly leak in your ledger would be worth invested, 10 / 20 / 30 years, redirect share) · **Deposits & fixed income** (FD, RD, PPF, NSC, SCSS, Sukanya, bonds, post office: value today, at maturity, maturing soon) · **Retirement planner** (projected corpus by source vs the 25× need, monthly income then, Monte Carlo odds over 4,000 futures, fan chart, "what monthly SIP gets me to 85%") · **Money Score** (60-second check: 0–100 over six pillars, why, three ranked next moves with +points, what-if steppers, share, prefilled from what you track) · **Prepay loan or invest?** (month-by-month simulation, winner, break-even return, net-position chart) and **Job offer comparer** (up to 3 offers: monthly in-hand, regime, 5-year total value). Inputs recompute live and are remembered on the device | On-device only (`finos_prepay_inputs_v1`, `finos_offers_inputs_v1`) |
| Tracker screens | `app/tracker/*.tsx` | `networth`, `budget`, `transactions`, `recurring`, `emergency`, `goals`, `health`, `epf`, `nps`, `ppf`, `insurance`, `subscriptions`, `import`, `holdings-import`, `fixed`, `gold` | AsyncStorage |

## 4. Architecture

```
app/            expo-router screens (UI only)
components/     AddHoldingModal, AryaBubble, MetricCard, QuickLogChips, TrackerUI (fields, cards)
hooks/          React bindings over lib/ — useTrackers, useHoldings, useTransactions, useQuickLog,
                useRecurring, useFinosContext, useAuth, useAryaChat, useMarketData
lib/            pure logic + storage (no React)
constants/      endpoints.ts (host/ports), theme.ts
```

Design rule: **formulas in `lib/` are pure ports of the website's JS** so results match. Where a port exists it was
checked against the website's real functions with randomised inputs (see [Verification](#6-verification)).

| Module | Ports / does |
| --- | --- |
| `lib/trackers.ts` | Net worth, FIRE (25× yearly spend), emergency fund, goals, 7-pillar health score (matches `_computeLocalScore` in `js/finos-health-score.js`) |
| `lib/budget.ts` | Port of `js/finos-budget.js`: record normalisation, auto-category from label, category budgets, suggested limits, savings rate |
| `lib/retirement.ts` | EPF (`finos-epf-tracker.js`), NPS, PPF / small savings, insurance gap rules (`html/insurance-hub.html`) |
| `lib/moneyScore.ts`, `lib/moneyScoreStorage.ts` | Port of the pure core of `js/finos-money-score.js` (six weighted pillars, ranked moves re-scored with the fix applied, what-if, prefill from tracked data, history/trend); the storage side saves the website's exact entry shape and seeds shared keys only when empty. Parity-tested on 1,500 random inputs |
| `lib/montecarlo.ts`, `lib/retirementPlan.ts`, `lib/retirementStorage.ts` | The website's seeded Monte Carlo engine (kept line-for-line) and the planner's arithmetic with its storage separated out; writes the same `finos_retire_*` keys, including the corpus / gap totals the health score reads. Identical output to the website on 40 random simulations and 400 random profiles |
| `lib/privacy.ts`, `lib/dataControls.ts` | The notice's data-flow registry and terms text; export / erase / delete-cloud / delete-account. `__tests__/privacy.test.mts` fails if the app references a new host, asks for a new phone permission, adds an analytics SDK, or calls `fetch` from a new module |
| `lib/statementImport.ts` | Port of `js/finos-statement-import.js` (+ the CSV helpers from `js/finos-import.js`): finds the header row under bank preambles, debit/credit columns or one amount with Dr/Cr, day-first dates, balance reconciliation, never guesses (skipped rows carry a reason), noon-UTC dates, counted dedupe, undo by batch. Also reads Account Aggregator (ReBIT) JSON. Parity-tested on random statements |
| `lib/subscriptions.ts` | Port of `js/finos-subscriptions.js`: normalise, your-share cost, next renewal / occurrences (31 Jan → 28 Feb → 31 Mar), summary with overlap and low-value review. Parity-tested against the web file |
| `lib/taxcore.ts`, `lib/prepayInvest.ts`, `lib/offerCompare.ts` | Ports of `js/finos-taxcore.js` (new/old regime, 87A + marginal relief, FY 2025-26), `js/finos-prepay-invest.js` and `js/finos-offer-compare.js`. Parity-tested; Prepay also checked against the golden values in `docs/PREPAY_OFFERS_SUBSCRIPTIONS.md`. The web's `savingsPlan()` is not ported |
| `lib/goalOptimizer.ts`, `lib/goalOptimizerStorage.ts` | `_compute` of `js/finos-goal-optimizer.js` with goals, income and the clock passed in; writes `finos_goals_priority` / `_total_sip` / `_feasibility`. Parity-tested on 800 goal sets; the website was fixed to stop double-counting inflation on money already saved |
| `lib/itrSummary.ts`, `lib/itrStorage.ts` | The slabs, HRA rule and `_compute()` of `js/finos-itr-summary.js` sliced unchanged with `read(key)` in place of localStorage; the form stores under the website's own keys. Parity-tested on 800 stored-value sets |
| `lib/rebalancer.ts`, `lib/rebalancerStorage.ts` | `_compute` and presets of `js/finos-rebalancer.js` with the values passed in, plus a new-money split. Same `finos_target_alloc` / `finos_rebalance_needed` keys. Parity-tested on 1,000 portfolios |
| `lib/lifeCover.ts`, `lib/lifeCoverStorage.ts` | `_compute`, status bands and the premium table of `js/finos-life-cover.js`; prefilled from income, spending, life policies and loans; writes `finos_life_cover_*`. Parity-tested on 1,500 profiles |
| `lib/passive.ts`, `lib/passiveStorage.ts` | Calculation half of `js/finos-passive-income.js`; same `finos_passive_streams` shape and two total keys. The first-time FD line is a labelled 7% estimate and the SGB line is the coupon from the Gold tracker. Parity-tested on 800 stream lists |
| `lib/taxHarvest.ts`, `lib/taxHarvestStorage.ts` | Port of `_analysePositions` in `js/finos-tax-harvest.js` (loss offset: short-term losses clear short-term gains then long-term, long-term losses only long-term; ₹1.25 L exemption headroom; gain-harvest candidates). Same keys (`finos_harvest_positions`, `finos_th_ltcg_<yr>`, `finos_th_stcg_<yr>`, `finos_harvest_tax_saved`, `finos_harvest_ltcg_net`). Both sides add the 4% cess (the website did not until Oct 13 2026). No demo holdings: the list starts empty. Parity test freezes the clock and runs the website file on 1,200 random portfolios |
| `lib/reminders.ts`, `lib/remindersNative.ts`, `lib/remindersStorage.ts` | Local reminders from the calendar's events. `reminders.ts` is the pure planner (website lead times: tax and insurance 7 days, goals 14, maturities and subscriptions 3, SIP 1; the person's own dates 3; a notice at the lead time and one on the day; at most 40 pending, soonest first; stable ids; default text names no event and no amount, details are opt-in). `remindersNative.ts` is the only file that touches `expo-notifications` (date triggers only, loaded on demand, never on web). Re-planned at start and whenever the app returns to the foreground; cleared by Clear All Data and by Privacy → Delete everything. **Not yet verified on a device**: the planner is unit-tested, OS delivery needs a device build |
| `lib/dna.ts`, `lib/dnaStorage.ts` | Financial DNA quiz (`js/finos-dna-steps.js`): nine questions, five scores, stored in the website's `FINOS_CORE_DNA` shape. Scores are recomputed from the answers; only a **complete** quiz changes the Health Score (Behaviour = round(Discipline × 0.15), same rule as the website). Parity test compares questions and scoring with the website on 1,000 random answer sets. The website had no 36-49 age answer; added on both sides |
| `lib/calcs/*.ts`, `app/tools/calculators.tsx`, `app/tools/calc/[id].tsx` | **71 website calculators** as data: inputs plus a pure `run()` that returns the lines the page writes (`id`, label, exact text). One generic screen renders any of them; `calculators.tsx` is the searchable hub. `__tests__/webCalc.parity.test.mts` loads each page's real inline script into a stub DOM and compares every text it writes with `run()` on ~70 vectors per page (defaults, all-min, all-max, each input at 0 and 2x max, 60 random). Not ported because they are not plain formula pages: EPF, NPS, PPF, goal-based, rebalancing, SIP optimizer, step-up, debt snowball, home loan, retirement, in-hand salary, net worth, emergency fund, financial-health lifestyle, buy-vs-rent, and the tax/offer/prepay pages that use the shared cores (most have a fuller screen in the app already) |
| `lib/realEstate.ts`, `app/tools/realestate.tsx` | Port of `js/finos-real-estate.js` (buy vs rent, true cost of buying, rental yield). The model is deliberately not the website's first version: both sides spend the same cash each month and whoever pays less invests the difference, buying costs are paid up front, selling cost and capital-gains tax come off the property, the break-even year comes from the same monthly run as the winner, and a home-loan tax benefit is the tax actually saved (deduction × bracket × 1.04) and only if claimed. The website page now uses the same module. Parity test: 600 random scenarios |
| `lib/search.ts`, `app/search.tsx` | Search across every screen (🔍 on Home): ranked title / keyword / Hindi-and-Hinglish matches over a hand-kept index plus all 71 calculators; recent and popular lists. A test fails if an indexed route has no screen file or a tool/tracker screen has no entry |
| `lib/themeCore.ts`, `lib/theme.ts`, `components/Gradient.tsx` | **Light theme** (Settings → Appearance: Auto / Dark / Light). Screens are written against the dark palette; in light mode the core components (View, Text, TextInput, ScrollView, TouchableOpacity, Pressable, Switch, ActivityIndicator, RefreshControl) map the colours they are about to draw, so no screen was edited. `themeCore.ts` is the pure mapper: palette tokens to hand-tuned light values, white overlays to dark overlays, accents with alpha keep their alpha, shadows and scrims untouched, **idempotent** (a TouchableOpacity renders a View, so a colour can pass through two patched components). Tests check WCAG AA of every text token on the page and card, and of every accent on its own 15% tint. SVG charts and gradients use `useThemed()` / `Gradient.tsx`. `mobile/scripts/theme-audit.py` walks 27 screens in the Expo web preview and reports any text under WCAG AA (0 findings today) |
| `lib/report.ts`, `app/tools/report.tsx` | **Financial report**: a one-page plain-text summary (net worth, cash flow, safety net, scores, goals, long-term, what is due) from recorded figures only. Unrecorded reads "Not recorded"; the FIRE line is left out when it would rest on a default spend; a switch leaves amounts out (percentages and months stay). Shared through the phone's share sheet (clipboard / Web Share on web). Text, not PDF: a PDF would need a native dependency and a device to verify it |
| `lib/profile.ts`, `lib/profileStorage.ts`, `app/profile.tsx` | **Profile**: name, age, monthly income, dependents (the website's keys `finos_user_name`, `finos_age`, `finos_monthly_income`, `finos_dependents`). Validated (age 18-100, dependents 0-15), emptied fields are removed so they read as unknown everywhere, each field says what it is used for. No phone, e-mail, address, PAN or Aadhaar. Settings now links to it |
| `lib/watchlist.ts`, `lib/watchlistStorage.ts`, `app/tracker/watchlist.tsx` | **Watchlist** (👁 Watch on Portfolio): stocks by NSE ticker and funds by search, kept with the price at the time you added them so "since added" is a real number. Offline an item is added without a price (never a made-up one) and fills in later; stale prices are marked. Screener not built |
| `lib/vaultCrypto.ts`, `lib/appLock.ts`, `lib/appLockStorage.ts`, `lib/backup.ts`, `components/LockGate.tsx`, `app/security.tsx` | **App lock and encrypted backup.** PIN (6 digits, weak runs refused) verified with PBKDF2-SHA256 and kept in the phone's secure storage; wrong tries wait 30 s doubling to 15 min, counted across restarts; optional fingerprint/face; auto-lock after 0 s to 15 min; "Forgot PIN" erases the app's data and removes the lock (a forgotten PIN cannot be recovered). The lock is a gate on the screen, not encryption of storage (the phone's own storage encryption does that). **Backups**: AES-256-GCM, key from PBKDF2-SHA256 (310,000 rounds on the phone; the website uses 600,000 and each file records its own count), same file format as the website's vault: **a backup made on either side opens on the other** (tested both ways against `js/finos-vault.js`). Never in a backup: the lock, the host setting, the theme, tokens |
| `lib/alerts.ts`, `lib/alertsStorage.ts`, `app/alerts.tsx`, `components/AlertBell.tsx` | **Alerts bell** worked out on the phone. Ports the website alert engine's rules that can be decided from recorded data: emergency fund under 3 months, goals behind (needs a date and a recorded monthly amount), budget over / on pace, unusual category month (needs 3 earlier months), insurance renewals within 30 days, tax dates within 14 days, 80C room (Oct-Mar, only when recorded), subscription renewals / trial ends, net-worth milestones. Not ported because they need a bank feed, card data or a market stream: missed SIP, salary credited, credit-card bill, market drop. Ids carry the period, so a dismissed alert returns next month if still true |
| `lib/xirr.ts`, `lib/holdingDates.ts`, `components/XirrCard.tsx` | **Annualised return (XIRR)** on the Portfolio analysis tab from purchase dates the person enters (stored on the phone only: the cloud holdings table has no date column). A holding without a date is left out, never assumed; each dated holding is treated as bought in one go on that date, and the card says so. Bisection solver, days / 365, tested against independent present-value checks |
| `lib/aryaOffline.ts` | When Arya's server cannot be reached the reply is plain language with tappable links to what works with no connection (Money Score, calculators, calendar, report); developer hints only in a dev build |
| `lib/learn.ts`, `lib/learnStorage.ts`, `lib/learnContent.ts` (generated) | Lesson manifest, search, progress (`finos_learned_modules` in the website's shape, tested against `_markCompleted` of `js/learn-ai.js`), and the Knowledge pillar of the Health Score (`min(6, floor(count x 0.43))` plus streak points, cap 10; golden test evaluates `js/finos-health-score.js` itself). `finos_learn_opened` (phone only) drives "continue" |
| `lib/pulseRank.ts`, `lib/pulseCards.ts`, `lib/pulseStorage.ts`, `lib/aryaFacts.ts` | PULSE: `js/arya-pulse-rank.js` ported (600 random contexts), the 14 ported sections as cards with a "From:" source line, `finos_pulse_snapshot` for "since your last visit". Facts are read from the same cores as the screens; an unknown figure is "not recorded", never 0 |
| `lib/aryaMemory.ts`, `lib/aryaMemoryStorage.ts`, `lib/lifeEvents.ts`, `lib/lifeEventsStorage.ts`, `lib/aryaContext.ts` | What Arya remembers and life events (on-device, off by default), and the one function that builds the chat request body; the Memory screen lists the same `disclosures`, a test asserts the chat hook assembles no other context |
| `lib/aryaTools.ts`, `lib/aryaGuardrails.ts` (`applyFigures`) | Local answers for net worth, savings rate, emergency months, goals, dues, spending, score, insurance, debt, tax and SIP / EMI sums (the calculator hub's own `run`), each with a source line; public market questions go to `/api/tool` when online. `applyFigures` adds a note when a model sentence states an amount about the person that matches no recorded figure |
| `lib/insuranceHub.ts`, `lib/insuranceHubStorage.ts`, `content/insurance/*` | Insurance hub (see Screens). `extract-insurance.py --check` re-resolves every quoted line against the website page and fails when one moved |
| `lib/funds.ts`, `lib/fundsHistory.ts`, `lib/fundsClient.ts`, `lib/fundsApi.ts`, `lib/fundsStorage.ts` | Fund records (NAV <= 0 is unknown, never 0; Direct/Regular and Growth/IDCW read from the feed), point / rolling / SIP returns refused unless the history covers the window, compare, expense-ratio impact and SIP consistency (parity-tested against `js/mf-intelligence.js` on 800 + 300 random cases) |
| `lib/marketData.ts`, `lib/marketDataApi.ts`, `lib/marketDataStorage.ts`, `hooks/useMarketResource.ts` | Normalisers, freshness, fund returns, screener, last-good cache with "as of" time |
| `lib/forecast.ts`, `lib/lifeGoals.ts`, `lib/growthSim.ts`, `lib/couple.ts`, `lib/benchmark.ts`, `lib/financialCalendar.ts` (+ `*Storage.ts`) | The planners: `js/finos-forecast.js` (600 ledgers), `js/finos-life-goals.js` (1,500 households, roadmap text word for word), the growth page (150 inputs), couple sums (server's 15% rule pinned by a test that reads the Python source), rule-of-thumb benchmarks, own dates and .ics export. Couple data sits under `finos_sync_never_couple_v1` so tracker sync never uploads it |
| `lib/diagnostics.ts`, `lib/feedback.ts`, `lib/usage.ts`, `lib/consents.ts`, `lib/redact.ts`, `components/ErrorBoundary.tsx` | On-device redacted crash notes, feedback and opt-in screen counts. `redact.ts` extends the website's `FinosFeedback.redact` (parity-tested) with UPI handles, spaced digits, other-script digits and amounts in words. Nothing is sent without the person's explicit share |
| `lib/onboarding.ts`, `lib/permissions.ts`, `lib/permissionPrompt.ts` | First-run tour state machine; the explain-first copy shown before the OS asks for notifications or biometrics |
| `lib/eraseDeps.ts`, `lib/dataControls.ts`, `lib/tempFiles.ts`, `lib/storageKeys.ts`, `lib/secureSession.ts`, `lib/googleAuth.ts` | One erase flow (signs out first, resets in-memory stores, cancels notifications, deletes cache files, secure storage, then checks for leftovers); the device-only key registry and cache-file patterns (`finos-backup-*.json`, picker copies, `finos-calendar-*.ics`); the sign-in session encrypted under a secure-storage key; Google sign-in via Supabase OAuth (hidden unless `EXPO_PUBLIC_GOOGLE_SIGNIN=1`, never run against a real project) |
| `scripts/smoke-routes.py` | Opens every screen in the Expo web preview, empty and populated, dark and light, and fails on runtime errors, React warnings, empty screens, or NaN / undefined / Infinity on screen. Found nested buttons on Portfolio (invalid on web, bad for screen readers) |
| `lib/nudges.ts`, `lib/nudgesStorage.ts`, `components/Nudges.tsx` | "Worth a look" on Home: up to three dismissible (7 days) prompts raised only from recorded facts: top category over 35% of income, savings rate under 10%, subscriptions over ₹2,000 a month, things due this week with reminders off, Money Score under 60 or not taken, no SIP, DNA quiz not taken. Unknown data never raises a nudge |
| `lib/windfall.ts`, `lib/windfallStorage.ts` | The allocation waterfall of `js/finos-windfall.js` with its inputs passed in, plus the bonus tax impact via `taxcore`. Parity-tested on 1,000 households. Differences: an unknown monthly spend is flagged, property tax note follows the July 2024 rules |
| `lib/taxPlanner.ts`, `lib/taxPlannerStorage.ts` | `js/finos-tax-calc.js` sliced unchanged (constants through `compute()`); storage writes the website's `finos_tax_*` / `finos_80c_*` keys. Parity-tested on 1,500 taxpayers and checked against `taxcore` up to ₹50L |
| `lib/taxSavings.ts` | The Tax Savings Tracker's sections (80C, 80D, 80CCD(1B) core; HRA and 24(b) conditional; 80E uncapped), the verdict wording, and the `finos_tax_savings` record the rest of FIN-OS reads. `savingsPlan` itself is in `lib/taxcore.ts`, parity-tested on 2,000 random cases |
| `lib/creditScore.ts`, `lib/creditScoreData.ts`, `lib/creditScoreStorage.ts` | The rules of `js/finos-credit-score.js` (band, health, implied rate, tips); the wording tables are generated from the website file. Parity-tested |
| `lib/crypto.ts`, `lib/cryptoStorage.ts` | Port of `summarize()` in `js/finos-crypto-tracker.js`: coins without a price are listed, not valued at zero; tax per coin's gain only. Parity-tested |
| `lib/holdingsImport.ts`, `lib/holdingsImportPlan.ts` | The broker-CSV parser sliced unchanged from `js/finos-import.js` (parity-tested on 700 random files) and the planner that maps rows onto Portfolio holdings (`importHoldings` in the store). The CAS-PDF path needs the document-ai backend and is not built |
| `lib/aryaGuardrails.ts` | `js/arya-guardrails.js` sliced unchanged: refusal rule, flags (direct recommendation, guaranteed returns, price prediction, advice requested) and the appended notes. Parity-tested on every user × reply pair of a 400+ corpus |
| `lib/calendar.ts`, `lib/calendarStorage.ts` | Port of `js/finos-calendar.js` + `js/finos-taxdates.js`; data and the clock are parameters. Differences: deposit maturity dates come from `fixedIncome.ts` (the website guessed 12 months for Sukanya, bonds, post-office deposits) and the Portfolio tab's monthly SIPs are included. Parity-tested on 150 random households with a frozen clock. Since Oct 15 2026 `Sources.custom` carries the person's own dates (`financialCalendar.ts`, type `custom`, "Your date"): they sit on the grid, in the coming-up list and in reminders, with the website's output unchanged when there are none (they are not in the parity comparison because the website has no such event) |
| `lib/gold.ts`, `lib/goldStorage.ts` | Port of the calculation half of `js/finos-gold-tracker.js`; grams are valued only at a price you type (no assumed MCX rate). Parity-tested on 400 portfolios |
| `lib/salary.ts`, `lib/salaryStorage.ts` | Port of the calculation half of `js/finos-salary-optimizer.js` (HRA 10(13A) minimum, both regimes via `taxcore`, PF, take-home, tips); same `finos_salary_*` keys. Parity-tested on 1,500 salaries and 300 tip lists. Divergence: opening the screen never writes `finos_monthly_income` |
| `lib/sipStepup.ts`, `lib/sipStepupStorage.ts` | Port of the calculation half of `js/finos-sip-stepup.js` (month-end instalments, same clamps), `finos_ss_*` inputs, three result keys. Parity-tested on 1,500 inputs incl. out-of-range |
| `lib/homeLoan.ts`, `lib/homeLoanStorage.ts` | Port of the calculation half of `js/finos-home-loan.js` (EMI, schedule, affordability, 24(b)/80C, prepayment). `finos_hl_*` inputs; EMI / balance / rate keys are written only on "Save as my home loan". The website's PMAY-CLSS banner is not ported (its income bands belong to an ended scheme). Parity-tested on 1,200 loans |
| `lib/debt.ts`, `lib/debtStorage.ts` | Port of the calculation half of `js/finos-debt-optimizer.js` (EMI, months left, payoff simulation for both strategies, home-loan prepayment, `plan()`); storage reads the website's balance / rate / EMI keys and writes the three result keys. Parity-tested on 600 random loan sets |
| `lib/leak.ts`, `lib/leakStorage.ts` | Port of the pure half of `js/finos-leak.js`: expense rows only, the larger of tracked and logged subscriptions (never the sum), future value at 8–14%. Parity-tested on 800 random ledgers |
| `lib/fixedIncome.ts`, `lib/fixedIncomeStorage.ts` | Port of the calculation half of `js/finos-fd-tracker.js` with the clock passed in; same `finos_fd_portfolio` shape, so a deposit added on either side shows on the other after a sync. RD at 0% is guarded (the website divided 0 by 0). Parity-tested on 1,500 random entries |
| `lib/quicklog.ts` | Quick-log chips: most-repeated entries by kind/category/label; "repeat last" first |
| `lib/recurring.ts` | Monthly schedule: month-end clamp, no back-fill before start, 24-month catch-up cap, deterministic ids `rec_<item>_<YYYY-MM>` |
| `lib/holdings.ts` | Holding model, remote mapping, `planSync` (pure last-write-wins merge with tombstones) |
| `lib/holdingsStore.ts` | Shared holdings store, price refresh, debounced cloud sync |
| `lib/trackerStorage.ts`, `txnStorage.ts`, `recurringStorage.ts`, `subscriptionsStorage.ts` | AsyncStorage I/O (serialised read-modify-write) |
| `lib/supabase.ts` | Client factory, friendly auth error messages |

### Storage keys
All `finos_*` in AsyncStorage. Keys shared with the website (so both apps read the same shape):
`finos_user_name`, `finos_monthly_income`, `finos_monthly_expense`, `finos_transactions`, `finos_budgets`,
`finos_goals`, `finos_emergency_*`, `finos_epf_*`, `finos_nps_*`, `finos_ppf_portfolio`, `finos_insurance_policies`,
`finos_subscriptions` (+ `_monthly` / `_annual` totals), `finos_fd_portfolio` (+ derived totals), `finos_tax_savings`, `finos_leak_monthly` / `_future_20y` / `_synced_at`, `finos_debt_*` / `finos_*_loan_rate` / `finos_*_loan_emi`, `finos_salary_*`, `finos_ss_*` (+ three result keys), `finos_hl_*`, `finos_money_score` + `finos_money_score_history`, `finos_80c_used`, `finos_sip_total`, `finos_health_score`, asset/liability keys (`finos_*_value`, `finos_*_loan`).

Mobile-only keys: `finos_prepay_inputs_v1`, `finos_offers_inputs_v1`, `finos_leak_inputs_v1`, `finos_hl_income_v1`, `finos_tax_savings_inputs_v1`, `finos_host_ip`, `finos_holdings_v1`, `finos_holdings_tombstones_v1`, `finos_holdings_owner`,
`finos_holdings_last_sync`, `finos_recurring_v1`.
Added Oct 2026 (all `finos_` unless noted; the notice lists the data ones in `lib/privacy.ts`): `finos_learn_opened`, `finos_session_arya_memory_v1` / `_prefs_v1` / `_life_v1` (never synced), `finos_insurance_checks_v1`, `finos_funds_recent_v1`, `finos_funds_compare_v1`, `finos_sync_never_couple_v1` (never synced), `finos_calendar_custom_events`, `finos_life_goals_planner_v1`, `finos_growth_sim_v1`, `finos_life_goals_feasibility`, `finos_feedback_log`, `finos_diag_crashes`, `finos_usage`, `finos_consents`, `finos_onboarding_mobile`, `finos_alerts_state`, `finos_applock_*`; and outside the prefix, `marketcache_v1:*` and `marketcache_v1_index` (last market answers: not exported, not backed up, erased with everything). Several of these (`finos_insurance_checks_v1`, `finos_funds_*`, `finos_learn_opened`, `finos_pulse_snapshot`) are ordinary tracker keys and sync like the rest when signed in; the data inventory in Privacy says which ones do.

Writers are careful not to damage website records: transaction edits/deletes go by raw index so records in other
shapes (website or bank-sync) are untouched. The app's only changes to web-shaped records are an extra `cat` field
on transactions and an `id` (`idx_N`) on insurance policies.

### Cloud sync (holdings only)
- Syncs the existing `holdings` table (`equity`, `mutual_fund`, `elss` rows). Website rows for gold / F&O are never read or modified.
- Merge is per-row last-write-wins using `updated_at`; deletes are tombstones.
- `finos_holdings_owner` records which account the local data belongs to, so signing in as another account never merges data.
- Schema: [`supabase/holdings.sql`](../supabase/holdings.sql) (additive, RLS on).

### Tracker sync (budget, goals, subscriptions, EPF/NPS/PPF, insurance…)
The app and the website share every `finos_*` tracker key through one JSONB blob per user in `tracker_snapshot`
([`supabase/tracker_snapshot.sql`](../supabase/tracker_snapshot.sql)). Both sides run the **same three-way merge** (`lib/trackerSync.ts` here,
`js/finos-tracker-sync.js` on the website), remembering the value each key had at the last sync:

| Situation | Result |
|---|---|
| Only this device changed a key | pushed |
| Only the other device changed it | pulled |
| Key exists on one side only | copied across — a missing key is **never** treated as a deletion |
| Both changed an array of records with ids (transactions, goals, subscriptions…) | merged by id, deletes included |
| Both changed anything else | the cloud copy wins; the displaced local value is logged (Settings shows which keys) |

- **When it runs:** at app start, after sign-in, every 30 s while the app is open, when it goes to the background, and from Settings → *Sync now*.
- **Concurrency:** writes are compare-and-set on `updated_at`; if another device wrote in between, the run retries from the fresh row.
- **Never synced:** `finos_session_*` (Arya memory, switches, life events), `finos_sync_never_couple_v1`, the app-lock items, the encrypted vault and its metadata, consent records, feedback and usage logs, language/session flags, mobile-only device
  settings (host override, holdings store, recurring entries, tool inputs) and totals each device recomputes (net worth, health score, NPS/PPF/EPF projections).
- **Another account on the same device:** this user's cloud copy replaces the local tracker data instead of merging.
- **Website change (v2):** `js/finos-tracker-sync.js` previously only filled in missing keys and re-uploaded its whole snapshot every 20 s, so a change
  made on another device never reached a key the website already had, and mobile-only keys were erased. v2 keeps the blob format, so v1 clients keep working.
  v1 also uploaded the encrypted vault, consents and feedback log; v2 no longer does (values already in the cloud are left untouched).
- **Settings → Clear All Local Data** removes this device's copy only; the next sync restores it from the cloud.

### Bank statement import
`app/tracker/import.tsx` takes a bank CSV (file picker via `expo-document-picker`, or pasted text) or Account Aggregator JSON, shows a preview — row count, money in/out, date range, balance check, where the money went, skipped rows with reasons, how many are already in the list — and only then saves. Imported rows use the website's ledger shape (`src:'import'`, `batch`), so the website reads them and tracker sync carries them across. Each import is listed under *Past imports* with one-tap **Undo**. Nothing is uploaded; there is no network call in the importer.

Categorising (same as the website): payment-app names are stripped first so "PhonePe" is not a phone bill; money sent to a broker or fund house (Zerodha, Groww, Kuvera …) is filed as *Savings & Investments*, not spending; insurance premiums stay as an ordinary expense. Only savings/current-account transactions are read from AA JSON. If the website's importer changes, regenerate `lib/statementImport.ts` — the parity test fails until you do.

### Deliberate divergences from the website
| Area | Website | App | Why |
| --- | --- | --- | --- |
| Net worth | `finos-net-worth.js` omits EPF/NPS/PPF | Includes them | Website's own `finos-context.js` already includes them — web is inconsistent |
| Health score | Savings / Wealth pillars can go negative | Floored at 0 | Web bug (not yet fixed on the web) |
| Emergency-fund pillar | — | Gets +1/+2 insurance bonus | Matches web rules, parity-tested |
| Learning modules pillar | Counts completed modules (the website's read of `finos_learned_modules` was fixed in the working tree on Oct 15 2026, uncommitted, so it counts the object `learn-ai.js` writes; before that it counted only a list) | Same rule from lessons marked learned on the phone: `min(6, floor(count x 0.43))` plus streak points, cap 10. Golden-tested against the website file | The phone's lessons are the website's own, with progress in the same key. (The DNA quiz is in the app too: Behaviour uses its Discipline score, neutral 8/15 until it is taken) |
| NPS tax saved | Counts first ₹1.5 L as 80C | Same, labelled "upper estimate" | Web's own approximation |
| UAN / PRAN | — | Never stored | Deliberate privacy choice |

## 5. Known gaps

1. **Cloud tables not created yet; real sign-in untested.** The project in `js/auth.js` (`oeapcyucnduhwpgxfknb.supabase.co`) is reachable again and
   `mobile/.env` (git-ignored) now points at it, but on Oct 11 `public.holdings` and `public.tracker_snapshot` did not exist. Run
   `supabase/profiles_rls.sql`, `core_tables.sql`, `holdings.sql` and `tracker_snapshot.sql` in that order in the Supabase SQL editor, then sign in. `arya-ai/.env`'s `SUPABASE_ANON_KEY` was truncated (39 chars); it now holds the full key — restart the Arya backend to pick it up. Login, holdings sync and tracker sync were verified only against a local mock (GoTrue + PostgREST stand-in) and, for the sync
   adapter, a PostgREST-rules test server. The email-confirmation sign-up path is untested in the UI. On Oct 11 the `profiles` table was readable without signing in (row-level security off); `profiles_rls.sql` fixes it and still has to be run.
2. **Not available:** FII/DII flows (no data source; the earlier hard-coded numbers were removed) and Account Aggregator (no live provider integration; the website's AA module is switched off for the same reason).
3. **No device build yet:** `eas.json` is in place (development / preview / production profiles) but no build has been run and no Apple/Google credentials are set up; only web/Expo Go preview has been used.
4. **Tests.** `npm test` (Node's built-in runner, 676 tests, `@/` alias resolved by `__tests__/alias-hooks.mjs`): subscriptions, tax core, prepay and offer comparer vs the website with random inputs; budget maths vs `js/finos-budget.js`; holdings sync, recurring schedule, EPF/NPS/insurance/health rules; tracker-sync merge and its Supabase adapter; the statement importer vs the website on 700 random statements; the Money Score vs the website on 1,500 random inputs; Retirement vs the seeded engine on 40 configs; the Tax Savings plan on 2,000 cases; Future Loss on 800 ledgers; fixed-income entries on 1,500; debt payoff on 600 loan sets; salary on 1,500 and step-up on 1,500 inputs; home loan on 1,200 loans; gold on 400 portfolios; the calendar on 150 households; holdings files on 700; Arya guardrails on 400+ pairs; the Tax Planner on 1,500 taxpayers; windfall allocation on 1,000 households; transaction and score storage (import, dedupe, undo, save shape) against an in-memory AsyncStorage stub. Added Oct 2026: forecast, life goals, growth, couple, benchmark, calendar extras, PULSE ranking (600 contexts), Arya tools / memory / context / figure guardrails, learn progress and Knowledge pillar, insurance hub and funds (incl. parity with `js/mf-intelligence.js`), market data and cache, redaction and feedback parity, onboarding, erase, storage-key and privacy guards, search index vs the lesson manifest, the Hindi table against the website's lookup. Not covered: the React screens themselves (the route smoke script exercises them), and EPF/NPS/PPF are checked against hand-derived values rather than the website's code (those web modules aren't importable). The earlier budget, health-score, EPF/NPS/PPF and sync checks were throwaway scripts and still need to be moved into `__tests__/` (the `@/` import alias needs a small loader first).
5. **`constants/endpoints.ts` port map is mostly unused.** Only `aryaAI` is called. The stock-engine / alert-engine ports were swapped relative to `docker-compose.yml`; fixed Oct 4 2026 (stock 8003, alert 8001).
6. **Kite holdings** not wired (`KITE_API_KEY` unset).
7. **Permissions.** `app.json` asks for `INTERNET`, `POST_NOTIFICATIONS` (local reminders, off until the person turns them on; no push token is ever requested and a guard test enforces it) and `USE_BIOMETRIC` (app lock). The libraries' own manifests also add `USE_FINGERPRINT`, `VIBRATE` and `RECEIVE_BOOT_COMPLETED` (so reminders survive a restart); the privacy notice names all of them and `__tests__/privacy.test.mts` reads the library manifests to keep it true. `RECORD_AUDIO`, storage and overlay permissions are blocked explicitly, `allowBackup` is false (no Android auto-backup to Google Drive; the encrypted backup is the way to move phones), and the unused `expo-av` dependency was removed Oct 15 2026. Add microphone or camera back only when a voice or QR feature ships.
8. Only part of the website's 29 Command Hub trackers is ported: net worth/FIRE, budget + transactions + recurring, emergency fund, goals, health score, EPF, NPS, PPF, insurance, subscriptions, fixed income (FD/RD/NSC/SCSS/…), debt payoff, tax savings, future loss, salary structure, SIP step-up, home loan, gold, financial calendar, broker holdings import, Arya guardrails. The live to-do list is `docs/MOBILE_PARITY_TRACKER.xlsx`.

## 6. Verification

Committed: `npm test` — subscriptions port vs `js/finos-subscriptions.js` (600 random records, 150 random portfolios, renewal edge cases); tax core vs `js/finos-taxcore.js` (3,000 incomes incl. the ₹12L rebate edge); prepay-vs-invest vs `js/finos-prepay-invest.js` (400 scenarios + golden values); offer comparer vs `js/finos-offer-compare.js` (300 offers, 150 comparisons); and `npm run typecheck`. Modules that import each other use explicit `.ts` extensions (`allowImportingTsExtensions`) so Node can run them.

Run during the Oct 2026 build (throwaway scripts, not in the repo):
- Health score vs. web's real `_computeLocalScore`: 300 random scenarios identical.
- `lib/budget.ts` vs. the real `js/finos-budget.js`: 4,000 random raw records + 200 budget/suggest scenarios identical; auto-category 19/19.
- EPF / NPS / PPF vs. extracted web functions: 400 / 400 / 300 scenarios identical.
- `planSync` unit checks; login + sync against a local Supabase mock.

When changing any ported formula, re-run a parity check against the website file rather than editing in isolation.

## 7. Backend changes made for the app (`arya-ai`)
- Added `POST /api/chat` (SSE) that accepts profile context.
- `/api/portfolio/summary|export` forward the user's token so RLS doesn't hide rows.
- `data/market.py`: AMFI `NAVAll.txt` gained Plan/Option columns and the parser silently returned nothing; it now parses by header name and results include `plan` / `option`.

## 8. Next steps
1. Provision a live Supabase project; test real login and sync.
2. Move the remaining parity scripts into `mobile/__tests__` (needs an `@/` alias loader).
3. Run an EAS device build (profiles exist in `eas.json`).
4. Work down `docs/MOBILE_PARITY_TRACKER.xlsx` (Build order sheet): CAS-PDF import; wire Kite holdings.
