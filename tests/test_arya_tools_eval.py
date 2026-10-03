"""
Arya tool eval — runs Arya's deterministic tools inside a real browser page and checks them against
independent Python calculations. No LLM or backend is needed: these are the "hands" of the agent,
and a wrong number here becomes a confidently wrong answer in chat.

    python3 -m pytest tests/test_arya_tools_eval.py -q

Skips cleanly if Playwright / Chromium isn't installed.
"""
import datetime as dt
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
playwright_sync = pytest.importorskip("playwright.sync_api")

from smoke_pages import static_server  # noqa: E402  (reuses the throwaway local server)


@pytest.fixture(scope="module")
def page():
    with static_server() as base, playwright_sync.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch()
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        ctx = browser.new_context()
        pg = ctx.new_page()
        pg.goto(f"{base}/html/dashboard.html", wait_until="domcontentloaded")
        pg.wait_for_function("window.AryaSidebar && window.AryaSidebar.tools", timeout=20000)
        yield pg
        browser.close()


def tool(page, name, args=None):
    return page.evaluate("([n, a]) => window.AryaSidebar.tools.execute(n, a)", [name, args or {}])


def seed(page, **kv):
    page.evaluate("(kv) => { localStorage.clear(); for (const k in kv) localStorage.setItem(k, kv[k]); }", kv)


def inr_short(n):  # mirror of the tools' own display rule (L / K)
    if n >= 1e7:
        return f"₹{n / 1e7:.1f} Cr"
    if n >= 1e5:
        return f"₹{n / 1e5:.1f} L"
    return f"₹{round(n / 1e3)}K"


# ── calculators vs independent maths ─────────────────────────────────────────
def test_calc_sip_matches_annuity_due_formula(page):
    seed(page)
    r = 0.12 / 12
    fv = 10000 * ((1 + r) ** 120 - 1) / r * (1 + r)
    out = tool(page, "calc_sip", {"amount": 10000, "years": 10, "rate": 12})
    assert f"Corpus: {inr_short(fv)}" in out, out


def test_calc_emi_matches_standard_formula(page):
    seed(page)
    P, r, n = 5_000_000, 0.085 / 12, 240
    emi = P * r * (1 + r) ** n / ((1 + r) ** n - 1)
    out = tool(page, "calc_emi", {"principal": P, "annual_rate": 8.5, "years": 20})
    assert f"EMI: {inr_short(emi)}/month" in out, out
    assert f"Interest cost: {inr_short(emi * n - P)}" in out, out


def test_calc_inflation_real_value(page):
    seed(page)
    out = tool(page, "calc_inflation", {"amount": 100000, "years": 10, "rate": 6})
    assert f"Real value: {inr_short(100000 / 1.06 ** 10)}" in out, out


# ── planning tools backed by FIN-OS modules ──────────────────────────────────
def retire_seed(**extra):
    base = dict(
        finos_retire_current_age="32", finos_retire_age="58", finos_retire_exp_mo="60000",
        finos_sip_value="2500000", finos_epf_value="1200000", finos_ppf_value="600000", finos_gold_value="300000",
        finos_retire_monthly_invest="30000", finos_retire_stepup="8",
    )
    base.update({k: str(v) for k, v in extra.items()})
    return base


def odds(out):
    line = next(l for l in out.splitlines() if l.startswith("PROBABILITY"))
    return int(line.split(":")[1].strip().rstrip("%"))


def test_retirement_odds_is_sane_and_monotonic(page):
    seed(page, **retire_seed())
    base = odds(tool(page, "retirement_odds"))
    assert 80 <= base <= 100, base
    higher_spend = odds(tool(page, "retirement_odds", {"monthly_expense": 150000}))
    assert higher_spend < base, (higher_spend, base)
    later = odds(tool(page, "retirement_odds", {"retire_age": 65}))
    assert later >= base - 3, (later, base)          # working longer should not make it materially worse
    no_saving = odds(tool(page, "retirement_odds", {"monthly_invest": 0, "monthly_expense": 150000}))
    assert no_saving <= higher_spend + 3, (no_saving, higher_spend)


def test_retirement_odds_solver_reports_a_sip(page):
    seed(page, **retire_seed(finos_retire_monthly_invest=5000))
    out = tool(page, "retirement_odds", {"target_odds": 85})
    assert "Monthly investment needed for 85% odds" in out or "not possible" in out, out


def test_retirement_odds_with_no_data_asks_for_data(page):
    seed(page)
    out = tool(page, "retirement_odds")
    assert "No holdings" in out, out


def test_tax_dates_lists_next_advance_tax(page):
    seed(page)
    today = dt.date.today()
    out = tool(page, "tax_dates", {"days": 400})
    assert "incometax.gov.in" in out                  # carries the verify caveat
    assert "Advance Tax" in out and "ITR filing deadline" in out
    year = today.year if today.month >= 4 else today.year - 1
    assert f"{year + 1}-03-15" in out or f"{year}-12-15" in out or f"{year + 1}-06-15" in out


def test_upcoming_dates_finds_a_renewal_in_three_days(page):
    due = dt.date.today() + dt.timedelta(days=3)
    seed(page, finos_insurance_policies='[{"name":"Term Plan","type":"life","premium":24000,"renewal_date":"%s"}]' % due.isoformat())
    out = tool(page, "upcoming_dates", {"days": 10})
    assert "Term Plan Renewal" in out and due.isoformat() in out, out


# ── guardrails are actually loaded in the page ───────────────────────────────
def test_guardrails_loaded_and_blocking(page):
    r = page.evaluate("() => window.AryaGuardrails && window.AryaGuardrails.apply('how to evade tax', 'x')")
    assert r and r["blocked"] is True
    r = page.evaluate("() => window.AryaGuardrails.apply('which stock?', 'You should buy TCS shares now.')")
    assert "direct_recommendation" in r["flags"]


def test_budget_status_reads_mixed_transaction_shapes(page):
    today = dt.date.today()
    d = lambda n: dt.date(today.year, today.month, min(n, 28)).isoformat()
    txns = [
        {"amount": 9200, "category": "need_food", "type": "need_food", "date": d(2)},
        {"id": "a", "type": "debit", "category": "Shopping", "desc": "AMAZON", "amount": 8300, "date": d(3)},
        {"id": "v", "type": "income", "category": "investment", "description": "SIP", "amount": 5000, "date": d(1)},
    ]
    seed(page, finos_transactions=json.dumps(txns), finos_budgets=json.dumps({"limits": {"Food & Dining": 10000, "Shopping": 8000}}))
    out = tool(page, "budget_status")
    assert "₹17,500 spent" in out, out
    assert "Shopping: ₹8,300 / ₹8,000" in out and "OVER by ₹300" in out, out
    assert "5,000" not in out and "SIP:" not in out, out    # the ₹5,000 SIP is never counted as spending
    assert "pace" not in out or dt.date.today().day >= 7, out    # no meaningless pace figures in the first week
    seed(page)
    assert "No expenses logged" in tool(page, "budget_status")
