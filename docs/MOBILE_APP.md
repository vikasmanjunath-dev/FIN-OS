# FIN·OS Mobile App (Expo)

React Native companion to the FIN·OS website. Lives in [`mobile/`](../mobile). It reuses the website's
`finos_*` storage keys and formulas, so data and numbers match between the two.

> **Status (Oct 11 2026):** runs end-to-end against the local `arya-ai` backend. Cloud login, holdings sync and
> tracker sync are built and tested against the website's own code and a local mock Supabase, but have **never
> run against the real project** (it is reachable again, but the `holdings` and `tracker_snapshot` tables had not been
> created when last checked). No iOS/Android build has been produced — see [Known gaps](#known-gaps).

---

## 1. Stack

| Layer | Choice |
| --- | --- |
| Framework | Expo SDK 53, React Native 0.79 (new architecture on), React 19 |
| Navigation | expo-router 5 (file-based, typed routes) |
| Storage | `@react-native-async-storage/async-storage` |
| Cloud | `@supabase/supabase-js` (optional — null client = guest mode) |
| UI | Dark theme only, `constants/theme.ts`; `expo-linear-gradient`, `expo-haptics`, `react-native-svg` |
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
| Dashboard tab | `app/(tabs)/dashboard.tsx` | Net worth, portfolio, SIP, spent-this-month strip, over-budget alert, quick-log chips, tappable tracker cards, "next best step", Retirement & Protection, Recurring Costs and Money Tools tiles | On-device trackers + holdings |
| Markets tab | `markets.tsx` | NIFTY 50 / SENSEX / NIFTY IT / NIFTY BANK (every 30 s) and 8 NSE sector indices (every 60 s) | Live: `GET :7475/api/market/overview` and `/api/market/sectors`. When the backend is unreachable the screen says so — no invented prices. (Needs a restarted backend for the sectors route.) |
| Arya tab | `arya.tsx` | Streaming chat, sends the user's profile context | Live: `POST :7475/api/chat` (SSE) |
| Track tab | `track.tsx` | Income vs spend, savings note, and the two ways to get transactions in: log them, or **import a bank statement** (opens `tracker/import`) | On-device. Account Aggregator is **not** offered — there is no live integration to connect |
| Portfolio tab | `portfolio.tsx` | Holdings (stocks, mutual funds, ELSS), SIP tab, computed insights, add/remove | Live prices: `/api/quotes`, `/api/quote/`, AMFI NAV via `/api/mf/search`, `/api/mf/nav/` |
| Privacy & your data (modal) | `privacy.tsx` | What is on the phone (live counts), every flow that can leave it (sign-in/sync, your own Arya backend, files, share sheet), what the app never does, permissions asked, and your controls: export, delete everything on the phone, delete the cloud copy, delete the account | On-device; cloud deletes need a signed-in session |
| Terms of use (modal) | `terms.tsx` | Port of the website's terms — a draft for legal review; operator, liability and law are left blank on purpose | Static |
| Settings (modal) | `settings.tsx` | Name, income, backend host, account & sync, clear data | AsyncStorage |
| Login (modal) | `login.tsx` | Supabase email/password sign in / sign up | Supabase |
| Tool screens | `app/tools/{retirement,score,prepay,offers}.tsx` | **Retirement planner** (projected corpus by source vs the 25× need, monthly income then, Monte Carlo odds over 4,000 futures, fan chart, "what monthly SIP gets me to 85%") · **Money Score** (60-second check: 0–100 over six pillars, why, three ranked next moves with +points, what-if steppers, share, prefilled from what you track) · **Prepay loan or invest?** (month-by-month simulation, winner, break-even return, net-position chart) and **Job offer comparer** (up to 3 offers: monthly in-hand, regime, 5-year total value). Inputs recompute live and are remembered on the device | On-device only (`finos_prepay_inputs_v1`, `finos_offers_inputs_v1`) |
| Tracker screens | `app/tracker/*.tsx` | `networth`, `budget`, `transactions`, `recurring`, `emergency`, `goals`, `health`, `epf`, `nps`, `ppf`, `insurance`, `subscriptions`, `import` | AsyncStorage |

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
`finos_subscriptions` (+ `_monthly` / `_annual` totals), `finos_money_score` + `finos_money_score_history`, `finos_80c_used`, `finos_sip_total`, `finos_health_score`, asset/liability keys (`finos_*_value`, `finos_*_loan`).

Mobile-only keys: `finos_prepay_inputs_v1`, `finos_offers_inputs_v1`, `finos_host_ip`, `finos_holdings_v1`, `finos_holdings_tombstones_v1`, `finos_holdings_owner`,
`finos_holdings_last_sync`, `finos_recurring_v1`.

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
- **Never synced:** the encrypted vault and its metadata, consent records, feedback and usage logs, language/session flags, mobile-only device
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
| DNA quiz / learning pillars | Real | Neutral default / 0, labelled "Not recorded in the app yet" | Quiz and modules aren't in the app |
| NPS tax saved | Counts first ₹1.5 L as 80C | Same, labelled "upper estimate" | Web's own approximation |
| UAN / PRAN | — | Never stored | Deliberate privacy choice |

## 5. Known gaps

1. **Cloud tables not created yet; real sign-in untested.** The project in `js/auth.js` (`oeapcyucnduhwpgxfknb.supabase.co`) is reachable again and
   `mobile/.env` (git-ignored) now points at it, but on Oct 11 `public.holdings` and `public.tracker_snapshot` did not exist. Run
   `supabase/profiles_rls.sql`, `core_tables.sql`, `holdings.sql` and `tracker_snapshot.sql` in that order in the Supabase SQL editor, then sign in. `arya-ai/.env`'s `SUPABASE_ANON_KEY` was truncated (39 chars); it now holds the full key — restart the Arya backend to pick it up. Login, holdings sync and tracker sync were verified only against a local mock (GoTrue + PostgREST stand-in) and, for the sync
   adapter, a PostgREST-rules test server. The email-confirmation sign-up path is untested in the UI. On Oct 11 the `profiles` table was readable without signing in (row-level security off); `profiles_rls.sql` fixes it and still has to be run.
2. **Not available:** FII/DII flows (no data source; the earlier hard-coded numbers were removed) and Account Aggregator (no live provider integration; the website's AA module is switched off for the same reason).
3. **No device build yet:** `eas.json` is in place (development / preview / production profiles) but no build has been run and no Apple/Google credentials are set up; only web/Expo Go preview has been used.
4. **Tests.** `npm test` (Node's built-in runner, 68 tests, `@/` alias resolved by `__tests__/alias-hooks.mjs`): subscriptions, tax core, prepay and offer comparer vs the website with random inputs; budget maths vs `js/finos-budget.js`; holdings sync, recurring schedule, EPF/NPS/insurance/health rules; tracker-sync merge and its Supabase adapter; the statement importer vs the website on 700 random statements; the Money Score vs the website on 1,500 random inputs; transaction and score storage (import, dedupe, undo, save shape) against an in-memory AsyncStorage stub. Not covered: the React screens themselves, and EPF/NPS/PPF are checked against hand-derived values rather than the website's code (those web modules aren't importable). The earlier budget, health-score, EPF/NPS/PPF and sync checks were throwaway scripts and still need to be moved into `__tests__/` (the `@/` import alias needs a small loader first).
5. **`constants/endpoints.ts` port map is mostly unused.** Only `aryaAI` is called. The stock-engine / alert-engine ports were swapped relative to `docker-compose.yml`; fixed Oct 4 2026 (stock 8003, alert 8001).
6. **Kite holdings** not wired (`KITE_API_KEY` unset).
7. Permissions for microphone, camera and speech are declared in `app.json`, but no voice or QR feature is built yet.
8. Only part of the website's 29 Command Hub trackers is ported: net worth/FIRE, budget + transactions + recurring, emergency fund, goals, health score, EPF, NPS, PPF, insurance, subscriptions.

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
4. Port the web's Tax Savings Tracker (`FinosTaxCore.savingsPlan`), Future Loss, and the remaining trackers (FD, gold, crypto, credit score, debt optimizer); wire Kite holdings.
