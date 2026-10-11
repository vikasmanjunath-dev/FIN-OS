"""Every tax number a user can see must agree with the shared FY 2025-26 rules (js/finos-taxcore.js).

The expected values come from an independent Python implementation of the rules, not from the code under test. This file is
the guard against a calculator quietly keeping its own, older copy of the slabs, which two headline pages did.
"""
import math
import os
import re
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

NEW_SLABS = [(0, 400000, 0.0), (400000, 800000, 0.05), (800000, 1200000, 0.10), (1200000, 1600000, 0.15),
             (1600000, 2000000, 0.20), (2000000, 2400000, 0.25), (2400000, math.inf, 0.30)]
OLD_SLABS = [(0, 250000, 0.0), (250000, 500000, 0.05), (500000, 1000000, 0.20), (1000000, math.inf, 0.30)]


def _slab(income, slabs):
    return sum((min(income, hi) - lo) * rate for lo, hi, rate in slabs if income > lo)


def _round(x):                       # JavaScript's Math.round: halves go up
    return int(math.floor(x + 0.5))


def ref_new(taxable):
    t = max(0, taxable)
    tax = 0 if t <= 1200000 else min(_slab(t, NEW_SLABS), t - 1200000)       # Sec 87A with marginal relief
    return _round(tax * 1.04)


def ref_old(taxable):
    t = max(0, taxable)
    tax = 0 if t <= 500000 else _slab(t, OLD_SLABS)                          # Sec 87A: nil up to 5L, no marginal relief
    return _round(tax * 1.04)


def digits(text):
    return int(re.sub(r"[^\d]", "", text) or 0)


# Salary → ₹12L taxable is exactly ₹12.75L gross; the points around it and the slab edges are where bugs hide.
INCOMES = [300000, 700000, 775000, 1000000, 1200000, 1275000, 1275100, 1280000, 1300000, 1500000, 1800000,
           2000000, 2400000, 2475000, 3000000, 5000000]


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def open_calc(env, name):
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{base}/calculators/tax%20%26%20salary/{name}.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#incomeNum")
    return ctx, pg, errors


def set_val(pg, sel, v):
    """sel is '#id'. getElementById, because ids like '80cNum' start with a digit and are not valid CSS selectors."""
    pg.evaluate("([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', {bubbles: true})); }", [sel.lstrip('#'), str(v)])


@pytest.mark.parametrize("gross", INCOMES)
def test_income_tax_estimator_matches_the_fy2025_26_new_regime(env, gross):
    ctx, pg, errors = open_calc(env, "income")
    set_val(pg, "#otherNum", 0)
    set_val(pg, "#incomeNum", gross)
    assert digits(pg.inner_text("#taxableVal")) == max(0, gross - 75000)
    assert digits(pg.inner_text("#taxVal")) == ref_new(gross - 75000), f"gross {gross}"
    assert not errors
    ctx.close()


def test_income_tax_estimator_adds_other_income_before_the_standard_deduction(env):
    ctx, pg, errors = open_calc(env, "income")
    set_val(pg, "#incomeNum", 1000000)
    set_val(pg, "#otherNum", 500000)
    assert digits(pg.inner_text("#taxVal")) == ref_new(1500000 - 75000)
    ctx.close()


def test_a_ten_lakh_salary_pays_no_tax_which_is_what_the_old_slabs_got_wrong(env):
    ctx, pg, errors = open_calc(env, "income")
    set_val(pg, "#otherNum", 0)
    set_val(pg, "#incomeNum", 1000000)
    assert digits(pg.inner_text("#taxVal")) == 0            # the FY2023-24 slabs this page used to carry charged ₹44,200
    ctx.close()


def test_tax_does_not_jump_at_the_rebate_limit(env):
    ctx, pg, errors = open_calc(env, "income")
    set_val(pg, "#otherNum", 0)
    seen = []
    for gross in (1275000, 1275001, 1275100):
        set_val(pg, "#incomeNum", gross)
        seen.append(digits(pg.inner_text("#taxVal")))
    assert seen[0] == 0
    assert seen[1] <= 2 and seen[2] <= 110, seen            # a ₹1 raise costs about ₹1, never ₹62,400
    ctx.close()


@pytest.mark.parametrize("gross", INCOMES)
def test_old_vs_new_matches_both_regimes(env, gross):
    ctx, pg, errors = open_calc(env, "oldnew")
    set_val(pg, "#incomeNum", gross)                          # default deductions: 80C ₹1.5L, 80D ₹25K, HRA/home loan ₹1L
    assert digits(pg.inner_text("#newTaxVal")) == ref_new(gross - 75000), f"new, gross {gross}"
    assert digits(pg.inner_text("#oldTaxVal")) == ref_old(gross - 50000 - 150000 - 25000 - 100000), f"old, gross {gross}"
    verdict = pg.inner_text("#verdictVal")
    new, old = ref_new(gross - 75000), ref_old(gross - 50000 - 275000)
    assert ("New Regime Saves" in verdict) == (new < old) and ("Old Regime Saves" in verdict) == (old < new)
    assert not errors
    ctx.close()


def test_old_vs_new_caps_80c_and_80d_at_their_legal_limits(env):
    ctx, pg, errors = open_calc(env, "oldnew")
    set_val(pg, "#incomeNum", 2500000)
    set_val(pg, "#80cNum", 500000)                            # typed past the ₹1.5L limit
    set_val(pg, "#80dNum", 400000)                            # typed past the ₹1L the page allows
    set_val(pg, "#hraNum", 0)
    assert digits(pg.inner_text("#oldTaxVal")) == ref_old(2500000 - 50000 - 150000 - 100000)
    ctx.close()


@pytest.mark.parametrize("name", ["income", "oldnew"])
def test_pages_say_fy_2025_26_and_never_the_old_year(env, name):
    ctx, pg, errors = open_calc(env, name)
    text = pg.inner_text("main")
    assert "FY 2025-26" in text and "2024-25" not in text
    assert "Surcharge" in text                                # says plainly what is not modelled
    ctx.close()


# ── the tax dossier (dashboard and CA advisor) ────────────────────────────────────────────────────────────────
def test_tax_dossier_uses_the_same_rules_and_has_no_cliff_at_the_rebate_limit(env):
    base, browser = env
    ctx = browser.new_context()
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{base}/html/dashboard.html", wait_until="load")
    pg.wait_for_function("window.FinosTaxDossier && window.FinosTaxCore")

    def dossier(monthly):
        return pg.evaluate("(m) => { const d = window.FinosTaxDossier.build({ budget_tracker: { income_monthly: m } }); return { newTax: d.new_regime.incomeTax, newTaxable: d.new_regime.taxable, oldTax: d.old_regime.incomeTax, oldTaxable: d.old_regime.taxable }; }", monthly)

    for monthly in (30000, 80000, 100000, 106250, 150000, 250000):
        d = dossier(monthly)
        assert d["newTax"] == ref_new(monthly * 12 - 75000), monthly
        assert d["oldTax"] == ref_old(monthly * 12 - 50000), monthly
    assert dossier(106250)["newTax"] == 0                                    # ₹12.75L: taxable exactly ₹12L
    assert dossier(106251)["newTax"] == ref_new(1200012)                          # ₹12 over the limit costs ₹12 of tax (relief caps tax at the excess), not ₹62,400
    assert not errors
    ctx.close()


# ── Arya: the core is loaded wherever the sidebar is, and its tax tools agree with it ────────────────────────
def arya_page(env, init=""):
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    if init:
        ctx.add_init_script(init)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{base}/html/dashboard.html", wait_until="domcontentloaded")
    pg.wait_for_function("window.AryaSidebar && window.AryaSidebar.tools", timeout=20000)
    return ctx, pg, errors


def run_tool(pg, name, args=None):
    return pg.evaluate("([n, a]) => window.AryaSidebar.tools.execute(n, a)", [name, args or {}])


def test_the_lazy_loader_brings_the_tax_core_before_the_panel(env):
    ctx, pg, errors = arya_page(env)
    assert pg.evaluate("typeof window.FinosTaxCore.taxNew") == "function"
    assert pg.evaluate("window.FinosTaxCore.taxNew(1200000)") == 0
    ctx.close()


def test_optimize_tax_says_deductions_do_not_help_when_the_new_regime_already_wins(env):
    ctx, pg, errors = arya_page(env)
    pg.evaluate("localStorage.clear()")
    out = run_tool(pg, "optimize_tax", {"annual_income": 1800000})
    new, old_now = ref_new(1800000 - 75000), ref_old(1800000 - 50000 - min(150000, 0.12 * 1800000))
    assert f"New regime: ₹{new / 1e5:.1f} L" in out or f"₹{new:,}" in out or "NEW regime is already cheaper" in out
    assert "NEW regime is already cheaper" in out and "would NOT lower your tax" in out
    assert "Marginal rate" not in out                         # the made-up ladder is gone
    assert "TOTAL ADDITIONAL TAX SAVINGS" not in out
    ctx.close()


def test_optimize_tax_for_a_twelve_lakh_earner_never_promises_a_saving(env):
    ctx, pg, errors = arya_page(env)
    pg.evaluate("localStorage.clear()")
    out = run_tool(pg, "optimize_tax", {"annual_income": 1275000})
    assert "would NOT lower your tax" in out and "less tax" not in out      # no per-deduction saving is shown when none exists
    ctx.close()


def test_optimize_tax_without_an_income_asks_for_one_instead_of_guessing(env):
    ctx, pg, errors = arya_page(env)
    pg.evaluate("localStorage.clear()")
    out = run_tool(pg, "optimize_tax", {})
    assert "I need your annual income" in out and "₹0" not in out
    ctx.close()


def test_calc_nps_is_honest_about_a_deduction_that_does_not_help(env):
    ctx, pg, errors = arya_page(env, "localStorage.setItem('finos_monthly_income','150000');")
    out = run_tool(pg, "calc_nps", {"contribution": 50000})
    assert "Tax saving: ₹0 for you" in out and "80CCD(2)" in out
    assert "Marginal tax rate" not in out and "instant" not in out
    ctx.close()


def test_the_tax_optimizer_widget_shows_the_cheaper_regime_not_a_made_up_marginal_rate(env):
    ctx, pg, errors = arya_page(env, "localStorage.setItem('finos_monthly_income','150000');localStorage.setItem('finos_income','2.5L+');")
    pg.evaluate("AryaSidebar.open()")
    pg.click("[data-view='pulse']")
    pg.wait_for_selector("#arya-pulse-container .apl-lab-section")
    text = pg.evaluate("[...document.querySelectorAll('#arya-pulse-container .apl-lab-section')].map(e => e.innerText).filter(t => t.includes('Tax Optimizer'))[0] || ''")
    assert "Cheaper regime" in text and "Marginal rate" not in text
    assert "already cheaper for you" in text and "would not lower your tax" in text
    assert not errors
    ctx.close()


def inr_short(n):                     # arya-life-events.js's own display rule
    if n >= 1e7:
        return f"₹{n / 1e7:.1f} Cr"
    if n >= 1e5:
        return f"₹{n / 1e5:.1f} L"
    if n >= 1e3:
        return f"₹{round(n / 1e3)}K"
    return f"₹{round(n):,}"


def advance_tax_message(env, income_monthly):
    """Fix the clock to 10 June (advance-tax season, not the March 80C branch), scan, and return the tax_season nudge text."""
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.clock.install(time="2026-06-10T10:00:00")
    pg.goto(f"{base}/html/track-finances.html", wait_until="domcontentloaded")
    pg.wait_for_function("window.FinosLifeEvents && window.FinosTaxCore", timeout=25000)
    pg.evaluate("localStorage.removeItem('arya_life_event_cooldowns'); Object.keys(localStorage).filter(k => /life|cooldown/i.test(k)).forEach(k => localStorage.removeItem(k));")
    msg = pg.evaluate("""(inc) => new Promise(res => {
        document.addEventListener('arya-life-event', e => { const t = e.detail.allTriggered.find(x => x.id === 'tax_season'); res(t ? t.msg : null); }, { once: true });
        window.FinosLifeEvents.scan({ budget_tracker: inc === null ? {} : { income_monthly: inc }, profile: {} });
        setTimeout(() => res('NO-EVENT'), 1500);
      })""", income_monthly)
    ctx.close()
    return msg, errors


def test_advance_tax_nudge_quarter_estimate_is_the_cheaper_regime_from_the_core(env):
    monthly = 200000                                              # ₹24L a year
    annual = monthly * 12
    tax = min(ref_new(annual - 75000), ref_old(annual - 50000 - 150000))
    msg, errors = advance_tax_message(env, monthly)
    assert f"roughly {inr_short(round(tax / 4))} is quarter" in msg, (msg, tax)
    assert "Advance tax deadline" in msg
    assert not errors


def test_advance_tax_nudge_says_nothing_taxable_for_an_income_that_owes_nothing(env):
    msg, errors = advance_tax_message(env, 80000)                 # ₹9.6L a year: nil under the new regime
    assert "abhi koi tax nahi banta" in msg and "roughly" not in msg
    assert not errors


def test_advance_tax_nudge_without_an_income_gives_no_made_up_amount(env):
    msg, errors = advance_tax_message(env, None)
    assert "₹10,000 se zyada" in msg and "roughly" not in msg and "₹0" not in msg
    assert not errors
