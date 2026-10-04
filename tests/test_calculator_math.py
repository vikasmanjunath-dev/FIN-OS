"""Calculator numeric accuracy: drive the real pages and compare the displayed results to independent reference formulas.

The page formulas live inline in each calculator, so the only honest test is to run the page. Displayed values are
rounded ("₹1.23 L"), so each comparison allows half the displayed unit step, not a loose percentage.
"""
import os
import re
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

CALC = "calculators"


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def parse_money(text):
    """'₹1.23 L' -> (123000, 500) ; '₹4.5 Cr' -> (45000000, 50000) ; '₹12,345' -> (12345, 0.5). Returns (value, half_step)."""
    m = re.search(r"₹\s*([\d,]+(?:\.\d+)?)\s*(Cr|L)?", text)
    assert m, f"no rupee amount in {text!r}"
    num = float(m.group(1).replace(",", ""))
    unit = {"Cr": 1e7, "L": 1e5, None: 1}[m.group(2)]
    decimals = len(m.group(1).split(".")[1]) if "." in m.group(1) else 0
    return num * unit, 0.5 * unit * 10 ** -decimals if m.group(2) else 0.5


def assert_money(text, expected, label):
    value, half = parse_money(text)
    assert abs(value - expected) <= half + 1e-6, f"{label}: page shows {text!r} (={value:,.2f}), expected {expected:,.2f}"


def open_calc(env, folder, name, **inputs):
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{base}/{CALC}/{folder}/{name}.html", wait_until="domcontentloaded")
    for sel, val in inputs.items():
        pg.fill(f"#{sel}", str(val))   # fill dispatches `input`, which re-runs calculate()
    return ctx, pg, errors


# ── reference formulas (written independently of the pages) ──────────────────────────────────────────────────────
def ref_emi(p, annual, years):
    n, r = years * 12, annual / 1200
    return p / n if r == 0 else p * r * (1 + r) ** n / ((1 + r) ** n - 1)


def ref_sip(m, annual, years):
    n, i = years * 12, annual / 1200
    return m * n if i == 0 else m * ((1 + i) ** n - 1) / i * (1 + i)   # annuity-due: instalment at start of month


EMI_CASES = [(500000, 10.5, 5), (2500000, 8.75, 20), (10000000, 9.0, 30), (100000, 1, 1)]


@pytest.mark.parametrize("p,rate,years", EMI_CASES)
def test_emi(env, p, rate, years):
    ctx, pg, errors = open_calc(env, "loans, debt & emi", "emi", loanNum=p, rateNum=rate, timeNum=years)
    emi = ref_emi(p, rate, years)
    assert_money(pg.inner_text("#emiVal"), round(emi), "EMI")
    assert_money(pg.inner_text("#totalVal"), emi * years * 12, "total payment")
    assert_money(pg.inner_text("#interestVal"), emi * years * 12 - p, "total interest")
    assert not errors
    ctx.close()


@pytest.mark.parametrize("m,rate,years", [(5000, 12, 10), (25000, 14, 20), (500, 6, 1), (100000, 30, 40)])
def test_sip(env, m, rate, years):
    ctx, pg, errors = open_calc(env, "investment & wealth", "sip", monthlyNum=m, rateNum=rate, timeNum=years)
    fv = ref_sip(m, rate, years)
    assert_money(pg.inner_text("#totalVal"), round(fv), "SIP maturity")
    assert_money(pg.inner_text("#investedVal"), m * years * 12, "SIP invested")
    assert_money(pg.inner_text("#returnsVal"), fv - m * years * 12, "SIP returns")
    assert not errors
    ctx.close()


@pytest.mark.parametrize("amount,rate,years", [(100000, 12, 10), (2500000, 7.5, 15), (5000, 1, 1)])
def test_lumpsum(env, amount, rate, years):
    ctx, pg, errors = open_calc(env, "investment & wealth", "lupsum", amountNum=amount, rateNum=rate, timeNum=years)
    fv = amount * (1 + rate / 100) ** years
    assert_money(pg.inner_text("#totalVal"), round(fv), "lumpsum maturity")
    assert_money(pg.inner_text("#returnsVal"), round(fv - amount), "lumpsum gains")
    assert not errors
    ctx.close()


@pytest.mark.parametrize("deposit,rate,years", [(100000, 7, 5), (1000000, 7.25, 3), (50000, 3, 10)])
def test_fd_quarterly_compounding(env, deposit, rate, years):
    ctx, pg, errors = open_calc(env, "banking & fixed income", "fd", depositNum=deposit, rateNum=rate, timeNum=years)
    maturity = deposit * (1 + rate / 400) ** (4 * years)    # Indian banks compound FDs quarterly
    assert_money(pg.inner_text("#maturityVal"), maturity, "FD maturity")
    assert_money(pg.inner_text("#interestVal"), maturity - deposit, "FD interest")
    assert not errors
    ctx.close()


# ── edge cases a user can reach by typing into the number box (the slider minimum is 1, the box is not) ──────────
def shows_nan_or_infinity(pg, *ids):
    return any(re.search(r"NaN|Infinity", pg.inner_text(f"#{i}")) for i in ids)


def test_emi_zero_rate_is_loan_divided_by_months(env):
    ctx, pg, errors = open_calc(env, "loans, debt & emi", "emi", loanNum=600000, rateNum=0, timeNum=5)
    assert not shows_nan_or_infinity(pg, "emiVal", "totalVal", "interestVal"), pg.inner_text("#emiVal")
    assert_money(pg.inner_text("#emiVal"), 10000, "0% EMI")
    assert_money(pg.inner_text("#interestVal") if "₹0" not in pg.inner_text("#interestVal") else "₹0", 0, "0% interest")
    ctx.close()


def test_sip_zero_rate_is_just_the_contributions(env):
    ctx, pg, errors = open_calc(env, "investment & wealth", "sip", monthlyNum=5000, rateNum=0, timeNum=10)
    assert not shows_nan_or_infinity(pg, "totalVal", "investedVal", "returnsVal"), pg.inner_text("#totalVal")
    assert_money(pg.inner_text("#totalVal"), 600000, "0% SIP maturity")
    ctx.close()


# ── sweep: no calculator may ever print NaN / Infinity, at defaults or with every rate box typed to 0 ─────────────
def _all_calculator_pages():
    root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), CALC)
    out = []
    for folder in sorted(os.listdir(root)):
        d = os.path.join(root, folder)
        if os.path.isdir(d):
            out += [(folder, f[:-5]) for f in sorted(os.listdir(d)) if f.endswith(".html")]
    return out


BAD = re.compile(r"NaN|Infinity|undefined")


@pytest.mark.parametrize("folder,name", _all_calculator_pages())
def test_no_nan_at_defaults_or_zero_rate(env, folder, name):
    ctx, pg, errors = open_calc(env, folder, name)
    pg.wait_for_timeout(150)
    assert not BAD.search(pg.inner_text("body")), f"{folder}/{name} shows a bad value at its defaults"
    rate_ids = pg.evaluate(
        "[...document.querySelectorAll('input[type=number]')].filter(e => /rate|return|inflation|interest|roi/i.test(e.id)).map(e => e.id)")
    for rid in rate_ids:   # set directly: some rate boxes sit in hidden tabs, which a real fill() cannot reach
        pg.evaluate("""id => { const e = document.getElementById(id); e.value = '0';
            e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); }""", rid)
    if rate_ids:
        pg.wait_for_timeout(150)
        assert not BAD.search(pg.inner_text("body")), f"{folder}/{name} shows a bad value with {rate_ids} = 0"
    assert not errors, errors
    ctx.close()
