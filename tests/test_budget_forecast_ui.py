"""html/budget-forecast.html: income is not spending, a prediction does not overwrite recorded values, short history is flagged."""
import datetime as dt
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402


@pytest.fixture()
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def month_start(back):
    t = dt.date.today()
    y, m = t.year, t.month - back
    while m <= 0:
        m += 12
        y -= 1
    return dt.date(y, m, 10)


def open_page(env, storage):
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    items = ";".join(f"localStorage.setItem({k!r},{json.dumps(v if isinstance(v, str) else json.dumps(v))})" for k, v in storage.items())
    ctx.add_init_script(f"try{{{items}}}catch(e){{}}")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{base}/html/budget-forecast.html", wait_until="domcontentloaded")
    page.wait_for_selector("#runBtn")
    page.wait_for_function("window.FinosBudget && window.FinosForecast")
    return page, errors


def rows(months, food=5000, with_salary=True, with_sip=True):
    out = []
    for back in months:
        d = month_start(back).isoformat()
        out.append({"type": "debit", "category": "Food & Dining", "amount": food, "date": d})
        if with_salary:
            out.append({"type": "credit", "category": "Salary", "amount": 150000, "date": d})
        if with_sip:
            out.append({"category": "save_sip", "type": "save_sip", "amount": 20000, "date": d})
    return out


def test_salary_and_sip_are_not_forecast_as_spending(env):
    page, errors = open_page(env, {"finos_transactions": rows([1, 2, 3])})
    page.click("#runBtn")
    page.wait_for_function("document.getElementById('runBtn').textContent.includes('Regenerate')")
    assert page.inner_text("#totalAmount").replace(",", "") == "₹5000"
    grid = page.inner_text("#categoryGrid")
    assert "Salary" not in grid and "Income" not in grid and "Savings" not in grid
    assert not errors, errors


def test_prediction_does_not_overwrite_recorded_expense_and_has_its_own_key(env):
    page, _ = open_page(env, {"finos_transactions": rows([1, 2, 3]), "finos_monthly_expense": "42000", "finos_savings_rate": "31"})
    page.click("#runBtn")
    page.wait_for_function("document.getElementById('runBtn').textContent.includes('Regenerate')")
    assert page.evaluate("localStorage.getItem('finos_monthly_expense')") == "42000"
    assert page.evaluate("localStorage.getItem('finos_savings_rate')") == "31"
    assert page.evaluate("localStorage.getItem('finos_forecast_next_month')") == "5000"


def test_prediction_fills_blank_expense_only(env):
    page, _ = open_page(env, {"finos_transactions": rows([1, 2, 3])})
    page.click("#runBtn")
    page.wait_for_function("document.getElementById('runBtn').textContent.includes('Regenerate')")
    assert page.evaluate("localStorage.getItem('finos_monthly_expense')") == "5000"


def test_short_history_is_flagged_not_hidden(env):
    page, _ = open_page(env, {"finos_transactions": rows([1])})
    page.click("#runBtn")
    page.wait_for_function("document.getElementById('runBtn').textContent.includes('Regenerate')")
    assert "only 1 month" in page.inner_text("#sourceNote")
    assert page.inner_text("#totalAmount").replace(",", "") == "₹5000"


def test_income_only_history_says_not_enough_instead_of_zero_forecast(env):
    page, _ = open_page(env, {"finos_transactions": rows([1, 2], with_salary=True, with_sip=False)[1::2]})
    page.click("#runBtn")
    page.wait_for_selector("#forecastResults.active")
    assert "Not enough spending history" in page.inner_text("#totalTitle")
