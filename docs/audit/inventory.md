# Track Finances audit inventory

Audit branch: `audit/track-finances-production`
Inventory status: Phase 1 initial mapping
Coverage status key: **partial** = at least one unit/UI test exists, not end-to-end audited; **none known** = no focused test located in the initial scan; **baseline pending** = browser/device execution is still pending.

## Website hub and linked routes

Entry page: `html/track-finances.html`. It contains the summary hub (net worth, health, savings rate, FIRE target, insights/nudges), tracker/tool cards, and document-import workflow. Shared browser data is largely stored as `finos_*` localStorage keys, with cloud snapshots in Supabase `tracker_snapshot` for authenticated sync. Per-page modules below are the initial owner candidates; confirm exact runtime imports and data ownership while testing each route.

| Hub card / route | Likely owner module or service | Coverage located in initial scan |
|---|---|---|
| Expense Engine (hub card marked local-only; no remote route is launched) | `_archive/ExpenseTracker/finos-budget` is a local development service; `track-finances.html` displays a noninteractive notice | Regression verifies no localhost anchor or runtime probe remains; hosted destination still requires a product decision |
| Calculator Suite `calculators.html` | page calculators and calculator modules | partial, broad calculator tests |
| Portfolio X-Ray `../Porfolio Analyser/portfolio-analyser-v10.html` | portfolio analyser | partial, portfolio tests exist |
| Trade Journal `../TradeJournal/index.html` | `TradeJournal/app.js`, `TradeJournal/upgrades.js`; mobile parity/import libraries | Web/mobile parity for signed P&L, CRUD, calendar boundary, export and supported broker CSV import; committed as `7d4bd95` |
| Net Worth Aggregator `net-worth.html` | `js/finos-net-worth.js` | partial; mobile logic/parity coverage exists |
| Portfolio Dissector `portfolio.html` | `js/portfolio.js`, portfolio data services | partial, portfolio suite |
| SIP & MF Tracker `mf-intelligence.html` | `js/finos-sip-tracker.js` and MF modules | partial |
| Portfolio Rebalancer `portfolio-rebalancer.html` | page module | none known |
| Fixed Income `fd-tracker.html` | `js/finos-fd-tracker.js` | partial (`tests/fd-tracker.test.js`) |
| Gold `gold-tracker.html` | `js/finos-gold-tracker.js` | partial (`tests/test_gold_tracker_ui.py`) |
| Crypto `crypto-tracker.html` | `js/finos-crypto-tracker.js` | partial (`tests/crypto-tracker.test.js`) |
| PPF & Small Savings `ppf-tracker.html` | `js/finos-ppf-tracker.js` | partial (`tests/ppf-80c.test.js`) |
| SIP Step-Up Planner `sip-stepup.html` | page-specific calculation module | none known |
| Real Estate Tools `real-estate.html` | page-specific calculation module | none known |
| EPF & PF `epf-tracker.html` | `js/finos-epf-tracker.js` | partial |
| NPS `nps-tracker.html` | `js/finos-nps-tracker.js` | partial (`tests/test_nps_tax.py`) |
| Retirement Planner `retirement-planner.html` | retirement calculation modules | partial |
| Salary Optimizer `salary-optimizer.html` | salary/tax modules | partial |
| ITR Filing Prep `itr-summary.html` | tax summary modules | partial |
| Tax Loss / Gain Harvesting `tax-harvest.html` | `js/finos-tax-harvest.js` | none known in initial scan |
| Debt Optimizer `debt-optimizer.html` | debt planner modules | partial |
| Credit Score `credit-score.html` | credit score modules | partial |
| Home Loan EMI Planner `home-loan.html` | loan calculator modules | partial |
| Insurance `insurance-hub.html` | insurance modules | partial |
| Life Insurance Need `life-cover.html` | life cover calculator | partial |
| Emergency Fund `emergency-fund.html` | `js/finos-emergency-fund.js`; mobile `computeEmergency()` in `mobile/lib/trackers.ts` | Shared inputs: monthly expense, AA expense, budget expense fallback, current fund and 3/6/12-month target; web/mobile parity and invalid-data tests |
| Life Goals `life-goals-planner.html` | `js/finos-life-goals.js` | partial (`tests/life-goals.test.js`, UI tests) |
| Budget Forecast `budget-forecast.html` | `js/finos-budget.js`, `js/finos-budget-ui.js` | partial (`tests/budget.test.js`, UI tests) |
| Financial Calendar `financial-calendar.html` | calendar and tracker modules | partial |
| Goal Optimizer `goal-optimizer.html` | `js/finos-goal-optimizer.js` | partial |
| Passive Income `passive-income.html` | `js/finos-passive-income.js` | none known in initial scan |
| Bonus & Windfall `windfall.html` | page-specific planner | none known |
| Subscription Tracker `subscription-tracker.html` | `js/finos-subscriptions.js` | partial (`tests/subscriptions.test.js`) |
| Command Hub `financial-hub.html` | hub/context modules | partial, broad UI tests |

The separately reachable `html/tracker.html` legacy expense/market dashboard is linked from `html/markets.html`, the website search index, and Arya sidebar actions. It is therefore in scope even though it is not a card on the main Track Finances hub. Its hard-coded market cards now say sample data and its random price mutation was removed; `tests/tracker-hub.test.js` covers the misleading-display regression.

## Mobile Track and tracker routes

The mobile Track tab is `mobile/app/(tabs)/track.tsx`. It displays monthly income/expense and a spend ratio, then links to transaction entry and bank-statement import. It currently does not expose all mobile tracker routes as a unified hub; route parity and discoverability are part of the audit. Shared state is loaded through `mobile/hooks/useTrackers.ts`, `mobile/lib/trackerStorage.ts`, tracker-specific stores, AsyncStorage, and the mobile sync store.

| Mobile route | Feature / owner | Coverage located in initial scan |
|---|---|---|
| `/tracker/budget` | category budgets and cash-flow summary | partial |
| `/tracker/crypto` | crypto holdings | parity tests exist |
| `/tracker/emergency` | emergency fund | shared logic tests |
| `/tracker/epf` | EPF and pension | retirement logic tests |
| `/tracker/fixed` | fixed income | fixed-income parity/storage tests |
| `/tracker/goals` | goals | goal optimizer parity tests |
| `/tracker/gold` | gold holdings | gold parity tests |
| `/tracker/harvest` | tax harvesting | none known in initial scan |
| `/tracker/health` | financial health score and actions | health logic tests |
| `/tracker/holdings-import` | portfolio holdings import | import/portfolio tests, flow coverage pending |
| `/tracker/import` | statement import, preview, undo | import tests, flow coverage pending |
| `/tracker/insurance` | policy details and coverage | insurance hub tests |
| `/tracker/networth` | net worth and FIRE summary | shared logic tests |
| `/tracker/nps` | NPS projection and tax | retirement logic tests |
| `/tracker/passive` | passive income streams | parity tests |
| `/tracker/ppf` | PPF/small-savings accounts | retirement logic tests |
| `/tracker/recurring` | recurring income/expense records | partial |
| `/tracker/subscriptions` | subscription lifecycle and costs | parity tests |
| `/tracker/transactions` | add/edit/delete and monthly browsing; explicit transfers | transaction CRUD/storage tests; transfer excluded from budgets and round-trips storage; 50-row bounded paging; route smoke passed after transfer UI change in all 4 empty/populated × dark/light states; native interaction/performance pending; commit `2aecc6c` |
| `/tracker/watchlist` | stock/fund watchlist and price refresh | watchlist tests |

## Shared dependencies and test surfaces

- **Calculations:** `js/finos-*.js` on web; `mobile/lib/trackers.ts`, `mobile/lib/budget.ts`, `mobile/lib/retirement.ts`, and tracker-specific libraries on mobile. Several mobile tests are explicitly parity tests against website implementations.
- **Budget transaction rules:** only `expense` records count toward category budgets; `income`, `saving`, and explicitly typed `transfer` records do not. Transfer parity regression is in `mobile/__tests__/transactionTransfers.test.mts`; generic purchase memos containing the word “transfer” remain expenses.
- **Persistence:** website localStorage and `js/finos-tracker-sync.js`; mobile AsyncStorage via `mobile/lib/trackerStorage.ts`, transaction-specific stores, `mobile/lib/trackerStorageStatus.ts`, and `mobile/lib/trackerSync*.ts`. Mobile storage failures now have explicit load/save status and do not masquerade as empty or successfully saved data.
- **Cloud:** `supabase/tracker_snapshot.sql` creates the per-user JSONB snapshot with RLS; additional transaction/goal/budget tables are defined in `supabase/core_tables.sql`. Root and mobile sync tests cover malformed owner metadata; mobile has a local Supabase/PostgREST mock integration (3 tests). Real RLS remains unverified against a disposable database.
- **Existing relevant tests:** root `tests/{budget,crypto-tracker,fd-tracker,ppf-80c,subscriptions,tracker-sync,import,statement-import}.test.js`, web tracker UI tests, `tests/test_security_sql.py`, `tests/test_corrupt_json_fuzz.py`, `tests/test_a11y*.py`, and performance-budget checks. Mobile includes tracker sync/cloud, logic, corrupt data, and gold/crypto/fixed-income/life-goal/passive/subscription parity tests.
- **Coverage limitation:** this inventory is route and code-owner discovery, not proof of complete feature coverage. Per-action coverage, E2E flows, production route resolution, device behavior, and RLS behavior require later phases.

## Platform differences to adjudicate

1. Website has 34 hub cards (including planners and adjacent tools); mobile Track tab itself presents cash-flow summary plus transactions/import, with 20 tracker routes elsewhere. Decide and document whether each missing direct entry point is intentional.
2. Website legacy `tracker.html` has a search/market entry path that has no directly equivalent mobile Track hub workflow; web cards are now explicitly sample data.
3. Website localStorage and mobile AsyncStorage share many key names, but separate feature stores and key exclusions mean data parity must be checked by domain, not assumed from naming.
4. Mobile statement/holdings import currently claims device-local handling in UI; verify this end to end and against telemetry/network behavior.
