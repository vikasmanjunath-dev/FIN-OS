# Track Finances audit work plan

Branch: `audit/track-finances-production`
Scope: website Track Finances hub and linked tracker pages, mobile Track tab and `/tracker/*` screens, shared storage/sync/calculation/import services.

This is an execution board, not a release sign-off. A ticket closes only when the named evidence has been run and added to the release report. Device, database, and authenticated-cloud tests remain explicitly open until run against safe test environments.

| Ticket | Work | Phase | State | Evidence / next action |
|---|---|---:|---|---|
| T1 | Route and feature inventory | 1 | In progress | Initial web and mobile route tables in `inventory.md`; expand owners, storage keys, sync behavior, outputs, and per-action test coverage. |
| T2 | Calculation rules and golden fixtures | 2 | In progress | Shared net-worth/FIRE fixture and parity test added. Document formulas, rounding, date boundaries, income/expense sources, and test UTC plus Asia/Kolkata. |
| T3 | Net worth, cash flow, budget, emergency | 3 | In progress | Net-worth no-data default and Emergency Fund source/target/invalid-number parity fixed. Explicit account transfers now stay out of expense budgets. Shared normalization rejects malformed amount strings and impossible dates; spend rollups reject poisoned records and malformed limits. Refund treatment, emergency overflows, and duplicate source cases still need coverage. |
| T4 | Goals, retirement, fixed income, protection | 3 | Planned | Cover contribution timing, maturity, tax assumptions, age/date boundaries, policies and renewal totals on both platforms. |
| T5 | Transaction entry/import CRUD and failure states | 4 | In progress | Storage failure and input-validation cases pass. Exercise add/edit/delete, malformed/duplicate/oversized import, preview, undo, cancellation, repeated submit, and recovery in browser/app. |
| T6 | Web/mobile parity and duplicate-count audit | 3 | In progress | Shared net-worth/FIRE cases pass. Compare each duplicate-capable asset source and all duplicated web/mobile formulas; document intentional platform differences. |
| T7 | Storage corruption and failed-write resilience | 4 | In progress | Corruption + storage failure tests: 174 passed; added failure-precedence regression (9 focused tests pass). Exercise real app error/retry interactions and persistence recovery. |
| T8 | Sync conflict, offline, account-switch and RLS audit | 5 | In progress | Fixed malformed ownership metadata fallback that could mix local data into the next account. Web 5 and mobile 11 sync tests pass, including account switch and 4,000 parity comparisons. Run cloud mock integration, offline retries, delete/tombstone and schema/error cases; real DB credentials/device auth are unavailable. |
| T9 | Hub navigation, link and deployment-route checks | 8 | In progress | Static route audit passes; 21 web pages and all 20 mobile tracker routes loaded in empty/populated dark/light smoke checks; 21 responsive pages pass. Verify deployed hosting/base-path, service worker and production asset resolution. |
| T10 | Performance profiling and budgets | 6 | In progress | Bounded mobile transaction history to 50 rows per render and removed O(n²) grouping copies. Synthetic 2,500-row paging test added. Profile calculations, storage calls, charts, startup and low/mid-range device behavior remains. |
| T11 | Accessibility, responsive, visual consistency | 7 | In progress | Mobile 375px check: 21 pages, 0 overflow, 0 pages with >3 small targets. Complete keyboard/screen-reader, text scaling, tablet/desktop, and native-device checks. |
| T12 | Full regression and release sign-off | 9 | In progress | Root Node regression: 506 passed; root static checks pass; previous mobile Node 24 suite: 1,036 passed, 0 failed, 0 TODO; typecheck and Expo export pass after transfer changes. Latest focused web budget suite: 13 passed; dedicated mobile rollup parity: 1 passed; mobile shared logic: 15 passed; mobile typecheck passes. Full root Python suite interrupted after slow/no progress, lint unavailable offline, and native/cloud/deployed-host checks remain. |

## Review order

1. Data safety and misleading values (S0/S1): synthetic data labels, no-data formulas, validation, failed read/write behavior, duplicate assets, sync ownership.
2. Financial correctness: formula fixtures, units, date boundaries, negative/overflow handling, rounding, platform parity.
3. Core user flows: first run, populated, edit/delete, import/undo, retry, navigation and reload.
4. Security/privacy: user-scoped snapshots, RLS, account switch, offline sync, private-key exclusions, safe logs.
5. Responsiveness, accessibility, performance, route/deployment behavior.
6. Full regression, release report, and scoped conventional commits that exclude pre-existing user changes.

## Current phase checkpoint

- **Verified:** initial route mapping; static route/security audit; legacy web sample disclosure; removal of localhost Expense Engine probing; mobile amount parsing; shared web/mobile FIRE behavior; storage failure handling and focused regressions; root tracker smoke, route/theme loads, responsive layout, and focused security tests.
- **Fixed:** TRK-WEB-001, TRK-WEB-002, TRK-MOB-001, TRK-INPUT-001, TRK-MATH-001, TRK-MATH-002, TRK-SYNC-001, TRK-TEST-001 (supported Node 24 invocation).
- **Open:** full per-screen action/formula inventory; broad parity and duplicate-counting; real auth/account-switch/RLS database tests; large-data/device performance; native accessibility; deployment configuration; complete root Python suite; mobile lint dependency.
- **Next:** add screen-action/formula coverage to the inventory, audit remaining sync/RLS and duplicate-value scenarios, expand financial golden cases, and execute native/device and deployed-host checks when those environments are available.
