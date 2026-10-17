# Track Finances audit release evidence

Date: 2026-10-17
Branch: `audit/track-finances-production`
Scope: website Track Finances hub and linked tracker pages, mobile tracker routes, and shared tracker storage, calculations, imports, and cloud sync.

This is a verification report for the changes made in this audit. It is not a production sign-off: native device testing, authenticated cloud/RLS integration, and the full root Python suite have not been completed.

## Critical issues fixed

- Removed misleading fake live market prices from the legacy tracker; the displayed figures are identified as samples and no longer randomly change.
- Removed the production-facing `localhost:5173` Expense Engine probe and replaced it with a local-only notice.
- Prevented unreadable tracker sync ownership metadata from being interpreted as a first sync. Both web and mobile now pause before exchanging account data when the owner identity cannot be trusted.
- Surfaced tracker storage read/write failures instead of displaying empty defaults or reporting unsaved writes as successful.
- Corrected no-data FIRE and Emergency Fund calculations, including expense source precedence, invalid amounts, unsupported targets, and web/mobile parity.
- Corrected mobile money input parsing and bounded numeric input so malformed values are rejected instead of silently converted or clamped.
- Corrected Trade Journal signed-loss display, zero exit/blank quantity handling, edit preservation, Monday week boundaries, CSV charge/zero export, and supported broker-fill pairing/preview behavior.
- Bounded the mobile transaction history's initial render to 50 rows and added incremental loading.

## Verification completed

- Root Node regression: `node --test tests/*.test.js` — **505 passed, 0 failed** (`# tests 505`, `# pass 505`, `# fail 0`).
- Root static validation: `npm run check` — passed; tokens, links, search, JS, IDs, routes, and secrets checks each reported `0 problem(s)`.
- Python tracker-adjacent security and health-income tests — **42 passed**. The full root Python suite remains unverified; an earlier full run stalled without visible progress and was interrupted.
- Focused web tracker hub, net-worth golden, and sync regressions — passed; latest root Node run includes the final sync ownership regression.
- Focused mobile parity suite — **26 passed, 0 failed** across Trade Journal, Emergency Fund, and transaction paging.
- Mobile storage-failure and corrupt-data suites — previously **174 passed**; included again in the final full suite.
- Full mobile Node 24 suite, serial worker execution with loopback access: **1,036 passed, 0 failed, 0 cancelled, 0 skipped, 0 TODO** (45.0s).
- Transfer budget parity — **3 passed**; explicit internal transfers are excluded from expense totals on both platforms, survive mobile storage round-trip, and a purchase memo alone does not change transaction kind.
- Mobile TypeScript: `PATH=/Users/vkm/.nvm/versions/node/v24.15.0/bin:$PATH npm run typecheck` — passed.
- Updated `/tracker/transactions` browser smoke — **1 screen × 4 states**, 0 problems after adding transfer entry and display support.
- Mobile Expo web export: `npx expo export --platform web` — passed, **115 static routes**, one **3.81 MB** web JS bundle.
- Web browser theme smoke: **21 pages** loaded in dark/light and empty/populated states without detected page errors.
- Mobile tracker route smoke: all **20 tracker routes** loaded in empty/populated dark/light states without detected page errors.
- 375px responsive/touch audit: **21 pages**, 0 horizontal overflow, and no page had more than three undersized tap targets.

### Baseline-to-current command matrix

| Command/check | Baseline | Current evidence |
|---|---|---|
| Root `npm test` | Sandboxed run: 4 failures, 320 passes, 6 skips, 470 fixture errors; local-server binding blocked. Later elevated run completed 501 Node tests but Python stalled and was interrupted. | Root Node stage rerun separately: 505/505 pass. Full root Python suite remains incomplete. |
| Root `npm run check` | Pass | Pass; all seven static checks report 0 problems. |
| Root `npm run smoke` | Blocked by sandbox local-server bind permission | Browser route smoke run with permitted local server: 21 pages, no errors. |
| Mobile `npm test` | Node 20 unsupported `.mts`; test glob was quoted | Node 24 full suite (serial worker mode): 1,036/1,036 pass, 0 skipped/TODO. |
| Mobile `npm run typecheck` | Pass | Pass (`tsc --noEmit`, exit 0). |
| Mobile `npm run lint` | ESLint unavailable; offline install could not complete | Still blocked by unavailable dependency installation. |
| Mobile `npx expo export --platform web` | Earlier export passed | Passed after paging fix: 115 static routes and 3.81 MB JS bundle. |

## Not verified / remaining production gates

- `mobile npm run lint` is unverified because ESLint is absent and the environment could not install dependencies offline.
- Full root Python test suite did not complete; do not treat the baseline failure/stall as a pass.
- No iOS/Android simulator or physical-device pass for screen readers, keyboard/focus behavior, large text, offline transitions, or low/mid-range performance.
- No authenticated Supabase integration run against an isolated test project. RLS, real concurrent account switching, network retries, and schema migration behavior need cloud-backed verification.
- No deployed-host/base-path/service-worker verification or real financial institution/broker sample-file validation. The CSV behavior is verified for the included supported format only.
- The 3.81 MB web bundle and transaction paging have not been profiled on representative mobile hardware.

## Baseline context

The initial sandboxed root `npm test` reported 4 failures, 320 passes, 6 skips, and 470 fixture errors, predominantly because tests could not bind a local server. A later permitted run passed the Node stage (501 tests) but the Python stage stalled and was interrupted. Raw baseline output is retained under [`baseline/`](baseline/).

The repository contained extensive pre-existing modifications before this audit. They were preserved; this report does not claim those unrelated changes were reviewed or production-ready.

The isolated Trade Journal fix is committed as `7d4bd95`, tracker ownership fail-closed sync as `44f6c78`, deterministic mock sync server teardown as `b8fcd2e`, and the inventory/findings/plan/release report as `86ec1a4`. Other code changes remain in the working tree because the repository was already extensively dirty and safe hunk-level separation is still required before making additional commits.
