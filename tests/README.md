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
