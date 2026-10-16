# planners agent: notes (Oct 14-15 2026)

## What was built (phone, all under `mobile/`)
| Tracker row | Screen | Pure core | Storage | Tests |
|---|---|---|---|---|
| T-02 Budget Forecast | `app/plan/forecast.tsx` | `lib/forecast.ts` (Holt, event rules, confidence; port of `js/finos-forecast.js`) | `lib/forecastStorage.ts` | `__tests__/forecast.parity.test.mts` (600 random ledgers vs the website file, edge cases, storage) |
| T-18 Life Goals | `app/plan/lifegoals.tsx` | `lib/lifeGoals.ts` (plan, findSIP, validation, derived roadmap) | `lib/lifeGoalsStorage.ts` | `__tests__/lifeGoals.parity.test.mts` (1,500 households, roadmap text word for word vs the website module, banned-claims guard, prefill) |
| T-01 Growth simulator | `app/plan/growth.tsx` | `lib/growthSim.ts` | `lib/growthSimStorage.ts` | `__tests__/growthSim.test.mts` (equals the website calculator page on 150 inputs) |
| T-38 Couple | `app/plan/couple.tsx` | `lib/couple.ts` | `lib/coupleStorage.ts` | `__tests__/couple.test.mts` |
| T-39 Benchmarking / T-37 extras | `app/plan/benchmark.tsx` | `lib/benchmark.ts` | `lib/benchmarkStorage.ts` | `__tests__/benchmark.test.mts` |
| T-10 Calendar extras | `app/plan/mydates.tsx` | `lib/financialCalendar.ts` (custom dates, repeats, .ics) | `lib/financialCalendarStorage.ts` | `__tests__/financialCalendar.test.mts` |

Routes: `/plan/forecast`, `/plan/lifegoals`, `/plan/growth`, `/plan/couple`, `/plan/benchmark`, `/plan/mydates`.

## Decisions and honest limits
- **Forecast**: window = complete months before today, so the figure is for the *current* month (the website calls it "next month"; the phone says "this month"). Writes only `finos_forecast_next_month` (the baseline with no events, so toggling a chip changes nothing stored). Event factors only touch categories whose names match (the phone's Groceries and Bills do not match "Food"); each active event lists what it changes. Trend and risk are hidden under 3 months. The budget comparison covers only categories that have a limit.
- **Life goals**: prefill only from record (age, income, savings rate x income for "can invest", emergency fund, cash + deposits, finos_goals with dates turned into years). Return %, retirement age are never filled in; per-goal inflation starts at 6 as a labelled assumption. Totals are saved only on a tap, to `finos_goals_monthly_sip / _target_total / _count`, and feasibility to `finos_life_goals_feasibility` (NOT `finos_goals_feasibility`, which the Goal optimizer owns; the old page overwrote it with a different quantity).
- **Roadmap review** (phone, and the same text is now on the website page): removed the term premium range "Rs 8-12K a year", "60% Nifty 50 / 40% FlexiCap", a start-SIP capped at an arbitrary Rs 30,000, tax saved at an assumed 30% slab via ELSS/NPS, the "10% step-up rule", Rs 10L floater, Rs 25L top-up, down payment 20% and EMI <= 35% of income, "rebalance 2 years before, 60% to debt", Small Cap 15% at Rs 25L, "equity % = 100 - age", the 3.5% SWR / SWP line, the "on track if SIP over years-2 reaches 70%" test, and the "skills > frugality / defer the rest" feasibility advice. Kept or derived instead: emergency fund target and months to fill, the 10x-income term rule shown as a labelled rule of thumb with recorded cover and dependents, per-goal inflated target, savings credited, SIP, the SIP at 3 points lower return (sensitivity), money freed when each goal ends, corpus-milestone dates from compounding the person's own numbers, and pointers to the Retirement planner and insurance tracker. Items carry a kind (figure / assumption / pointer) and the screen colours them.
- **Growth**: starts from holdings at last fetched price (cost when never priced, flagged) and holdings' SIPs. Website SIP-tracker SIPs are a separate opt-in tick (the same fund can be in both). Return is never pre-filled; low/high at +-2 points; real value when inflation is given. Before tax and costs.
- **Couple**: there is no browser logic on the website; the sums live in `alerts/alert-engine.py` (`/couple/overview`) and need two linked accounts and the Family plan. The phone version is on-device arithmetic on figures typed for two people: joint income/spend/savings, income shares, proportional bill split with settlement (the website lacks this), the server's 15%-of-joint-income large-item flag (pinned by a test that reads the Python source), joint goals with both contributions (no interest). **Privacy**: stored under `finos_sync_never_couple_v1` because any other `finos_` key would be uploaded by tracker sync; the `finos_sync_` prefix is on that sync's exclusion list and a test asserts `isSyncKey()` is false. It is still in the person's own export and encrypted backup, and Clear All Data removes it.
- **Benchmark**: NOT ported. The website's "Avg Peer / Top 10%" numbers are a table typed into `alerts/health_score.py benchmark_comparison` with a claimed SEBI / AMFI / RBI / NPS Trust source nobody can point to, and the page shows invented "your" figures when the server is offline. The phone shows the person's own figures against the Money Score's rule-of-thumb targets (each labelled), "Not recorded" otherwise, and a plain statement that no peer data exists. Financial Report (T-37) was already done; its website defects are fixed below.
- **Calendar**: reminders and notifications already exist (`lib/reminders*.ts`), so the T-10 note "notifications NOT built" is stale. Missing pieces built: own dates (once / monthly / yearly, amount, note) and an .ics export of everything for 12 months with an amounts on/off switch. The website has neither, so there is no website key; custom dates use `finos_calendar_custom_events`. They are not yet on the calendar grid or in reminders (see integration).

## Website defects found and fixed (with tests)
1. `js/finos-life-goals.js`: a 0% return was read as "not given" and became 12%; a goal fully funded by savings could show a Rs 500 SIP from float dust (about 5% of fully funded cases); `findSIP` silently capped at Rs 1 crore a month. Now closed form, a `returnAssumed` flag, and `validateProfile` checks the return. Tests in `tests/life-goals.test.js`.
2. `html/life-goals-planner.html`: three invented demo goals seeded as the person's; "invest 30% of income" guess; net worth (house, EPF) used as savings; income band mapped to a made-up income; retirement age and return silently 58 / 12; inflation 0 became 6; missing years became 10; fixed-advice roadmap (above); feasibility written to the optimizer's key. Tests in `tests/test_life_goals_ui.py`.
3. `html/budget-forecast.html`: an income band turned into a number and saved as income; the prediction seeded the "recorded" monthly expense and savings rate when blank, freezing there; typed income replaced a recorded one; the "next month" label was the current month; event-rule note added. `js/finos-forecast.js`: an empty category matched every event; the save message ("Lock Rs X in FD") reworded to say what the amount is a share of. Tests in `tests/test_budget_forecast_ui.py`, `tests/forecast.test.js`.
4. `html/benchmarking.html`: demo figures shown as the person's when offline; unsourced SEBI/AMFI/RBI claim; "peer" / "Top 10%" labels; unescaped server text in innerHTML. `html/financial-report.html`: sample report with a small banner when offline; unescaped user name and pillar text; "Your finances are on track." default. Test `tests/test_planners_pages.py`.
5. Found, not mine to fix: `alerts/health_score.py _monthly_income` counts ANY positive amount as income and halves sums assuming 60 days / 100 rows; the couple overview and benchmark endpoints use it. `mobile/lib/calcs/invest.ts` 'growth' formats amounts under 1 lakh with `moneyRaw` where the website page rounds (the phone can show decimals).

## Verification
`cd mobile && npx tsc --noEmit` clean. `npm test`: all planners tests pass; 23 unrelated failures at the end are calculator-page parity / loan / extraction tests that another agent was editing at the time (not touched here), plus `privacy.test` flagging `lib/diagnostics.ts` (another agent). `node --test tests/*.test.js` 387 pass, `python3 tests/static_audit.py` pass, pytest `test_life_goals_ui`, `test_budget_forecast_ui`, `test_planners_pages` pass. `smoke-routes.py`: 6 screens x 4 runs, 0 problems; `theme-audit.py`: 0 low-contrast. Mutation checks (alpha 0.3 to 0.31, the netTarget dust guard, the settlement sign) each fail their tests. A running Metro does not see new route directories: restart it (`app/plan` was invisible until I started my own on :8090).

## Needed in shared files
- **Search entries** (`lib/search.ts`): Spending forecast `/plan/forecast` (forecast, budget forecast, predict spending); Life goals planner `/plan/lifegoals` (goals roadmap, SIP per goal); Growth projection `/plan/growth` (portfolio growth, SIP projection); Couple finance `/plan/couple` (partner, split bills, joint goals); Benchmarks `/plan/benchmark` (compare, rule of thumb); Your dates and export `/plan/mydates` (custom dates, ics, export calendar).
- **Dashboard tiles** (`dashboard.tsx`): Forecast, Life goals, Growth, Couple under Money Tools; Benchmarks near Money Score. Cross links: Budget -> Forecast; Goals tracker -> Life goals planner; Portfolio -> Growth; Calendar screen -> `/plan/mydates`.
- **Privacy** (`lib/privacy.ts` data items): "Couple finance: your partner's figures, typed by you, kept only on this phone, never uploaded or synced" (`finos_sync_never_couple_v1`); "Your calendar dates" (`finos_calendar_custom_events`); drafts `finos_life_goals_planner_v1`, `finos_growth_sim_v1`; derived `finos_forecast_next_month`, `finos_goals_monthly_sip`, `finos_goals_target_total`, `finos_goals_count`, `finos_life_goals_feasibility`. No new host, permission or fetch caller; the .ics export uses expo-file-system + expo-sharing (already dependencies).
- **`lib/storageKeys.ts`**: add `/^finos-calendar-.*\.ics$/` to `TEMP_FILE_PATTERNS` (the export file is deleted at once on iOS; on Android it needs the sweeper).
- **Calendar integration** (custom dates on the grid and in reminders): add `'custom'` to `EventType` and `EVENT_META` in `lib/calendar.ts`, `custom: 3` to `LEAD` and `LABEL` in `lib/reminders.ts`, read `loadCustomEvents()` in `calendarStorage.ts` and append `customToEvents(list, from, to)` in `collectEvents`.
- **Hindi**: the 121 untranslated strings found by running the six routes in Hindi are in `docs/agent-notes/planners-hindi-missing.json` (template keys with `{n}`); first-pass wording needs native review.
- **Tracker rows**: T-02 Done; T-18 Done (plan + derived roadmap; the "generic roadmap not ported" note is superseded); T-01 Done (`/plan/growth`); T-38 Done on-device (no account linking, no server tables needed); T-39 Done as "rule-of-thumb targets only, peer comparison deliberately not built"; T-37 Done; T-10 Done for custom dates + export, grid/reminder integration pending the edits above, and its "notifications not built" note is stale.
- **Optional hardening**: add `finos_sync_never_couple_v1` to `NEVER_EXACT` in `lib/trackerSync.ts` explicitly.

## Commit
```
git add -- mobile/app/plan mobile/lib/forecast.ts mobile/lib/forecastStorage.ts mobile/lib/lifeGoals.ts mobile/lib/lifeGoalsStorage.ts mobile/lib/growthSim.ts mobile/lib/growthSimStorage.ts mobile/lib/couple.ts mobile/lib/coupleStorage.ts mobile/lib/benchmark.ts mobile/lib/benchmarkStorage.ts mobile/lib/financialCalendar.ts mobile/lib/financialCalendarStorage.ts mobile/__tests__/forecast.parity.test.mts mobile/__tests__/lifeGoals.parity.test.mts mobile/__tests__/growthSim.test.mts mobile/__tests__/couple.test.mts mobile/__tests__/benchmark.test.mts mobile/__tests__/financialCalendar.test.mts js/finos-forecast.js js/finos-life-goals.js html/budget-forecast.html html/life-goals-planner.html html/benchmarking.html html/financial-report.html tests/forecast.test.js tests/life-goals.test.js tests/test_budget_forecast_ui.py tests/test_life_goals_ui.py tests/test_planners_pages.py docs/agent-notes/planners.md docs/agent-notes/planners-hindi-missing.json

git commit -F - <<'EOF'
Planners: phone forecast, life goals, growth, couple, benchmarks, own dates + .ics; website defect fixes

Phone (mobile/app/plan): spending forecast (port of finos-forecast with parity test,
budget-limit comparison, honest short-history flag, event rules labelled as rules of
thumb, writes only its own key), life goals planner (port of finos-life-goals, prefill
only from recorded data, roadmap rebuilt from derived figures only), growth projection
from real holdings at a rate the person sets, on-device couple finance (kept under a
sync-excluded key), rule-of-thumb benchmarks (no peer data exists, so none is shown),
custom calendar dates and .ics export.

Website: life-goals module no longer turns 0% into 12%, shows Rs 500 for fully funded
goals or caps the SIP at 1 crore; planner page no longer seeds demo goals, guesses 30% /
net worth / income bands, or prints fixed advice; forecast page no longer seeds recorded
expense / savings rate from a prediction; benchmarking and report pages no longer show
sample figures or an unsourced peer claim, and escape server text.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```
