# FIN·OS Mobile App (Expo)

React Native companion to the FIN·OS website. Lives in [`mobile/`](../mobile). It reuses the website's
`finos_*` storage keys and formulas, so data and numbers match between the two.

> **Status (Oct 3 2026):** runs end-to-end in guest mode against the local `arya-ai` backend. Cloud login and
> holdings sync are built but have **never run against a real Supabase project** (the project the website
> points to no longer resolves). No iOS/Android build has been produced — see [Known gaps](#known-gaps).

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
| Dashboard tab | `app/(tabs)/dashboard.tsx` | Net worth, portfolio, SIP, spent-this-month strip, over-budget alert, quick-log chips, tappable tracker cards, "next best step", Retirement & Protection tiles | On-device trackers + holdings |
| Markets tab | `markets.tsx` | NIFTY 50 / SENSEX / NIFTY IT / NIFTY BANK, refresh every 30 s | Live: `GET :7475/api/market/overview` (falls back to demo values). **Sector tiles and FII/DII flows are hard-coded mock.** |
| Arya tab | `arya.tsx` | Streaming chat, sends the user's profile context | Live: `POST :7475/api/chat` (SSE) |
| Track tab | `track.tsx` | Account Aggregator provider cards | **Placeholder** — Alert dialogs only, no AA integration |
| Portfolio tab | `portfolio.tsx` | Holdings (stocks, mutual funds, ELSS), SIP tab, computed insights, add/remove | Live prices: `/api/quotes`, `/api/quote/`, AMFI NAV via `/api/mf/search`, `/api/mf/nav/` |
| Settings (modal) | `settings.tsx` | Name, income, backend host, account & sync, clear data | AsyncStorage |
| Login (modal) | `login.tsx` | Supabase email/password sign in / sign up | Supabase |
| Tracker screens | `app/tracker/*.tsx` | `networth`, `budget`, `transactions`, `recurring`, `emergency`, `goals`, `health`, `epf`, `nps`, `ppf`, `insurance`, `subscriptions` | AsyncStorage |

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
| `lib/subscriptions.ts` | Port of `js/finos-subscriptions.js`: normalise, your-share cost, next renewal / occurrences (31 Jan → 28 Feb → 31 Mar), summary with overlap and low-value review. Parity-tested against the web file |
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
`finos_subscriptions` (+ `_monthly` / `_annual` totals), `finos_80c_used`, `finos_sip_total`, `finos_health_score`, asset/liability keys (`finos_*_value`, `finos_*_loan`).

Mobile-only keys: `finos_host_ip`, `finos_holdings_v1`, `finos_holdings_tombstones_v1`, `finos_holdings_owner`,
`finos_holdings_last_sync`, `finos_recurring_v1`.

Writers are careful not to damage website records: transaction edits/deletes go by raw index so records in other
shapes (website or bank-sync) are untouched. The app's only changes to web-shaped records are an extra `cat` field
on transactions and an `id` (`idx_N`) on insurance policies.

### Cloud sync (holdings only)
- Syncs the existing `holdings` table (`equity`, `mutual_fund`, `elss` rows). Website rows for gold / F&O are never read or modified.
- Merge is per-row last-write-wins using `updated_at`; deletes are tombstones.
- `finos_holdings_owner` records which account the local data belongs to, so signing in as another account never merges data.
- Schema: [`supabase/holdings.sql`](../supabase/holdings.sql) (additive, RLS on).
- Trackers (`finos_*`) are **not** synced from the app. The website's `tracker_snapshot` sync is not wired into mobile.

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

1. **Supabase project is dead.** The URL in `js/auth.js` and `arya-ai/.env` (`oeapcyucnduhwpgxfknb.supabase.co`) returns NXDOMAIN, and
   `arya-ai/.env`'s `SUPABASE_ANON_KEY` is truncated (39 chars). Login/sync were verified only against a local mock
   (GoTrue + PostgREST stand-in). To enable: create a project → put URL + anon key in `mobile/.env`, `js/auth.js`, `arya-ai/.env` →
   run `supabase/holdings.sql` (and `tracker_snapshot.sql` for the website). The email-confirmation sign-up path is untested in the UI.
2. **Placeholders:** Markets sector tiles and FII/DII flows; Track tab AA cards.
3. **No device build yet:** `eas.json` is in place (development / preview / production profiles) but no build has been run and no Apple/Google credentials are set up; only web/Expo Go preview has been used.
4. **Thin committed tests.** `npm test` (Node's built-in runner, no extra dependencies) runs `__tests__/subscriptions.parity.test.mts`, which checks the subscriptions port against the website with random inputs. The earlier budget, health-score, EPF/NPS/PPF and sync checks were throwaway scripts and still need to be moved into `__tests__/` (the `@/` import alias needs a small loader first).
5. **`constants/endpoints.ts` port map is mostly unused.** Only `aryaAI` is called. The stock-engine / alert-engine ports were swapped relative to `docker-compose.yml`; fixed Oct 4 2026 (stock 8003, alert 8001).
6. **Kite holdings** not wired (`KITE_API_KEY` unset).
7. Permissions for microphone, camera and speech are declared in `app.json`, but no voice or QR feature is built yet.
8. Only part of the website's 29 Command Hub trackers is ported: net worth/FIRE, budget + transactions + recurring, emergency fund, goals, health score, EPF, NPS, PPF, insurance, subscriptions.

## 6. Verification

Committed: `npm test` — subscriptions port vs `js/finos-subscriptions.js` (600 random records, 150 random portfolios, renewal edge cases) and `npm run typecheck`.

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
4. Port more web tools (Prepay-or-Invest, Job Offer Comparer); wire Kite holdings; replace Markets mock tiles.
