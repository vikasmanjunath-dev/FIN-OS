# FIN-OS Test Suite

> pytest · Unit tests for the Alert Engine  
> **Updated:** July 2026

---

## What's Tested

This suite covers the `alerts/` module — the most logic-heavy backend in FIN-OS.

| File | Tests | What's verified |
|---|---|---|
| `test_health_score.py` | Health Score computation | Pillar scoring, edge cases, boundary values |
| `test_rules.py` | Alert rule logic | All 10 rule classes fire / don't fire correctly |

---

## Running Tests

```bash
# From the project root (Initial Deployment/)
cd "Initial Deployment"

# Install test dependencies (already in alerts/requirements.txt)
pip install pytest pytest-cov

# Run all tests
pytest tests/

# Run with coverage report
pytest tests/ --cov=alerts --cov-report=term-missing

# Run a specific file
pytest tests/test_health_score.py -v

# Run a specific test
pytest tests/test_rules.py::test_sip_missed_fires -v
```

---

## Test Structure

### `conftest.py`

Shared pytest configuration:
- Adds project root to `sys.path` so `from rules import ...` and `from health_score import ...` resolve correctly
- Shared fixtures: `sample_user_data`, `sample_transactions`, `sample_goals`

### `test_health_score.py`

Tests for `alerts/health_score.py`:

| Test | Scenario |
|---|---|
| `test_perfect_score` | User with 6-month emergency fund, 30% savings rate, no debt → score ≥ 90 |
| `test_zero_emergency_fund` | Emergency fund = 0 → pillar contributes 0 |
| `test_high_debt_burden` | EMI/income = 70% → score heavily penalised |
| `test_missing_insurance` | No term or health insurance → insurance pillar = 0 |
| `test_benchmark_comparison` | Score compared against peer percentile |

### `test_rules.py`

Tests for `alerts/rules.py` — one test per rule:

| Test | Rule | Scenario |
|---|---|---|
| `test_sip_missed_fires` | `SIP_MISSED` | SIP date passed, no matching transaction |
| `test_sip_not_fired_if_transacted` | `SIP_MISSED` | SIP date passed, transaction exists → no alert |
| `test_salary_credited` | `SALARY_CREDITED` | Large income credit detected |
| `test_market_drop` | `MARKET_DROP` | Nifty mock falls 3.5% |
| `test_goal_behind` | `GOAL_BEHIND` | Current savings insufficient for deadline |
| `test_cc_bill_due` | `CC_BILL_DUE` | Mocked bill due in 2 days |
| `test_budget_overrun` | `BUDGET_OVERRUN` | Category spend > 90% of budget |
| `test_emergency_fund_low` | `EMERGENCY_FUND_LOW` | Fund < 3 months expenses |
| `test_tax_season_march` | `TAX_SEASON` | Date = March, ITR reminder fires |
| `test_networth_milestone` | `NETWORTH_MILESTONE` | Net worth crosses ₹10L |
| `test_cooldown_respected` | All | Rule does not fire again within cooldown window |

---

## Adding New Tests

For a new alert rule `MY_RULE` in `alerts/rules.py`:

```python
# tests/test_rules.py

def test_my_rule_fires(sample_user_data):
    from rules import MyRule
    rule = MyRule()
    user_data = {**sample_user_data, "my_trigger_field": trigger_value}
    alert = rule.evaluate(user_data)
    assert alert is not None
    assert alert["rule_id"] == "MY_RULE"
    assert alert["priority"] in ("critical", "warning", "info", "celebration")

def test_my_rule_does_not_fire(sample_user_data):
    from rules import MyRule
    rule = MyRule()
    alert = rule.evaluate(sample_user_data)  # no trigger
    assert alert is None
```

---

## CI Integration

Tests are standalone — no external services (Supabase, yfinance, Ollama) are called. All external dependencies are mocked in `conftest.py`.

To add to a CI pipeline:

```yaml
# .github/workflows/test.yml (example)
- run: pip install pytest
- run: pytest tests/ --tb=short
```

---

## Front-end & platform suites (added Oct 2026)

Everything below runs without a backend. Browser tests use the Chromium that Playwright installed
(`pip install playwright && playwright install chromium`) and a throwaway local static server; they **skip** (not fail) when
Playwright/Chromium/axe-core is missing.

| Command | What it covers |
|---|---|
| `npm run check` | search-index freshness + the 7 static audits below (no browser, ~15 s) |
| `npm test` | all JS unit tests + all pytest files (alerts backend + browser suites) |
| `TZ=Asia/Kolkata node --test tests/*.test.js` | JS unit tests in the user's timezone (calendar/IST date bugs) |
| `python3 tests/perf_budget.py` | JS bytes per page vs `perf_budget.json` (`--update` to re-baseline) |
| `python3 tests/mobile_check.py` | every page at 375px: horizontal overflow (fails) and tap targets under 24px (reported) |
| `python3 tests/csp_check.py` | every page under the production CSP; lists violations (add `--drop unsafe-eval` to test a stricter policy) |
| `python3 tests/smoke_pages.py` | opens every page (≈207) in dark **and** light; fails on JS errors, 404s, failed local requests (~14 min) |
| `npm i --no-save axe-core && python3 -m pytest tests/test_a11y.py` | axe-core accessibility gate on 16 key pages × 2 themes |

### `static_audit.py` (stdlib only — `python3 tests/static_audit.py [check]`)

| Check | Fails when |
|---|---|
| `tokens` | a page loads CSS out of canonical order, misses `design-tokens.css`/`theme.css`, or re-declares shared theme tokens locally |
| `links` | a local `href`/`src` points at a file that doesn't exist |
| `search` | a page in `html/` or `calculators/` is not reachable from `js/finos-search.js` (fix: `npm run index`) |
| `js` | any `js/*.js` or inline `<script>` fails `node --check` |
| `ids` | duplicate `id=""` within a page |
| `routes` | a `vercel.json` rewrite/redirect destination file doesn't exist |
| `secrets` | API keys / private keys / Supabase `service_role` JWTs in browser-shipped files |

### JS unit tests (`node --test`)

| File | Module |
|---|---|
| `store.test.js` | `finos-store.js` — safe JSON, aliases, migrations, backup/restore, quota failures |
| `api.test.js` | `finos-api.js` — base-URL resolution, retries (never for writes), typed errors, timeouts |
| `format.test.js` | `finos-format.js` — lakh/crore grouping, compact units, shorthand parsing, FY labels |
| `montecarlo.test.js` | `finos-montecarlo.js` — seeded determinism, analytic cases, monotonicity, SIP solver |
| `import.test.js` | `finos-import.js` — Zerodha / Groww / generic broker CSV parsing |
| `taxdates.test.js` | `finos-taxdates.js` — rule-based tax calendar never runs dry |
| `calendar.test.js` | `finos-calendar.js` — SIP events, IST-safe dates |
| `reminders.test.js` | `finos-reminders.js` — lead times, dedupe, background snapshot merge |
| `guardrails.test.js` | `arya-guardrails.js` — flags buy/sell calls, guarantees; no false positives on education |
| `pulse-rank.test.js` | `arya-pulse-rank.js` — PULSE widget ranking + "since last visit" diff |
| `i18n.test.js` | `finos-i18n.js` + Hindi table + Hindi number units |
| `budget.test.js` | `finos-budget.js` — normalizes 4 transaction shapes, status/pace states, suggestions, once-per-level alerts |
| `contrast.test.js` | `finos-contrast.js` — AA colour maths, hue-preserving fixes, gradient estimation |
| `vault.test.js` | `finos-vault.js` — AES-GCM lock/unlock, wrong passcode, tampering, failed self-check loses nothing |

### Browser suites (pytest + Playwright)

| File | What it proves |
|---|---|
| `test_arya_tools_eval.py` | Arya's calculators match independent maths (SIP, EMI, inflation); retirement odds are monotonic |
| `test_pwa_sw.py` | real `sw.js`: install, stale-while-revalidate, `periodicsync` reminders from IndexedDB, offline fallback |
| `test_arya_lazy.py` | the 470 KB Arya panel loads after DOMContentLoaded yet works the instant it is needed |
| `test_a11y.py` / `test_a11y_helper.py` | axe rules at zero; skip link; chart names; slider labels |
| `test_i18n_dom.py` | Hindi UI translates, restores exactly, never touches user data |
| `test_voice_journal.py` | voice/quick-log phrases → expense / saving / income |
| `test_budget_ui.py` | budget card reads mixed-shape transactions, limits persist, alerts fire once per level |
| `test_cas_import.py` | CAS mapping (real casparser models), error handling, `/parse/cas` endpoint — run with `casparser` + `python-multipart` installed for full coverage |
| `test_import_cas_ui.py` | import dialog's PDF path with the statement service mocked |
| `test_vault_e2e.py` | lock really empties storage and halts the page; unlock, multi-tab lock, idle lock, erase |

