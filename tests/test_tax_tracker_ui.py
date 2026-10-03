"""tax.html: the Live Tax Savings Tracker must model the old regime honestly, and coexist with the Tax Planner module."""
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


def open_tax(browser, base):
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{base}/html/tax.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#tst-income", state="attached")
    return ctx, pg, errors


def calculate(pg, income):
    pg.fill("#tst-income", str(income))
    pg.evaluate("window._tstCalculate()")
    pg.wait_for_selector("#tst-sections")
    pg.wait_for_function("document.getElementById('tst-sections').innerText.toLowerCase().includes('deduction headroom')")


def test_18_lakh_new_regime_wins_and_says_so(env):
    base, browser = env
    ctx, pg, errors = open_tax(browser, base)
    calculate(pg, 1800000)
    sec = pg.inner_text("#tst-sections")
    grid = pg.inner_text("#tst-grid")
    assert "new regime is cheaper by ₹1.3 L" in sec            # 2,80,800 − 1,50,800
    assert "even if you max out 80C, 80D and NPS" in sec
    assert "₹6.4 L" in sec                                      # deductions the old regime would need to catch up
    assert "₹1.5 L" in grid and "new regime" in grid            # current tax ₹1,50,800 under the new regime
    assert "₹0" in grid                                         # potential saving: nothing, deductions can't help
    assert "NaN" not in sec + grid and "undefined" not in sec + grid
    assert errors == []


def test_rows_are_honest_about_what_applies(env):
    base, browser = env
    ctx, pg, errors = open_tax(browser, base)
    calculate(pg, 1800000)
    sec = pg.inner_text("#tst-sections")
    assert "80C (ELSS/PPF/LIC)" in sec and "₹0 headroom left" in sec        # ₹1.5L already used at this income
    assert "Depends on interest paid" in sec                               # 80E has no cap — no invented number
    assert "only if you pay rent" in sec and "only if you have a home loan" in sec
    assert "old regime only" in sec.lower()
    assert errors == []


def test_8_lakh_pays_nothing_in_the_new_regime(env):
    base, browser = env
    ctx, pg, errors = open_tax(browser, base)
    calculate(pg, 800000)
    sec = pg.inner_text("#tst-sections")
    assert "new regime is cheaper by ₹18K" in sec
    assert "₹2.5 L" in sec                                      # old regime needs ₹2.5L of deductions to reach nil tax
    stored = json.loads(pg.evaluate("localStorage.getItem('finos_tax_savings')"))
    assert stored["current_tax"] == 0 and stored["potential"] == 0 and stored["regime"] == "new"
    assert stored["break_even_deductions"] == 250000 and stored["income"] == 800000
    assert errors == []


def test_fy_badge_and_both_tax_modules_load_together(env):
    base, browser = env
    ctx, pg, errors = open_tax(browser, base)
    assert "2025" in pg.inner_text("#tst-fy-badge") and "2024" not in pg.inner_text("#tst-fy-badge")
    pg.wait_for_function("window.FinosTaxCalc && window.FinosTaxCore", timeout=8000)
    assert pg.evaluate("typeof FinosTaxCalc.renderPlanner") == "function"     # the Tax Planner's global survived
    assert pg.evaluate("typeof FinosTaxCore.savingsPlan") == "function"
    assert errors == []


def test_planner_has_no_cliff_at_the_rebate_limit(env):
    base, browser = env
    ctx, pg, errors = open_tax(browser, base)
    pg.wait_for_function("window.FinosTaxCalc", timeout=8000)
    t = pg.evaluate("[1275000, 1275001, 1280000].map(i => Math.round(FinosTaxCalc.compute({income: i}).newRegime.income_tax))")
    assert t[0] == 0 and t[1] <= 2 and t[2] == 5200             # ₹5,000 over the limit costs ₹5,000 + cess; used to jump 0 → ₹62,400 at +₹1
    assert errors == []


def test_below_threshold_income_asks_for_input(env):
    base, browser = env
    ctx, pg, errors = open_tax(browser, base)
    pg.fill("#tst-income", "50000")
    pg.evaluate("window._tstCalculate()")
    assert "enter your annual income" in pg.inner_text("#tst-arya").lower()
    assert errors == []
