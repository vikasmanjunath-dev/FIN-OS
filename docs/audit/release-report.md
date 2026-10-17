# Track Finances audit release evidence

Date: 2026-10-17
Branch: `audit/track-finances-production`
Scope: website Track Finances hub and linked tracker pages, mobile tracker routes, and shared tracker storage, calculations, imports, and cloud sync.

This is a verification report for the changes made in this audit. Automated checks are complete and green except one load-sensitive browser test (see the final table); it is not a full production sign-off because real-device testing, a hosted Supabase project and deployed-host checks were not possible here (see the limitations list).

## Critical issues fixed

- Removed misleading fake live market prices from the legacy tracker; the displayed figures are identified as samples and no longer randomly change.
- Removed the production-facing `localhost:5173` Expense Engine probe and replaced it with a local-only notice.
- Prevented unreadable tracker sync ownership metadata from being interpreted as a first sync. Both web and mobile now pause before exchanging account data when the owner identity cannot be trusted.
- Surfaced tracker storage read/write failures instead of displaying empty defaults or reporting unsaved writes as successful.
- Corrected no-data FIRE and Emergency Fund calculations, including expense source precedence, invalid amounts, unsupported targets, and web/mobile parity.
- Corrected mobile money input parsing and bounded numeric input so malformed values are rejected instead of silently converted or clamped.
- Corrected shared web/mobile transaction normalization so malformed imported currency strings and impossible calendar days are rejected instead of silently changing budget totals.
- Hardened monthly spend aggregation against poisoned normalized rows and runtime-invalid budget limits; invalid amounts, dates, categories and limits can no longer leak `NaN`, prototype-backed categories or string totals into budget UI data.
- Hardened retirement planner persisted-input parsing on web, mobile, and Arya's readiness gate: malformed, infinite, negative, out-of-range age, and impossible DOB values no longer enter retirement corpus or Monte Carlo calculations.
- Fixed goal amount validation and deadline semantics: the current target month remains available, exact overdue dates are identified, impossible dates do not become valid deadlines, and web/mobile goal optimizer monthly horizons agree.
- Corrected Trade Journal signed-loss display, zero exit/blank quantity handling, edit preservation, Monday week boundaries, CSV charge/zero export, and supported broker-fill pairing/preview behavior.
- Bounded the mobile transaction history's initial render to 50 rows and added incremental loading.
- Corrected insurance renewal-day calculations to use validated calendar dates, rejected partial numeric insurance inputs, bounded stored policy amounts, and fixed the web premium calendar's annual total so undated policies are included and explained. Refreshed line-verified insurance content sources after the web markup moved.

## Verification completed

- Root Node regression: latest `node --test tests/*.test.js` — **518 passed, 0 failed** (`# tests 518`, `# pass 518`, `# fail 0`), including the new web insurance renewal/calendar regressions.
- Root static validation: `npm run check` — passed; tokens, links, search, JS, IDs, routes, and secrets checks each reported `0 problem(s)`.
- Python tracker-adjacent security and health-income tests — **42 passed**. The full root Python suite was later run to completion; see the final sign-off table.
- Focused web tracker hub, net-worth golden, and sync regressions — passed; latest root Node run includes the final sync ownership regression.
- Focused mobile parity suite — **26 passed, 0 failed** across Trade Journal, Emergency Fund, and transaction paging.
- Mobile storage-failure and corrupt-data suites — previously **174 passed**; included again in the final full suite.
- Prior full mobile Node 24 suite, serial worker execution with loopback access, before the latest parsing/date changes: **1,036 passed, 0 failed, 0 cancelled, 0 skipped, 0 TODO** (45.0s).
- Transfer budget parity — **3 passed**; explicit internal transfers are excluded from expense totals on both platforms, survive mobile storage round-trip, and a purchase memo alone does not change transaction kind.
- Latest budget regressions: web budget suite **13/13 passed**; dedicated mobile rollup parity **1/1 passed**; mobile shared logic **15/15 passed**, including malformed normalized records, runtime-invalid limits, strict imported amount parsing, Gregorian date validation/leap days and impossible ISO timestamp dates, with web/mobile parity. Mobile TypeScript check passed.
- Retirement verification: `retirement.parity.test.mts` plus input-safety regressions — **8/8 passed**, including web/mobile parity for 400 stored profiles, corrupted-value/DOB cases, age/spending readiness, and stale-output cleanup; mobile TypeScript check passed.
- NPS tracker verification: web/mobile age and projection parity **2/2 passed** for missing, impossible and future DOBs, valid DOB, month-end contributions, and invalid-allocation fallback; mobile tracker logic and TypeScript check passed.
- EPF verification: web **4/4** and mobile **3/3** focused regressions pass for missing/impossible/future/DOB-after-DOJ, leap day, bounded age/money, and clearing stale web projections. The app and website now use the recorded DOB rather than estimating birth from joining age.
- PPF verification: web maturity/tax regressions **3/3** plus the existing 80C suite pass; mobile maturity **2/2**. Tests cover 31 March vs 1 April financial-year boundaries, missing/invalid dates, and tax estimates after other recorded 80C usage.
- Insurance verification: web calendar/countdown regression **2/2** and mobile Insurance Hub suite **14/14**. Calendar-day boundaries, invalid/impossible dates, renewal month grouping, and inclusion of undated policies in the annual-premium total are covered. Mobile rupee entry now rejects malformed partial values.
- Goal verification: deadline/goal safety **4/4 passed**; goal optimizer parity **4/4 passed**, including 800 randomized goal sets; mobile TypeScript check passed.
- Net-worth/FIRE verification: web persisted-number regressions and shared golden cases **3/3 passed**; mobile malformed/out-of-range state and golden parity **2/2 passed**; mobile TypeScript check passed.
- Latest full mobile serial test on Node 24 with loopback enabled: **1,060 passed, 0 failed, 0 cancelled, 0 skipped, 0 TODO** (32.3s). Sandbox-only runs stalled because the Supabase mock test binds `127.0.0.1`.
- Mobile TypeScript: `PATH=/Users/vkm/.nvm/versions/node/v24.15.0/bin:$PATH npm run typecheck` — passed.
- Updated `/tracker/transactions` browser smoke — **1 screen × 4 states**, 0 problems after adding transfer entry and display support.
- Mobile Expo web export: `npx expo export --platform web` — passed, **115 static routes**, one **3.84 MB** web JS bundle after insurance tracker changes.
- Web browser theme smoke: **21 pages** loaded in dark/light and empty/populated states without detected page errors.
- Mobile tracker route smoke: all **20 tracker routes** loaded in empty/populated dark/light states without detected page errors.
- 375px responsive/touch audit: **21 pages**, 0 horizontal overflow, and no page had more than three undersized tap targets.

### Final sign-off run (2026-10-17, after the last code change)

| Command/check | Baseline | Final result |
|---|---|---|
| Root `node --test tests/*.test.js` | 501 pass in the first elevated run | **524 / 524 pass** (adds hub-copy and time-zone guards); also 520/520 under each of UTC, Asia/Kolkata, America/Los_Angeles, Pacific/Auckland, Pacific/Kiritimati before the two new guard files |
| Root Python suite (`pytest tests`, run per file, 6 in parallel, logs in `baseline/pytest-final/`) | Sandboxed: 4 failed, 320 passed, 470 fixture errors (could not bind a local server). A single serial run is very slow (browser tests; ~25 tests in 6 minutes) | **813 passed, 2 skipped, 1 failed** across 61 files. The 1 failure is `test_i18n_dom::test_switching_back_restores_english_exactly` (net-worth page body length 29494 vs 29547), which **passes 3/3 when run alone and passed in the earlier full run**; it is timing-sensitive under 6-way parallel browser load (see risks). An earlier per-file run had 1 real failure (`test_card_styles`), fixed under TRK-TEST-002 |
| Root `npm run check` | Pass | Pass: tokens, links, search, js, ids, routes, secrets all `0 problem(s)` |
| Root `npm run smoke` | Blocked (sandbox cannot bind a port) | **Pass: `430/430 page loads clean; 0 with problems.`** (every page in `html/` and `calculators/` plus root pages, dark and light) |
| Mobile `npm test` (Node 24) | Node 20 cannot run `.mts`; glob was quoted | **1,066 / 1,066 pass** (adds perf-budget and time-zone suites); also 1,063/1,063 in each of UTC, Asia/Kolkata, America/Los_Angeles, Pacific/Auckland, Pacific/Kiritimati |
| Mobile `npm run typecheck` | Pass | Pass |
| Mobile `npm run lint` | Could not run (ESLint not installed) | **Runs: 0 errors, 37 warnings** (was 130 errors once it could run; see TRK-LINT-001) |
| Mobile `npx expo export --platform web` | Pass | Pass; one JS bundle of 3,835,803 bytes (3.66 MiB), under the 4.5 MB budget |
| RLS (`tests/test_rls_tracker_snapshot.py`, local PostgreSQL 16) | not present | 6 / 6 pass |

### Audit-flag status

| Flag | Status | Evidence |
|---|---|---|
| 1. Legacy `tracker.html` random "live" values | **Confirmed, fixed** | Reachable from Markets, search and Arya routes. Now labelled sample data, no random updates; the Markets card and search entry no longer call it live or an expense tracker (TRK-WEB-001, TRK-WEB-003) |
| 2. Calculation parity web vs mobile | **Confirmed, fixed, enforced by tests** | Shared golden fixtures plus parity suites for every metric implemented on both platforms; invalid/huge-number cases; run in five time zones (TRK-MATH-*, TRK-RET-*, TRK-GOAL-001, TRK-TZ-001). Not consolidated into one module: web is plain browser JS and mobile is TypeScript with no shared build, so parity tests are the enforcement |
| 3. Mobile storage failures look like empty/success | **Confirmed, fixed** | TRK-MOB-001; 174 storage/corruption tests |
| 4. Sync, account switching, RLS | **Confirmed one S0, fixed; RLS verified locally** | TRK-SYNC-001 (unreadable owner metadata treated as first sync) fixed; RLS select/insert/update/delete proven on a local cluster (TRK-SYNC-002); mock-cloud integration 3/3, web sync 5/5, mobile sync parity 11/11 |
| 5. Expense Engine localhost link | **Confirmed, fixed** | TRK-WEB-002; no `localhost`/`127.0.0.1`/plain-`http` references remain in any page linked from the hub, and no linked page loads a third-party script without an integrity attribute (scan run at sign-off) |

### Time-zone coverage (new this pass)

Running the suites under `America/Los_Angeles` and `Pacific/Auckland` exposed TRK-TZ-001: date-only strings were read as UTC, so west of UTC the tax year of 1 April was FY 2025, fixed-income and post-office maturity dates were a day early, and the web SIP streak/month labels were wrong near month boundaries. Fixed on web and mobile and guarded by `tests/timezone.test.js` and `mobile/__tests__/timezone.test.mts`.

### Simulated-device pass (browser; no Xcode available)

Xcode could not be installed (macOS 26.5.2; current Xcode needs 26.6+), so the iOS Simulator was not used. In its place, the Expo web build was audited with `mobile/scripts/layout-audit.py` (all 20 tracker routes, empty and populated, dark theme) and an offline check (`mobile/scripts/offline-check.py`).

| Condition | Horizontal overflow | Clipped text | Under-44 px targets | Text overlap |
|---|---|---|---|---|
| 320 px, 200% text, before fixes | 9 | 11 empty / 26 populated | 36 / 38 | 12 / 23 |
| 320 px, 200% text, after fixes | **0** | **0** | 1 / 1 | **0 / 0** |
| 320 px, normal text, after fixes | **0** | **0** | 1 / 1 | **0** |
| 375 px, 150% text, after fixes | 0 | 0 | 1 / 1 | 0 |
| 390 px, normal text, after fixes | 0 | 0 | 1 / 1 | 0 |

Offline: with the network disabled, navigation across budget, transactions, net worth, goals, subscriptions, import and health rendered every screen with no page errors (7/7). See TRK-A11Y-001/002 for what was changed. TRK-A11Y-003 lists calculator screens outside Track Finances that still clip at 200%. The app caps text at 200% by design, so 300% was not targeted.

## Portfolio.AI market-data errors and page audit (follow-up pass)

Reported symptom: restarting the dashboard showed 502/429 errors from market-data requests. Cause found on both sides (TRK-MKT-001, TRK-MKT-002): the local backend re-fetched everything per symbol each minute and retried dead symbols forever, and the browser sent dozens of requests to free public CORS proxies with no memory of failures. Evidence is reproducible with `python3 tests/portfolio_profile.py [--fail-proxies]`.

| Measure (80 equities + 25 funds unless noted) | Before | After |
|---|---|---|
| Third-party provider requests in 70 s with proxies answering 429/502 | 117 (29 per proxy) | 3 (one-time page-load probes) |
| Third-party requests in 25 s, healthy | 29 proxy requests | 1 |
| Backend `/bulk` repeat call, 16 symbols | 4-8 s, dead symbols re-fetched each time | 0.01-0.7 s, 0 upstream requests inside the cache window |
| Backend upstream requests per 60 s refresh | ~8 per symbol | ~1 per symbol (none to Screener) |
| `buildAll()` | 66 ms (117 ms at 400 holdings) | 19 ms (34 ms) |
| DOM nodes after upload | 13.8k (37.9k at 400) | 3.9k (10.6k) |
| Charts created at load | 24 | 5 |
| JS heap | 30 MB | 17 MB |
| Supabase auth timers | 3 | 1 |
| Console errors on load | 2-3 (CORS to Yahoo; pre-existing ReferenceError and NotFoundError) | 0 |

Verified: rendered text of all 9 views (overview, equity, sectors, insights, tax, rebalance, analytics, ETF, MF) is identical between the eager and the lazy build except the new Sector Insights card; no leak across 10 rebuilds; a real `.xlsx` upload still works with the on-demand loader. Tests: `tests/test_portfolio_market_load.py` (13, stubbed providers), `tests/test_portfolio_page_load.py` (15, real browser); Python spot-suite after the change: calculator math 106, CSP 1, i18n 10, perf budget 1, static audit 7, backend 5 - all pass. Root `npm run check` 7/7 clean, Node 524/524, smoke on the portfolio pages clean.

Not done / limits: the Quant page's 12 history downloads still depend on the local backend or public proxies (now guarded, not replaced); while NSE blocks automated requests the 60 s refresh costs one Yahoo `fast_info` call per symbol (a batched quote endpoint would cut it further); live Yahoo/NSE behaviour was measured from this machine only, and NSE answered 403 to the server throughout, so the NSE path was verified with stubs, not against a working NSE session. `portfolio-analyser-v9.html` (legacy) was not changed.

## Closing pass: items previously left open

- **Calculator screens** (TRK-A11Y-003): fixed. All 23 `/tools` screens and 20 tracker screens audit clean for overflow, clipping and overlap at 200% text on a 320 px screen; no tap target under 44 px at 360 px and wider. Only the 7-column calendar grid below 360 px is below 44 px (TRK-A11Y-004, accepted).
- **Flaky `test_i18n_dom`** (TRK-TEST-003): the cause was a 2-second iframe preload in the voice widget changing the page length, not translation; the test now waits for the page to settle. Passes 5/5 including under load.
- **Lint** (TRK-LINT-002): `npm run lint` now covers every source folder with `--max-warnings 0` and reports 0 errors, 0 warnings (was 37 warnings in a partial scope, 76 in full scope).
- **Legacy v9** (TRK-LEGACY-001): forwards to v10; nothing links to it.
- **Final full run after these fixes:** root Python suite per file (logs in `baseline/pytest-final2/`): **842 passed, 2 skipped, 0 failed across 63 files**; root Node 525/525; `npm run check` 7/7; mobile 1,066/1,066 in UTC, Asia/Kolkata, America/Los_Angeles and Pacific/Auckland; typecheck and lint clean.

## Mobile app moved from Expo SDK 53 to SDK 57

So the current Expo Go from the store can open it (SDK 53 is too old for it). Now Expo 57.0.30, React Native 0.86.3, React 19.2.3, expo-router 57. The request said "SDK7"; Expo SDK 7 dates from 2018 and cannot run this app, so SDK 57 was assumed (confirm if another number was meant). Changes the upgrade needed: `StatusBar` no longer takes `backgroundColor`; `StyleSheet.absoluteFillObject` -> `absoluteFill`; `Buffer` referenced through `globalThis`; `newArchEnabled` and top-level `splash` removed from `app.json` (the splash plugin already sets it); the Reanimated babel plugin removed (babel-preset-expo adds it); `react-native-worklets` and `@types/react` 19.2 installed; the React Compiler readiness lint rules turned off with a stated reason because the compiler is not enabled. Checks after the upgrade: typecheck clean, lint 0 problems, mobile tests 1,066/1,066, web export (3.94 MB), Android and iOS bundles both compile (`expo export`), the dev server reports `sdkVersion 57.0.0`. Not run: the app on a real phone. Pre-upgrade `package.json`, lockfile and `app.json` are kept in `docs/audit/baseline/sdk-upgrade/` for rollback.

## Not verified / remaining limitations (honest list)

These need things this environment does not have; none is a known failing check.

- **Hosted Supabase.** RLS is proven on a throwaway local PostgreSQL with a stubbed `auth.uid()`, not on a real Supabase project (the project referenced by the app no longer resolves). Run `tests/test_rls_tracker_snapshot.py`-style checks plus a two-account manual pass once a project exists.
- **Real devices.** No iOS/Android simulator or physical-device run (Xcode needs macOS 26.6+; this Mac is 26.5.2). Large text, small screens and offline behaviour were simulated in the browser (see above). Screen readers (VoiceOver/TalkBack), real safe-area insets, cold start, memory and scroll frame rate are unmeasured. Only CI-measurable budgets are enforced (`perfBudget.test.mts`).
- **Deployed hosting.** Routes were crawled against a local static server (link check, smoke, CSP, perf-budget tests); the deployed host, base path and service-worker upgrade path were not exercised. Release step: run `npm run predeploy` so `sw.js` gets a new cache version, otherwise returning visitors keep the old `fd-tracker`, calendar, tax-date and SIP scripts changed in this audit.
- **Broker/bank files.** Statement and broker CSV import is verified for the formats in the repository's fixtures only.
- **Lint warnings.** 37 warnings remain (unused variables, `require()` imports, a few hook-dependency notes); none are in tracker money paths.
- **Commits.** Nothing was committed in this pass. The working tree already contained extensive unrelated changes before the audit, so the changes need a hunk-by-hunk commit.

## Baseline context

The initial sandboxed root `npm test` reported 4 failures, 320 passes, 6 skips, and 470 fixture errors, predominantly because tests could not bind a local server. A later permitted run passed the Node stage (501 tests) but the Python stage stalled and was interrupted. Raw baseline output is retained under [`baseline/`](baseline/).

The repository contained extensive pre-existing modifications before this audit. They were preserved; this report does not claim those unrelated changes were reviewed or production-ready.

The isolated Trade Journal fix is committed as `7d4bd95`, tracker ownership fail-closed sync as `44f6c78`, transaction transfer and paging fixes as `2aecc6c`, deterministic mock sync server teardown as `b8fcd2e`, and the inventory/findings/plan/release report as `86ec1a4` and `a477159`. Other code changes remain in the working tree because the repository was already extensively dirty and safe hunk-level separation is still required before making additional commits.
