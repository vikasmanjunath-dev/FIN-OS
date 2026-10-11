"""NPS tracker: the tax benefit is worked out on the person's income with the shared FY 2025-26 tax core, not a picked slab."""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402
from test_tax_consistency_ui import ref_new, ref_old  # noqa: E402


def deductions(regime, emp_m, er_m, basic, other80c, govt):
    old = regime == "old"
    emp_a, er_a = emp_m * 12, er_m * 12
    c1_limit = min(150000 - other80c, basic * 0.10) if old and basic > 0 else 0
    c1 = min(emp_a, max(c1_limit, 0))
    c1b = min(max(emp_a - c1, 0), 50000) if old else 0
    rate = 0.14 if regime == "new" or govt else 0.10
    c2 = min(er_a, basic * rate) if basic > 0 else 0
    return round(c1), round(c1b), round(c2)


def expected_saving(regime, income, emp_m, er_m, basic, other80c=0, govt=False):
    c1, c1b, c2 = deductions(regime, emp_m, er_m, basic, other80c, govt)
    old = regime == "old"
    base = max(0, income - (50000 if old else 75000) - (other80c if old else 0))
    f = ref_old if old else ref_new
    return f(base) - f(max(0, base - c1 - c1b - c2)), (c1, c1b, c2)


SCENARIOS = [
    ("old", 2000000, 5000, 0, 1000000, 0),           # 80CCD(1) fills, nothing left for (1B); top slab
    ("old", 1500000, 10000, 3000, 800000, 100000),   # shares the 80C ceiling with 1L already used; employer part too
    ("old", 600000, 4000, 0, 400000, 0),             # sits across the 5L rebate edge
    ("old", 1200000, 8000, 0, 0, 0),                 # no basic salary: only 80CCD(1B) can apply
    ("new", 1500000, 5000, 6000, 1000000, 0),        # new regime: only the employer's 80CCD(2)
    ("new", 900000, 5000, 6000, 1000000, 0),         # under the 87A limit: nothing to save
    ("new", 1290000, 5000, 20000, 1000000, 0),       # marginal relief zone just over 12L
]


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def open_nps(env, keys):
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    ctx.add_init_script("".join(f"localStorage.setItem({json.dumps(k)}, {json.dumps(str(v))});" for k, v in keys.items()))
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{base}/html/nps-tracker.html", wait_until="load")
    pg.wait_for_function("window.FinosNPSTracker && window.FinosTaxCore")
    return ctx, pg, errors


def seed(regime, income, emp_m, er_m, basic, other80c=0, govt=False, slab=None):
    k = {"finos_nps_tax_regime": regime, "finos_nps_emp_monthly": emp_m, "finos_nps_er_monthly": er_m, "finos_nps_basic_annual": basic or "",
         "finos_nps_other_80c_used": other80c, "finos_nps_govt_employer": "yes" if govt else "no"}
    if income:
        k["finos_nps_income_annual"] = income
    if slab is not None:
        k["finos_nps_tax_slab"] = slab
    return k


@pytest.mark.parametrize("regime,income,emp_m,er_m,basic,other80c", SCENARIOS)
def test_saving_is_the_drop_in_real_tax_and_the_rows_add_up(env, regime, income, emp_m, er_m, basic, other80c):
    want, (c1, c1b, c2) = expected_saving(regime, income, emp_m, er_m, basic, other80c)
    ctx, pg, errors = open_nps(env, seed(regime, income, emp_m, er_m, basic, other80c))
    c = pg.evaluate("FinosNPSTracker._compute()")
    assert c["taxExact"] is True
    assert c["taxSaved"] == want, (c["taxSaved"], want)
    # the Tax Savings tab shows the same total, and its three rows sum to it
    pg.evaluate("document.body.insertAdjacentHTML('beforeend', '<div id=probe></div>'); FinosNPSTracker.renderTax(document.getElementById('probe'))")
    hero = pg.inner_text("#probe .nps-tax-hero")
    assert f"{want:,}" in hero or want == 0, hero
    rows = pg.evaluate("[...document.querySelectorAll('#probe > div')].filter(d => d.style.gridTemplateColumns && d.children.length === 4 && d.querySelector('b,div') && d.children[3]).map(d => d.children[3].innerText)")
    nums = [int("".join(ch for ch in r if ch.isdigit()) or 0) for r in rows if "₹" in r]
    assert sum(nums) == want, (nums, want)
    assert not errors
    ctx.close()


def test_without_income_the_slab_estimate_is_used_and_labelled(env):
    ctx, pg, errors = open_nps(env, seed("old", 0, 5000, 0, 1000000, slab=20))
    c = pg.evaluate("FinosNPSTracker._compute()")
    assert c["taxExact"] is False
    assert c["taxSaved"] == round(60000 * 20 / 100 * 1.04)
    assert not errors
    ctx.close()


def test_tracked_monthly_income_is_used_when_the_field_is_blank(env):
    keys = seed("old", 0, 5000, 0, 1000000)
    keys["finos_monthly_income"] = 150000                  # 18L a year
    want, _ = expected_saving("old", 1800000, 5000, 0, 1000000)
    ctx, pg, errors = open_nps(env, keys)
    c = pg.evaluate("FinosNPSTracker._compute()")
    assert c["taxExact"] is True and c["taxSaved"] == want
    ctx.close()


def test_changing_the_income_field_updates_the_headline(env):
    ctx, pg, errors = open_nps(env, seed("old", 0, 5000, 0, 1000000, slab=5))
    before = pg.inner_text("#nps-tax-disp")
    want, _ = expected_saving("old", 2000000, 5000, 0, 1000000)
    pg.evaluate("_npsAutoSave('finos_nps_income_annual', '2000000')")
    pg.wait_for_function(f"document.getElementById('nps-tax-disp').innerText !== {json.dumps(before)}")
    assert pg.inner_text("#nps-tax-disp") == "₹" + f"{want:,}"
    assert pg.inner_text("#nps-tax-basis") == "Worked out on your income"
    assert not errors
    ctx.close()
