# Commit plan: everything uncommitted as of 2026-10-16

Run each block from the shell, top to bottom. Every block starts with the `cd`. Nothing here has been run for you.

Already in history (committed 10-14 / 10-15): security, Learn, insurance and funds, PULSE, release pack. Their *later* edits are in block 1 below.

**Blocks 14 and 15 are unfinished work** (agents stopped at a usage limit that resets 2:50am IST). Block 14 adds a test that still fails; block 15 is an incomplete accessibility pass. Skip them or commit them as work in progress. Block 16 is not from these agents.

Counts: 508 uncommitted paths. Assigned to blocks 1-16: 504. Not in any block (section C): 4.

## A. Pre-flight

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git status --short | head -5 && git diff --cached --stat | tail -2
```
If the second command prints anything, something is already staged: run `git restore --staged .` before block 1.

## B. Commit blocks

### Block 1: Security leftovers (lock, backup, alerts) - already committed once; only later edits

1 changed paths. `git add` uses directory pathspecs where a whole folder belongs to the block.

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git add -- \
  mobile/app/security.tsx && \
git commit -F - <<'EOF'
mobile: harden app lock and backup after the trust-platform review

Later edits to the lock, backup and alerts modules: PIN attempts are counted before the check,
the lock fails closed, a damaged or hostile backup file is rejected without changing anything.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

<details><summary>Files in this block (1)</summary>

- `M` mobile/app/security.tsx

</details>

### Block 2: Market data: phone screens and backend fixes

29 changed paths. `git add` uses directory pathspecs where a whole folder belongs to the block.

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git add -- \
  arya-ai/data/market.py \
  arya-ai/data/news.py \
  arya-ai/db/store.py \
  arya-ai/server.py \
  tests/test_market_data_backend.py \
  mobile/lib/marketData.ts \
  mobile/lib/marketDataStorage.ts \
  mobile/lib/marketDataApi.ts \
  mobile/hooks/useMarketResource.ts \
  mobile/hooks/useMarketData.ts \
  mobile/components/PriceChart.tsx \
  mobile/components/MarketUI.tsx \
  mobile/app/market \
  mobile/__tests__/marketData.test.mts \
  mobile/__tests__/marketDataStorage.test.mts \
  docs/agent-notes/market-data.md \
  mobile/lib/fundsApi.ts \
  mobile/lib/fundsClient.ts \
  mobile/lib/fundsHistory.ts \
  mobile/__tests__/fundsHistory.test.mts \
  mobile/lib/fundsStorage.ts \
  mobile/hooks/useSectors.ts && \
git commit -F - <<'EOF'
feat(market): news, stock, fund, commodity, FX, crypto and screener screens; honest market backend

Phone: market research hub, news with stated keyword-sentiment and tag filter, stock detail with
range, chart and labelled fundamentals, fund detail with NAV history and computed returns,
commodities (gold/silver marked as converted world prices, not MCX), FX, crypto, price-only
screener, last-good-response cache with an "as of" time, null-safe index cards (a missing change
is shown as a dash, never 0).

Backend: pe_ratio was price-to-book under the wrong name; USD/INR is never guessed (83.5 removed);
crypto cache key collision, invented 0 changes, wrong NSE index fields, news sorted by weekday name,
substring sentiment ("ban" in "bank"), slow serial quotes, M&M encoding. New /api/fundamentals,
/api/mf/history (AMFI NAVs via mfapi.in, cross-checked against AMFI's daily file), chart dates,
news source status.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

<details><summary>Files in this block (29)</summary>

- `M` arya-ai/data/market.py
- `M` arya-ai/data/news.py
- `M` arya-ai/db/store.py
- `M` arya-ai/server.py
- `??` docs/agent-notes/market-data.md
- `??` mobile/__tests__/fundsHistory.test.mts
- `??` mobile/__tests__/marketData.test.mts
- `??` mobile/__tests__/marketDataStorage.test.mts
- `??` mobile/app/market/commodities.tsx
- `??` mobile/app/market/crypto.tsx
- `??` mobile/app/market/fund/[code].tsx
- `??` mobile/app/market/fx.tsx
- `??` mobile/app/market/index.tsx
- `??` mobile/app/market/news.tsx
- `??` mobile/app/market/screener.tsx
- `??` mobile/app/market/stock/[symbol].tsx
- `??` mobile/components/MarketUI.tsx
- `??` mobile/components/PriceChart.tsx
- `M` mobile/hooks/useMarketData.ts
- `??` mobile/hooks/useMarketResource.ts
- `M` mobile/hooks/useSectors.ts
- `??` mobile/lib/fundsApi.ts
- `??` mobile/lib/fundsClient.ts
- `??` mobile/lib/fundsHistory.ts
- `M` mobile/lib/fundsStorage.ts
- `??` mobile/lib/marketData.ts
- `??` mobile/lib/marketDataApi.ts
- `??` mobile/lib/marketDataStorage.ts
- `??` tests/test_market_data_backend.py

</details>

### Block 3: Trust platform: crash notes, feedback, onboarding, erase, lock hardening

43 changed paths. `git add` uses directory pathspecs where a whole folder belongs to the block.

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git add -- \
  mobile/lib/redact.ts \
  mobile/lib/consents.ts \
  mobile/lib/usage.ts \
  mobile/lib/feedback.ts \
  mobile/lib/feedbackStorage.ts \
  mobile/lib/appInfo.ts \
  mobile/lib/diagnostics.ts \
  mobile/lib/diagnosticsStorage.ts \
  mobile/lib/onboarding.ts \
  mobile/lib/onboardingStorage.ts \
  mobile/lib/onboardingActions.ts \
  mobile/lib/permissions.ts \
  mobile/lib/permissionPrompt.ts \
  mobile/lib/eraseEpoch.ts \
  mobile/lib/eraseDeps.ts \
  mobile/lib/tempFiles.ts \
  mobile/lib/secureSession.ts \
  mobile/lib/googleAuth.ts \
  mobile/lib/dataControls.ts \
  mobile/lib/supabase.ts \
  mobile/lib/trackerSync.ts \
  mobile/lib/holdingsStore.ts \
  mobile/lib/trackerSyncStore.ts \
  mobile/hooks/useAuth.tsx \
  mobile/components/ErrorBoundary.tsx \
  mobile/components/SharePreview.tsx \
  mobile/components/FeedbackPrompt.tsx \
  mobile/app/_layout.tsx \
  mobile/app/index.tsx \
  mobile/app/onboarding \
  mobile/app/feedback.tsx \
  mobile/app/diagnostics.tsx \
  mobile/app/login.tsx \
  supabase/delete_account.sql \
  mobile/__tests__/redact.parity.test.mts \
  mobile/__tests__/feedback.parity.test.mts \
  mobile/__tests__/diagnostics.test.mts \
  mobile/__tests__/onboarding.test.mts \
  mobile/__tests__/erase.test.mts \
  mobile/__tests__/storageKeys.test.mts \
  mobile/__tests__/secureSession.test.mts \
  mobile/__tests__/googleAuth.test.mts \
  docs/agent-notes/trust-platform.md && \
git commit -F - <<'EOF'
Trust platform: crash notes, feedback, onboarding, erase flow, session hardening

- On-device redacted crash notes, ErrorBoundary, Diagnostics screen, opt-in screen counts
  (no service; nothing is sent automatically)
- Feedback loop ported from the website (endpoint null, share sheet); redaction is byte-identical
  to the website's on a corpus plus 4,000 random strings and also catches UPI handles, spaced
  digits, lower-case PAN, IFSC and non-ASCII digits
- First-run onboarding: skippable, resumable, shown at most twice, never for phones that already
  hold data, writes only the fields the person answered
- One erase flow: signs out first, then resets in-memory stores, cancels notifications, sweeps
  cache files, clears secure storage and AsyncStorage, and verifies nothing is left
- delete_my_account() now removes rows of tables that have a bare user_id and no cascade
- signOut is local (it used to end the website and other-phone sessions); "Forgot PIN" also
  drops the cloud session
- Session tokens encrypted under a secure-storage key; device-only keys kept out of sync,
  backup and export; theme/reminder switches no longer sync to other devices
- Google sign-in (Supabase OAuth + PKCE) gated by EXPO_PUBLIC_GOOGLE_SIGNIN; unit-tested with
  fakes only, not run against a real project

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

<details><summary>Files in this block (43)</summary>

- `??` docs/agent-notes/trust-platform.md
- `??` mobile/__tests__/diagnostics.test.mts
- `??` mobile/__tests__/erase.test.mts
- `??` mobile/__tests__/feedback.parity.test.mts
- `??` mobile/__tests__/googleAuth.test.mts
- `??` mobile/__tests__/onboarding.test.mts
- `??` mobile/__tests__/redact.parity.test.mts
- `??` mobile/__tests__/secureSession.test.mts
- `??` mobile/__tests__/storageKeys.test.mts
- `M` mobile/app/_layout.tsx
- `??` mobile/app/diagnostics.tsx
- `??` mobile/app/feedback.tsx
- `M` mobile/app/index.tsx
- `M` mobile/app/login.tsx
- `??` mobile/app/onboarding/welcome.tsx
- `??` mobile/components/ErrorBoundary.tsx
- `??` mobile/components/FeedbackPrompt.tsx
- `??` mobile/components/SharePreview.tsx
- `M` mobile/hooks/useAuth.tsx
- `??` mobile/lib/appInfo.ts
- `??` mobile/lib/consents.ts
- `M` mobile/lib/dataControls.ts
- `??` mobile/lib/diagnostics.ts
- `??` mobile/lib/diagnosticsStorage.ts
- `??` mobile/lib/eraseDeps.ts
- `??` mobile/lib/eraseEpoch.ts
- `??` mobile/lib/feedback.ts
- `??` mobile/lib/feedbackStorage.ts
- `??` mobile/lib/googleAuth.ts
- `M` mobile/lib/holdingsStore.ts
- `??` mobile/lib/onboarding.ts
- `??` mobile/lib/onboardingActions.ts
- `??` mobile/lib/onboardingStorage.ts
- `??` mobile/lib/permissionPrompt.ts
- `??` mobile/lib/permissions.ts
- `??` mobile/lib/redact.ts
- `??` mobile/lib/secureSession.ts
- `M` mobile/lib/supabase.ts
- `??` mobile/lib/tempFiles.ts
- `M` mobile/lib/trackerSync.ts
- `M` mobile/lib/trackerSyncStore.ts
- `??` mobile/lib/usage.ts
- `M` supabase/delete_account.sql

</details>

### Block 4: Planners: phone screens and website defect fixes

37 changed paths. `git add` uses directory pathspecs where a whole folder belongs to the block.

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git add -- \
  mobile/app/plan \
  mobile/lib/forecast.ts \
  mobile/lib/forecastStorage.ts \
  mobile/lib/lifeGoals.ts \
  mobile/lib/lifeGoalsStorage.ts \
  mobile/lib/growthSim.ts \
  mobile/lib/growthSimStorage.ts \
  mobile/lib/couple.ts \
  mobile/lib/coupleStorage.ts \
  mobile/lib/benchmark.ts \
  mobile/lib/benchmarkStorage.ts \
  mobile/lib/financialCalendar.ts \
  mobile/lib/financialCalendarStorage.ts \
  mobile/__tests__/forecast.parity.test.mts \
  mobile/__tests__/lifeGoals.parity.test.mts \
  mobile/__tests__/growthSim.test.mts \
  mobile/__tests__/couple.test.mts \
  mobile/__tests__/benchmark.test.mts \
  mobile/__tests__/financialCalendar.test.mts \
  js/finos-forecast.js \
  js/finos-life-goals.js \
  html/budget-forecast.html \
  html/life-goals-planner.html \
  html/benchmarking.html \
  html/financial-report.html \
  tests/forecast.test.js \
  tests/life-goals.test.js \
  tests/test_budget_forecast_ui.py \
  tests/test_life_goals_ui.py \
  tests/test_planners_pages.py \
  docs/agent-notes/planners.md \
  docs/agent-notes/planners-hindi-missing.json && \
git commit -F - <<'EOF'
Planners: phone forecast, life goals, growth, couple, benchmarks, own dates + .ics; website defect fixes

Phone (mobile/app/plan): spending forecast (port of finos-forecast, parity-tested on 600 ledgers),
life goals planner (port of finos-life-goals, parity on 1,500 households; prefills only from
recorded data; fixed advice removed), growth projection from real holdings at a rate the person
sets (equal to the website calculator on 150 inputs), on-device couple finance kept under a
sync-excluded key, rule-of-thumb benchmarks (no peer data exists, so none is shown), custom
calendar dates and an .ics export.

Website: the life-goals module no longer turns 0% into 12%, shows Rs 500 for fully funded goals
or caps the SIP at 1 crore; the planner page no longer seeds demo goals, guesses 30% / net worth /
income bands or prints fixed advice; the forecast page no longer seeds a recorded expense or
savings rate from a prediction; benchmarking and report pages no longer show sample figures or
an unsourced peer claim, and escape server text.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

<details><summary>Files in this block (37)</summary>

- `??` docs/agent-notes/planners-hindi-missing.json
- `??` docs/agent-notes/planners.md
- `M` html/benchmarking.html
- `M` html/budget-forecast.html
- `M` html/financial-report.html
- `M` html/life-goals-planner.html
- `M` js/finos-forecast.js
- `M` js/finos-life-goals.js
- `??` mobile/__tests__/benchmark.test.mts
- `??` mobile/__tests__/couple.test.mts
- `??` mobile/__tests__/financialCalendar.test.mts
- `??` mobile/__tests__/forecast.parity.test.mts
- `??` mobile/__tests__/growthSim.test.mts
- `??` mobile/__tests__/lifeGoals.parity.test.mts
- `??` mobile/app/plan/benchmark.tsx
- `??` mobile/app/plan/couple.tsx
- `??` mobile/app/plan/forecast.tsx
- `??` mobile/app/plan/growth.tsx
- `??` mobile/app/plan/lifegoals.tsx
- `??` mobile/app/plan/mydates.tsx
- `??` mobile/lib/benchmark.ts
- `??` mobile/lib/benchmarkStorage.ts
- `??` mobile/lib/couple.ts
- `??` mobile/lib/coupleStorage.ts
- `??` mobile/lib/financialCalendar.ts
- `??` mobile/lib/financialCalendarStorage.ts
- `??` mobile/lib/forecast.ts
- `??` mobile/lib/forecastStorage.ts
- `??` mobile/lib/growthSim.ts
- `??` mobile/lib/growthSimStorage.ts
- `??` mobile/lib/lifeGoals.ts
- `??` mobile/lib/lifeGoalsStorage.ts
- `M` tests/forecast.test.js
- `M` tests/life-goals.test.js
- `M` tests/test_budget_forecast_ui.py
- `M` tests/test_life_goals_ui.py
- `??` tests/test_planners_pages.py

</details>

### Block 5: Website: pin CDN libraries with integrity; cache them offline

103 changed paths. `git add` uses directory pathspecs where a whole folder belongs to the block.

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git add -- \
  sw.js \
  calculators/inject-arya-ai.sh \
  tests/static_audit.py \
  tests/test_calc_explainer.py \
  "Porfolio Analyser/portfolio-analyser-v10.html" \
  html/calculators.html \
  html/clarity.html \
  html/commoditydetail.html \
  html/couple-finance.html \
  html/credit-score.html \
  html/crypto-tracker.html \
  html/cryptodetail.html \
  html/debt-optimizer.html \
  html/debtdetail.html \
  html/decision.html \
  html/diagnostics.html \
  html/dna.html \
  html/emergency-fund.html \
  html/epf-tracker.html \
  html/equitydetail.html \
  html/etfdetail.html \
  html/fear-roadmap.html \
  html/feedback.html \
  html/finance101.html \
  html/financial-being.html \
  html/financial-calendar.html \
  html/financial-hub.html \
  html/fnodetail.html \
  html/forexdetail.html \
  html/foundations.html \
  html/goal-optimizer.html \
  html/gold-tracker.html \
  html/hedgefund.html \
  html/home-loan.html \
  html/impact-detail.html \
  html/impact.html \
  html/insight-debt.html \
  html/insight-emi.html \
  html/insight-inflation.html \
  html/insight-rbi.html \
  html/insight-sip.html \
  html/insurance-directory.html \
  html/investor-mindset.html \
  html/investor-profile.html \
  html/itr-summary.html \
  html/know-your-finances.html \
  html/learn-analysis.html \
  html/learn-commodity.html \
  html/learn-crypto.html \
  html/learn-debt.html \
  html/learn-equity.html \
  html/learn-etf.html \
  html/learn-fno.html \
  html/learn-forex.html \
  html/learn-fundamental.html \
  html/learn-indicators.html \
  html/learn-insurance.html \
  html/learn-metrics.html \
  html/learn-mf.html \
  html/learn-money-market.html \
  html/learn-technical.html \
  html/life-cover.html \
  html/life-wealth.html \
  html/market-intel.html \
  html/market-visualizer.html \
  html/markets.html \
  html/mfdetail.html \
  html/money-ai.html \
  html/money-score.html \
  html/moneydetail.html \
  html/net-worth.html \
  html/not-money.html \
  html/nps-tracker.html \
  html/onboarding.html \
  html/options-intelligence.html \
  html/passive-income.html \
  html/portfolio-rebalancer.html \
  html/portfolio.html \
  html/ppf-tracker.html \
  html/principles.html \
  html/privacy.html \
  html/profile.html \
  html/quantedge.html \
  html/real-estate.html \
  html/retirement-planner.html \
  html/roadmap.html \
  html/salary-optimizer.html \
  html/scenarios.html \
  html/simulator-guide.html \
  html/simulator.html \
  html/sip-stepup.html \
  html/start.html \
  html/stock-platform.html \
  html/subscription-tracker.html \
  html/system-leak.html \
  html/tax-harvest.html \
  html/tax.html \
  html/terms.html \
  html/timeline.html \
  html/tracker.html \
  html/trader-roadmap.html \
  html/trading-simulator.html \
  html/traditional-roadmap.html && \
git commit -F - <<'EOF'
Pin Chart.js, marked, DOMPurify, supabase-js and tesseract with integrity; cache them in the service worker

109 pages loaded Chart.js from an unversioned jsDelivr URL (it floats to the latest release) and
several others loaded marked, DOMPurify and supabase-js@2 the same way, without integrity. All are
now exact versions with sha384 integrity and crossorigin=anonymous; the files are byte-identical
to what the unpinned URLs served. sw.js caches exact-version jsDelivr .js paths cache-first (CORS
200 only), so calculators keep working offline after the first visit (CACHE_NAME bumped).
static_audit.py skips dot-directories (it was scanning worktree copies).

NOTE: the html/js files that carry the pins are staged by the next blocks (calculators/, then the
js/html behaviour block); this commit holds sw.js, the audit and the injector.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

<details><summary>Files in this block (103)</summary>

- `M` Porfolio Analyser/portfolio-analyser-v10.html
- `M` calculators/inject-arya-ai.sh
- `M` html/calculators.html
- `M` html/clarity.html
- `M` html/commoditydetail.html
- `M` html/couple-finance.html
- `M` html/credit-score.html
- `M` html/crypto-tracker.html
- `M` html/cryptodetail.html
- `M` html/debt-optimizer.html
- `M` html/debtdetail.html
- `M` html/decision.html
- `M` html/diagnostics.html
- `M` html/dna.html
- `M` html/emergency-fund.html
- `M` html/epf-tracker.html
- `M` html/equitydetail.html
- `M` html/etfdetail.html
- `M` html/fear-roadmap.html
- `M` html/feedback.html
- `M` html/finance101.html
- `M` html/financial-being.html
- `M` html/financial-calendar.html
- `M` html/financial-hub.html
- `M` html/fnodetail.html
- `M` html/forexdetail.html
- `M` html/foundations.html
- `M` html/goal-optimizer.html
- `M` html/gold-tracker.html
- `M` html/hedgefund.html
- `M` html/home-loan.html
- `M` html/impact-detail.html
- `M` html/impact.html
- `M` html/insight-debt.html
- `M` html/insight-emi.html
- `M` html/insight-inflation.html
- `M` html/insight-rbi.html
- `M` html/insight-sip.html
- `M` html/insurance-directory.html
- `M` html/investor-mindset.html
- `M` html/investor-profile.html
- `M` html/itr-summary.html
- `M` html/know-your-finances.html
- `M` html/learn-analysis.html
- `M` html/learn-commodity.html
- `M` html/learn-crypto.html
- `M` html/learn-debt.html
- `M` html/learn-equity.html
- `M` html/learn-etf.html
- `M` html/learn-fno.html
- `M` html/learn-forex.html
- `M` html/learn-fundamental.html
- `M` html/learn-indicators.html
- `M` html/learn-insurance.html
- `M` html/learn-metrics.html
- `M` html/learn-mf.html
- `M` html/learn-money-market.html
- `M` html/learn-technical.html
- `M` html/life-cover.html
- `M` html/life-wealth.html
- `M` html/market-intel.html
- `M` html/market-visualizer.html
- `M` html/markets.html
- `M` html/mfdetail.html
- `M` html/money-ai.html
- `M` html/money-score.html
- `M` html/moneydetail.html
- `M` html/net-worth.html
- `M` html/not-money.html
- `M` html/nps-tracker.html
- `M` html/onboarding.html
- `M` html/options-intelligence.html
- `M` html/passive-income.html
- `M` html/portfolio-rebalancer.html
- `M` html/portfolio.html
- `M` html/ppf-tracker.html
- `M` html/principles.html
- `M` html/privacy.html
- `M` html/profile.html
- `M` html/quantedge.html
- `M` html/real-estate.html
- `M` html/retirement-planner.html
- `M` html/roadmap.html
- `M` html/salary-optimizer.html
- `M` html/scenarios.html
- `M` html/simulator-guide.html
- `M` html/simulator.html
- `M` html/sip-stepup.html
- `M` html/start.html
- `M` html/stock-platform.html
- `M` html/subscription-tracker.html
- `M` html/system-leak.html
- `M` html/tax-harvest.html
- `M` html/tax.html
- `M` html/terms.html
- `M` html/timeline.html
- `M` html/tracker.html
- `M` html/trader-roadmap.html
- `M` html/trading-simulator.html
- `M` html/traditional-roadmap.html
- `M` sw.js
- `M` tests/static_audit.py
- `M` tests/test_calc_explainer.py

</details>

### Block 5b: Release docs (runbook, store listing, device checklist)

3 changed paths. `git add` uses directory pathspecs where a whole folder belongs to the block.

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git add -- \
  docs/DEVICE_TEST_CHECKLIST.md \
  docs/RELEASE_RUNBOOK.md \
  docs/STORE_LISTING.md && \
git commit -F - <<'EOF'
docs: release runbook, store listing draft and device test checklist

Written by the release-pack pass. The store listing is a draft; the runbook lists what only the
owner can do (accounts, signing, Supabase SQL, a real-device test).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

<details><summary>Files in this block (3)</summary>

- `??` docs/DEVICE_TEST_CHECKLIST.md
- `??` docs/RELEASE_RUNBOOK.md
- `??` docs/STORE_LISTING.md

</details>

### Block 6: Calculators: no NaN/Infinity

76 changed paths. `git add` uses directory pathspecs where a whole folder belongs to the block.

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git add -- \
  calculators/ && \
git commit -F - <<'EOF'
Calculators: show a dash instead of NaN / Infinity; cap year loops at 100; pin CDN scripts

Found by typing 0, empty, -5, 0.0001 and 1e12 into every box of the 90 calculators. 23 pages
printed NaN or Infinity or froze the tab (a typo such as 2025 years). format() in 55 pages returns
a dash for a non-finite number; multipliers, ratios and growth rates guard their divisor; year
loops are bounded to 100. These pages also carry the pinned Chart.js with integrity.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

<details><summary>Files in this block (76)</summary>

- `M` calculators/banking & fixed income/bond.html
- `M` calculators/banking & fixed income/fd.html
- `M` calculators/banking & fixed income/postoffice.html
- `M` calculators/banking & fixed income/rd.html
- `M` calculators/banking & fixed income/savingsinvestment.html
- `M` calculators/banking & fixed income/scss.html
- `M` calculators/banking & fixed income/ssy.html
- `M` calculators/core-thinking/compounding-visualizer.html
- `M` calculators/core-thinking/financial-age-calculator.html
- `M` calculators/core-thinking/inflation-impact.html
- `M` calculators/core-thinking/money-behavior-analyzer.html
- `M` calculators/core-thinking/opportunity-cost.html
- `M` calculators/core-thinking/purchasing-power-loss.html
- `M` calculators/core-thinking/real-rate-of-return.html
- `M` calculators/core-thinking/risk-vs-reward.html
- `M` calculators/core-thinking/time-value-of-money.html
- `M` calculators/core-thinking/wealth-vs-income-gap.html
- `M` calculators/desi reality check/childedu.html
- `M` calculators/desi reality check/creditaddiction.html
- `M` calculators/desi reality check/emidiease.html
- `M` calculators/desi reality check/govvspvt.html
- `M` calculators/desi reality check/lifestyle.html
- `M` calculators/desi reality check/logkyakahenge.html
- `M` calculators/desi reality check/middleclass.html
- `M` calculators/desi reality check/parental.html
- `M` calculators/desi reality check/shaadicost.html
- `M` calculators/financial health/expenseratio.html
- `M` calculators/financial health/insurancecoverage.html
- `M` calculators/financial health/savings.html
- `M` calculators/investment & wealth/assetalloc.html
- `M` calculators/investment & wealth/cagr.html
- `M` calculators/investment & wealth/dividend.html
- `M` calculators/investment & wealth/etf.html
- `M` calculators/investment & wealth/lupsum.html
- `M` calculators/investment & wealth/mutualfunds.html
- `M` calculators/investment & wealth/portfolio.html
- `M` calculators/investment & wealth/rollingreturns.html
- `M` calculators/investment & wealth/sip-optimizer.html
- `M` calculators/investment & wealth/sip.html
- `M` calculators/investment & wealth/swp.html
- `M` calculators/investment & wealth/taxadj.html
- `M` calculators/investment & wealth/xirr.html
- `M` calculators/loans, debt & emi/car.html
- `M` calculators/loans, debt & emi/creditcard.html
- `M` calculators/loans, debt & emi/education.html
- `M` calculators/loans, debt & emi/emi.html
- `M` calculators/loans, debt & emi/emiprepay.html
- `M` calculators/loans, debt & emi/interest.html
- `M` calculators/loans, debt & emi/loaneligibility.html
- `M` calculators/loans, debt & emi/loantenure.html
- `M` calculators/loans, debt & emi/personal.html
- `M` calculators/loans, debt & emi/prepayinvest.html
- `M` calculators/retirement & life planning/annuity.html
- `M` calculators/retirement & life planning/healthcare.html
- `M` calculators/retirement & life planning/lifeexpentancy.html
- `M` calculators/retirement & life planning/longevity.html
- `M` calculators/retirement & life planning/pensiongap.html
- `M` calculators/retirement & life planning/postretirement.html
- `M` calculators/tax & salary/80c.html
- `M` calculators/tax & salary/captalgains.html
- `M` calculators/tax & salary/gratuity.html
- `M` calculators/tax & salary/hra.html
- `M` calculators/tax & salary/income.html
- `M` calculators/tax & salary/leave.html
- `M` calculators/tax & salary/offercompare.html
- `M` calculators/tax & salary/oldnew.html
- `M` calculators/tax & salary/professional.html
- `M` calculators/tax & salary/shortlong.html
- `M` calculators/trading & markets/breakeven.html
- `M` calculators/trading & markets/brokerage.html
- `M` calculators/trading & markets/futurespl.html
- `M` calculators/trading & markets/margin.html
- `M` calculators/trading & markets/options.html
- `M` calculators/trading & markets/positionsize.html
- `M` calculators/trading & markets/riskper.html
- `M` calculators/trading & markets/volatility.html

</details>

### Block 7: Website: invented figures, escaping, tests

30 changed paths. `git add` uses directory pathspecs where a whole folder belongs to the block.

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git add -- \
  js/finos-home-loan.js \
  js/finos-life-cover.js \
  js/finos-sip-stepup.js \
  js/finos-tax-harvest.js \
  js/finos-credit-score.js \
  js/finos-windfall.js \
  js/finos-net-worth.js \
  js/finos-goal-optimizer.js \
  js/finos-salary-optimizer.js \
  js/explain-my-money.js \
  js/arya-scenarios.js \
  js/arya-life-events.js \
  js/learn-ai.js \
  js/finos-passive-income.js \
  js/insight-cards.js \
  html/insurance-hub.html \
  html/windfall.html \
  html/fd-tracker.html \
  tests/web-qa.test.js \
  tests/rates.test.js \
  js/finos-ppf-tracker.js \
  js/finos-fd-tracker.js \
  js/finos-epf-tracker.js \
  js/finos-crypto-tracker.js \
  js/finos-gold-tracker.js \
  js/goal-auto-fund.js \
  js/mf-intelligence.js \
  js/arya-roadmap.js \
  js/finos-debt-optimizer.js \
  docs/agent-notes/web-qa.md && \
git commit -F - <<'EOF'
Website: stop presenting invented figures as the person's own; escape stored text

- Home loan planner wrote a what-if loan into the shared loan keys on page open; now only after
  "This is my actual home loan". Unknown income gives no affordability verdict.
- Insurance hub, goal optimizer, FIRE card, Arya scenarios and life events no longer fall back to
  an assumed income, age, spend or savings rate; they say what is not recorded.
- Explain My Money: no invented budget (everything was "under budget"), no assumed SIP growth.
  Salary optimizer no longer overwrites a recorded monthly income.
- Windfall uses the shared tax core; tests/rates.test.js is a single table for the PPF, SSY, NSC,
  SCSS, EPF and Post Office MIS rates repeated across 9 places (no rate value changed: please
  check they are still the announced rates); equity LTCG wording 12.5% / Rs 1.25 L.
- Stored nicknames, labels, notes and names are escaped before reaching innerHTML or value="".

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

<details><summary>Files in this block (30)</summary>

- `??` docs/agent-notes/web-qa.md
- `M` html/fd-tracker.html
- `M` html/insurance-hub.html
- `M` html/windfall.html
- `M` js/arya-life-events.js
- `M` js/arya-roadmap.js
- `M` js/arya-scenarios.js
- `M` js/explain-my-money.js
- `M` js/finos-credit-score.js
- `M` js/finos-crypto-tracker.js
- `M` js/finos-debt-optimizer.js
- `M` js/finos-epf-tracker.js
- `M` js/finos-fd-tracker.js
- `M` js/finos-goal-optimizer.js
- `M` js/finos-gold-tracker.js
- `M` js/finos-home-loan.js
- `M` js/finos-life-cover.js
- `M` js/finos-net-worth.js
- `M` js/finos-passive-income.js
- `M` js/finos-ppf-tracker.js
- `M` js/finos-salary-optimizer.js
- `M` js/finos-sip-stepup.js
- `M` js/finos-tax-harvest.js
- `M` js/finos-windfall.js
- `M` js/goal-auto-fund.js
- `M` js/insight-cards.js
- `M` js/learn-ai.js
- `M` js/mf-intelligence.js
- `??` tests/rates.test.js
- `??` tests/web-qa.test.js

</details>

### Block 8: Phone calculators follow the website

18 changed paths. `git add` uses directory pathspecs where a whole folder belongs to the block.

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git add -- \
  mobile/lib/calcs \
  mobile/lib/homeLoan.ts \
  mobile/lib/homeLoanStorage.ts \
  mobile/lib/windfall.ts \
  mobile/lib/retirement.ts \
  mobile/app/tracker/insurance.tsx \
  mobile/__tests__/windfall.parity.test.mts \
  mobile/__tests__/homeLoan.parity.test.mts \
  mobile/__tests__/webCalc.parity.test.mts \
  docs/agent-notes/parity-followup.md && \
git commit -F - <<'EOF'
mobile: follow the website's NaN/Infinity guards, home-loan contract and insurance line changes

- 18 calculators show a dash instead of NaN/Infinity for empty or zero boxes, like the website
- home loan: unknown income gives no affordability verdict; the shared loan keys are written only
  on the explicit "Save as my home loan", together with finos_hl_is_mine
- windfall uses the shared tax core's standard deduction
- insurance: facts re-pointed to the shifted website lines (extract-insurance.py --check passes);
  no assumed income of 50,000 in the coverage gaps
- growth calculator rounds below 1 lakh like the page (regression test added)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

<details><summary>Files in this block (18)</summary>

- `??` docs/agent-notes/parity-followup.md
- `M` mobile/__tests__/homeLoan.parity.test.mts
- `M` mobile/__tests__/webCalc.parity.test.mts
- `M` mobile/__tests__/windfall.parity.test.mts
- `M` mobile/app/tracker/insurance.tsx
- `M` mobile/lib/calcs/banking.ts
- `M` mobile/lib/calcs/desi.ts
- `M` mobile/lib/calcs/fmt.ts
- `M` mobile/lib/calcs/health.ts
- `M` mobile/lib/calcs/invest.ts
- `M` mobile/lib/calcs/loans.ts
- `M` mobile/lib/calcs/retire.ts
- `M` mobile/lib/calcs/think.ts
- `M` mobile/lib/calcs/trade.ts
- `M` mobile/lib/homeLoan.ts
- `M` mobile/lib/homeLoanStorage.ts
- `M` mobile/lib/retirement.ts
- `M` mobile/lib/windfall.ts

</details>

### Block 9: Shared mobile files (search, privacy, Hindi, calendar, dashboard, docs)

26 changed paths. `git add` uses directory pathspecs where a whole folder belongs to the block.

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git add -- \
  mobile/lib/search.ts \
  mobile/lib/privacy.ts \
  mobile/lib/i18nHi.ts \
  mobile/lib/storageKeys.ts \
  mobile/lib/calendar.ts \
  mobile/lib/reminders.ts \
  mobile/lib/calendarStorage.ts \
  "mobile/app/(tabs)/dashboard.tsx" \
  "mobile/app/(tabs)/markets.tsx" \
  mobile/app/settings.tsx \
  mobile/app/privacy.tsx \
  mobile/app/tools/calendar.tsx \
  mobile/app/tools/report.tsx \
  mobile/app.json \
  mobile/package.json \
  mobile/package-lock.json \
  mobile/.expo/types/router.d.ts \
  mobile/__tests__/search.test.mts \
  mobile/__tests__/privacy.test.mts \
  mobile/__tests__/calendar.parity.test.mts \
  mobile/__tests__/reminders.test.mts \
  mobile/README.md \
  docs/MOBILE_APP.md \
  docs/PENDING.md \
  docs/MOBILE_PARITY_TRACKER.xlsx \
  docs/agent-notes/integration.md && \
git commit -F - <<'EOF'
Integrate the October mobile features into the shared files

- Search: Learn (hub + 25 lessons), PULSE, insurance hub, funds, market research, planners,
  feedback, diagnostics, welcome tour; the index guard resolves dynamic routes and checks the
  lesson entries against the bundled manifest.
- Privacy notice: Arya flow describes memory/life-event context (off by default), fund search
  terms and the new providers (mfapi.in, Yahoo company data, news feeds); news-link flow;
  Vibration and run-at-start-up permissions (read from library manifests by a test); data
  inventory for the new keys, with sync wording checked against isSyncKey by a test.
- Calendar and reminders: the person's own dates are a "custom" event type (grid, coming-up,
  reminders; text hidden by default; kept out of the shareable report; one .ics copy).
- Hindi: 221 first-pass entries, marked unreviewed (needs a native speaker).
- Dashboard "Plan, Learn & Research" tiles, market and settings links, real app version.
- Remove unused expo-av; cache-file pattern for the calendar export.
- Docs and the parity tracker updated (48 rows).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

<details><summary>Files in this block (26)</summary>

- `M` docs/MOBILE_APP.md
- `M` docs/MOBILE_PARITY_TRACKER.xlsx
- `M` docs/PENDING.md
- `??` docs/agent-notes/integration.md
- `M` mobile/.expo/types/router.d.ts
- `M` mobile/README.md
- `M` mobile/__tests__/calendar.parity.test.mts
- `M` mobile/__tests__/privacy.test.mts
- `M` mobile/__tests__/reminders.test.mts
- `M` mobile/__tests__/search.test.mts
- `M` mobile/app.json
- `M` mobile/app/(tabs)/dashboard.tsx
- `M` mobile/app/(tabs)/markets.tsx
- `M` mobile/app/privacy.tsx
- `M` mobile/app/settings.tsx
- `M` mobile/app/tools/calendar.tsx
- `M` mobile/app/tools/report.tsx
- `M` mobile/lib/calendar.ts
- `M` mobile/lib/calendarStorage.ts
- `M` mobile/lib/i18nHi.ts
- `M` mobile/lib/privacy.ts
- `M` mobile/lib/reminders.ts
- `M` mobile/lib/search.ts
- `??` mobile/lib/storageKeys.ts
- `M` mobile/package-lock.json
- `M` mobile/package.json

</details>

### Block 10: Backend: income rows only, re-runnable SQL, honest endpoint docs

9 changed paths. `git add` uses directory pathspecs where a whole folder belongs to the block.

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git add -- \
  alerts/health_score.py \
  alerts/schema.sql \
  voiceagent/schema.sql \
  supabase/README.md \
  arya-ai/README.md \
  tests/test_health_income.py \
  tests/test_sql_safety.py \
  tests/test_arya_readme.py \
  docs/agent-notes/backend-web-leftovers.md && \
git commit -F - <<'EOF'
Backend: income rows only, re-runnable SQL, honest endpoint docs

- alerts/health_score.py: _monthly_income counted any positive amount (every expense is stored
  positive) as income. It now uses the same classification as the website's FinosBudget.normalize
  (parity-tested on 600 rows). The couple and benchmark endpoints read it.
- voiceagent/schema.sql no longer drops agent_memories (CREATE TABLE IF NOT EXISTS, missing columns
  added in place); alerts/schema.sql policies are re-creatable; supabase/README.md tells people to
  install delete_my_account() and no longer claims cascades are enough.
- arya-ai/README.md lists every route in server.py, with the gold/silver "not MCX" and FX "not RBI"
  wording. Release runbook and store listing drafts are included.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

<details><summary>Files in this block (9)</summary>

- `M` alerts/health_score.py
- `M` alerts/schema.sql
- `M` arya-ai/README.md
- `??` docs/agent-notes/backend-web-leftovers.md
- `M` supabase/README.md
- `??` tests/test_arya_readme.py
- `??` tests/test_health_income.py
- `??` tests/test_sql_safety.py
- `M` voiceagent/schema.sql

</details>

### Block 11: Website: no invented headlines/figures, honest market labels, PPF 80C, login

12 changed paths. `git add` uses directory pathspecs where a whole folder belongs to the block.

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git add -- \
  html/news.html \
  js/arya-sidebar-panel.js \
  js/finos-health-score.js \
  js/finos-tax-calc.js \
  index.html \
  login.html \
  js/landing.js \
  tests/test_news_page.py \
  tests/market-labels.test.js \
  tests/health-score-shapes.test.js \
  tests/ppf-80c.test.js \
  tests/test_landing_pages.py && \
git commit -F - <<'EOF'
Website: no invented headlines or figures, honest market labels, PPF 80C not double counted, login hardened

- news.html: offline shows the last real headlines with the time they were saved, or says there are
  none; the fabricated "Ghost Protocol" headlines and fake ticker figures are gone.
- Sidebar: gold is read by its current key and labelled as a converted world price; FX is not an
  RBI reference rate.
- Health score: learned modules are counted from the website's object shape (it was always 0); no
  invented Rs 60,000 income (the Wealth pillar says "add your income").
- PPF tracker Tax tab no longer adds the planner's 80C total on top of the PPF deposits it already
  contains (the planner now also stores finos_80c_ppf_nsc_fd).
- index.html: timeline figures corrected and labelled as an illustration; the paycheck example no
  longer shows the person's income. login.html: supabase-js pinned with integrity; submitting
  without the library no longer puts the password in the URL.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

<details><summary>Files in this block (12)</summary>

- `M` html/news.html
- `M` index.html
- `M` js/arya-sidebar-panel.js
- `M` js/finos-health-score.js
- `M` js/finos-tax-calc.js
- `M` js/landing.js
- `M` login.html
- `??` tests/health-score-shapes.test.js
- `??` tests/market-labels.test.js
- `??` tests/ppf-80c.test.js
- `??` tests/test_landing_pages.py
- `??` tests/test_news_page.py

</details>

### Block 12: Wrong-shape localStorage values no longer crash pages; flaky tests fixed

41 changed paths. `git add` uses directory pathspecs where a whole folder belongs to the block.

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git add -- \
  tests/corrupt_json_fuzz.py \
  tests/test_corrupt_json_fuzz.py \
  tests/test_pwa_sw.py \
  tests/test_arya_lazy.py \
  tests/test_a11y_helper.py \
  js/finos-context.js \
  js/finos-personalization.js \
  js/home-focus.js \
  js/profile.js \
  js/sidebar.js \
  js/finos-sip-tracker.js \
  js/finos-calendar.js \
  js/usage-tracker.js \
  js/finos-webauthn.js \
  js/finos-progressive-mode.js \
  js/arya-memory.js \
  js/dna-logic.js \
  js/finos-widget.js \
  js/arya-ai.js \
  js/finos-aa.js \
  js/pwa-init.js \
  js/finos-kite.js \
  js/finos-portfolio-analytics.js \
  js/finos-learn-nav.js \
  js/ui.js \
  js/finos-prefs.js \
  js/settings.js \
  js/sip-intelligence.js \
  js/finos-mobile.js \
  js/trading-simulator.js \
  html/ca-advisor.html \
  html/mindset-sim.html \
  html/trading-brain.html \
  html/dashboard.html \
  html/settings.html \
  html/simulator-landing.html \
  html/track-finances.html \
  html/trading-coach.html \
  html/document-ai.html \
  html/home.html \
  html/import-statement.html && \
git commit -F - <<'EOF'
Wrong-shape localStorage values no longer crash or blank pages; fix the arya-lazy / pwa-sw / a11y-helper flakes

A corrupt-shape fuzz (every known finos_* key x 10 shapes x ~220 pages) found 213 pages that crashed
on load because safeJson returned a string or object where a list was expected, and about 30 more
individual readers. Shape-aware readers and row filters across 41 js files, plus a regression test
(tests/test_corrupt_json_fuzz.py; the full run is tests/corrupt_json_fuzz.py). The two known flaky
tests are fixed at the cause: test_arya_lazy assumed an idle callback had already fired, and
test_pwa_sw periodicsync depended on test order and a fixed 500 ms wait.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

<details><summary>Files in this block (41)</summary>

- `M` html/ca-advisor.html
- `M` html/dashboard.html
- `M` html/document-ai.html
- `M` html/home.html
- `M` html/import-statement.html
- `M` html/mindset-sim.html
- `M` html/settings.html
- `M` html/simulator-landing.html
- `M` html/track-finances.html
- `M` html/trading-brain.html
- `M` html/trading-coach.html
- `M` js/arya-ai.js
- `M` js/arya-memory.js
- `M` js/dna-logic.js
- `M` js/finos-aa.js
- `M` js/finos-calendar.js
- `M` js/finos-context.js
- `M` js/finos-kite.js
- `M` js/finos-learn-nav.js
- `M` js/finos-mobile.js
- `M` js/finos-personalization.js
- `M` js/finos-portfolio-analytics.js
- `M` js/finos-prefs.js
- `M` js/finos-progressive-mode.js
- `M` js/finos-sip-tracker.js
- `M` js/finos-webauthn.js
- `M` js/finos-widget.js
- `M` js/home-focus.js
- `M` js/profile.js
- `M` js/pwa-init.js
- `M` js/settings.js
- `M` js/sidebar.js
- `M` js/sip-intelligence.js
- `M` js/trading-simulator.js
- `M` js/ui.js
- `M` js/usage-tracker.js
- `??` tests/corrupt_json_fuzz.py
- `M` tests/test_a11y_helper.py
- `M` tests/test_arya_lazy.py
- `??` tests/test_corrupt_json_fuzz.py
- `M` tests/test_pwa_sw.py

</details>

### Block 13: Mobile: harden storage readers, backup restore and sync against wrong-shaped data

38 changed paths. `git add` uses directory pathspecs where a whole folder belongs to the block.

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git add -- \
  mobile/lib/safeStore.ts \
  mobile/lib/keyShapes.ts \
  mobile/lib/holdings.ts \
  mobile/lib/trackerSyncEngine.ts \
  mobile/lib/txnStorage.ts \
  mobile/lib/fixedIncome.ts \
  mobile/lib/fixedIncomeStorage.ts \
  mobile/lib/cryptoStorage.ts \
  mobile/lib/goldStorage.ts \
  mobile/lib/recurringStorage.ts \
  mobile/lib/subscriptionsStorage.ts \
  mobile/lib/learn.ts \
  mobile/lib/trackerStorage.ts \
  mobile/lib/retirementStorage.ts \
  mobile/lib/moneyScoreStorage.ts \
  mobile/lib/goalOptimizer.ts \
  mobile/lib/goalOptimizerStorage.ts \
  mobile/lib/leakStorage.ts \
  mobile/lib/nudgesStorage.ts \
  mobile/lib/passive.ts \
  mobile/lib/aryaFactsStorage.ts \
  mobile/lib/creditScoreStorage.ts \
  mobile/lib/debtStorage.ts \
  mobile/lib/itrStorage.ts \
  mobile/lib/lifeCoverStorage.ts \
  mobile/lib/profileStorage.ts \
  mobile/lib/rebalancerStorage.ts \
  mobile/lib/passiveStorage.ts \
  mobile/lib/salaryStorage.ts \
  mobile/lib/taxHarvestStorage.ts \
  mobile/lib/taxPlannerStorage.ts \
  mobile/lib/sipStepupStorage.ts \
  mobile/lib/windfallStorage.ts \
  mobile/hooks/usePersisted.ts \
  mobile/hooks/useHoldings.ts \
  mobile/app/tracker/fixed.tsx \
  docs/agent-notes/mobile-robustness.md \
  mobile/lib/trackers.ts && \
git commit -F - <<'EOF'
Harden phone storage readers, backup restore and sync against wrong-shaped data

Every stored or received value of the wrong shape (null, string, number, list where an object
belongs and the reverse, nested wrong types, NaN / Infinity, huge strings, unparseable JSON) is now
read as "nothing there" with a documented fallback instead of crashing a screen or leaking NaN, and a
failed read is never saved over the person's data.

- lib/safeStore.ts, lib/keyShapes.ts: shared safe parsing, finite coercion, keep-aside of an
  unreadable value before a writer replaces it (finos_sync_never_corrupt_*, device only), expected
  shape per structured key
- read-modify-write stores (transactions, FD, gold, crypto, subscriptions, recurring, calendar dates,
  insurance checks, life events, Arya memory, funds, goals, budgets, holdings): strict read, abort on
  storage failure, keep aside
- readers normalise fields of otherwise valid records (holdings, FD, gold, crypto, goals, policies,
  money score, calendar sources, ...)
- backup restore is all-or-nothing: the whole file is validated first, hostile or damaged files are
  refused with a message, partial writes are rolled back
- tracker sync: damaged bookkeeping no longer stops sync; wrong-kind cloud values are not taken
- backend responses (quote, fund search, sectors, chat stream, price refresh) and the market cache
  are validated; usePersisted types saved calculator inputs against their defaults
- NaN guards: EPF/NPS dates, goal dates, fixed-income totals

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

<details><summary>Files in this block (38)</summary>

- `??` docs/agent-notes/mobile-robustness.md
- `M` mobile/app/tracker/fixed.tsx
- `M` mobile/hooks/useHoldings.ts
- `M` mobile/hooks/usePersisted.ts
- `M` mobile/lib/aryaFactsStorage.ts
- `M` mobile/lib/creditScoreStorage.ts
- `M` mobile/lib/cryptoStorage.ts
- `M` mobile/lib/debtStorage.ts
- `M` mobile/lib/fixedIncome.ts
- `M` mobile/lib/fixedIncomeStorage.ts
- `M` mobile/lib/goalOptimizer.ts
- `M` mobile/lib/goalOptimizerStorage.ts
- `M` mobile/lib/goldStorage.ts
- `M` mobile/lib/holdings.ts
- `M` mobile/lib/itrStorage.ts
- `??` mobile/lib/keyShapes.ts
- `M` mobile/lib/leakStorage.ts
- `M` mobile/lib/learn.ts
- `M` mobile/lib/lifeCoverStorage.ts
- `M` mobile/lib/moneyScoreStorage.ts
- `M` mobile/lib/nudgesStorage.ts
- `M` mobile/lib/passive.ts
- `M` mobile/lib/passiveStorage.ts
- `M` mobile/lib/profileStorage.ts
- `M` mobile/lib/rebalancerStorage.ts
- `M` mobile/lib/recurringStorage.ts
- `M` mobile/lib/retirementStorage.ts
- `??` mobile/lib/safeStore.ts
- `M` mobile/lib/salaryStorage.ts
- `M` mobile/lib/sipStepupStorage.ts
- `M` mobile/lib/subscriptionsStorage.ts
- `M` mobile/lib/taxHarvestStorage.ts
- `M` mobile/lib/taxPlannerStorage.ts
- `M` mobile/lib/trackerStorage.ts
- `M` mobile/lib/trackerSyncEngine.ts
- `M` mobile/lib/trackers.ts
- `M` mobile/lib/txnStorage.ts
- `M` mobile/lib/windfallStorage.ts

</details>

### Block 14: Mobile fuzz test + helpers (WORK IN PROGRESS: 30 readers still fail; consider holding back)

6 changed paths. `git add` uses directory pathspecs where a whole folder belongs to the block.

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git add -- \
  mobile/__tests__/corruptData.test.mts \
  mobile/__tests__/helpers/corpus.mts \
  mobile/__tests__/stubs/react-native.mjs \
  mobile/__tests__/stubs/expo-constants.mjs \
  mobile/__tests__/stubs/empty.mjs \
  mobile/__tests__/alias-hooks.mjs && \
git commit -F - <<'EOF'
test(mobile): table-driven corrupt-data fuzz over every storage reader (work in progress)

__tests__/corruptData.test.mts (170 table-driven cases) with a corpus helper and Node stubs for
react-native / expo-constants. At the time of this commit about 30 reader cases still fail: they are
real defects in readers the hardening commit did not reach (for example loadCalendarSources on a
throwing multiGet, and ids of 1e999). Do not treat npm test as green until they are fixed.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

<details><summary>Files in this block (6)</summary>

- `M` mobile/__tests__/alias-hooks.mjs
- `??` mobile/__tests__/corruptData.test.mts
- `??` mobile/__tests__/helpers/corpus.mts
- `??` mobile/__tests__/stubs/empty.mjs
- `??` mobile/__tests__/stubs/expo-constants.mjs
- `??` mobile/__tests__/stubs/react-native.mjs

</details>

### Block 15: Website accessibility leftovers (UNFINISHED: agent stopped at the usage limit)

22 changed paths. `git add` uses directory pathspecs where a whole folder belongs to the block.

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git add -- \
  css/base.css \
  css/commoditydetail.css \
  css/components.css \
  css/cryptodetail.css \
  css/debtdetail.css \
  css/derivativesdetail.css \
  css/design-tokens.css \
  css/equitydetail.css \
  css/etfdetail.css \
  css/forexdetail.css \
  css/insight-cards.css \
  css/layout.css \
  css/markets-deep.css \
  css/mfdetail.css \
  css/moneydetail.css \
  css/settings.css \
  css/system-leak.css \
  css/tax.css \
  tests/a11y-leftovers.test.js \
  tests/test_a11y_leftovers.py \
  tests/fixtures/a11y-leftovers-finos-a11y.proposed.js \
  docs/agent-notes/web-a11y-leftovers-finos-a11y.diff && \
git commit -F - <<'EOF'
Website accessibility: contrast tokens, landmarks and tests (unfinished pass)

Colour-contrast and axe best-practice fixes in the shared CSS (design tokens and the chapter /
detail page styles), the regression tests, and a proposed patch for js/finos-a11y.js (floating
widgets given landmark roles; kept as a diff because that file was owned by another agent and is
NOT applied). The pass was interrupted by a usage limit: the keyboard / focus-trap / 200% zoom
checks were not completed and the tests have not been run to green after the last edits.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

<details><summary>Files in this block (22)</summary>

- `M` css/base.css
- `M` css/commoditydetail.css
- `M` css/components.css
- `M` css/cryptodetail.css
- `M` css/debtdetail.css
- `M` css/derivativesdetail.css
- `M` css/design-tokens.css
- `M` css/equitydetail.css
- `M` css/etfdetail.css
- `M` css/forexdetail.css
- `M` css/insight-cards.css
- `M` css/layout.css
- `M` css/markets-deep.css
- `M` css/mfdetail.css
- `M` css/moneydetail.css
- `M` css/settings.css
- `M` css/system-leak.css
- `M` css/tax.css
- `??` docs/agent-notes/web-a11y-leftovers-finos-a11y.diff
- `??` tests/a11y-leftovers.test.js
- `??` tests/fixtures/a11y-leftovers-finos-a11y.proposed.js
- `??` tests/test_a11y_leftovers.py

</details>

### Block 16: rag-engine: October 15 health pass (NOT from this session: review the diff first)

10 changed paths. `git add` uses directory pathspecs where a whole folder belongs to the block.

```bash
cd "/Users/vkm/Desktop/Finos/Initial Deployment" && git add -- \
  rag-engine/README.md \
  rag-engine/config.py \
  rag-engine/evaluation/benchmark.py \
  rag-engine/evaluation/benchmark_personal.py \
  rag-engine/evaluation/test_endpoint_signatures.py \
  rag-engine/evaluation/test_prompt_window.py \
  rag-engine/generation/prompt.py \
  rag-engine/server.py \
  rag-engine/start-all.sh \
  rag-engine/storage/redis_cache.py && \
git commit -F - <<'EOF'
rag-engine: Oct 15 2026 health pass (docs, config, prompt window, cache key, benchmarks)

README brought in line with the code (embedding model, chunking, cache TTL, reranker); config,
prompt window, server and cache-key changes; personal and endpoint-signature benchmark tests.
(Written from the diff summary only: check `git diff -- rag-engine` before committing.)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

<details><summary>Files in this block (10)</summary>

- `M` rag-engine/README.md
- `M` rag-engine/config.py
- `M` rag-engine/evaluation/benchmark.py
- `??` rag-engine/evaluation/benchmark_personal.py
- `??` rag-engine/evaluation/test_endpoint_signatures.py
- `??` rag-engine/evaluation/test_prompt_window.py
- `M` rag-engine/generation/prompt.py
- `M` rag-engine/server.py
- `M` rag-engine/start-all.sh
- `M` rag-engine/storage/redis_cache.py

</details>

## C. Uncommitted and still not in any block (4): review by hand

Not committed by any block: two Blueprint PDFs and a rag-engine SQLite index (not from these agents: decide yourself), and this plan file. `??` = new file, `M` = modified.

### NOT from these agents: another session or you; review separately (3)

- `??` FIN-OS_SML_Blueprint.pdf
- `??` docs/FIN-OS_SML_Blueprint.pdf
- `M` rag-engine/rag_bm25.db

### unattributed (likely a leftovers/accessibility agent or another session); review with git diff (1)

- `??` docs/COMMIT_PLAN.md

## D. Never add

`mobile/.release-export-tmp/`, `mobile/.expo/web/cache/`, `.claude/worktrees/` (scratch).
