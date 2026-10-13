"""html/real-estate.html: the three calculators run on js/finos-real-estate.js and show consistent results."""
import os
import re
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402


@pytest.fixture()
def page_env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{base}/html/real-estate.html", wait_until="domcontentloaded")
        page.wait_for_selector(".re-calc-btn")
        yield page, errors
        browser.close()


def inr(text):
    return int(re.sub(r"[^\d]", "", text))


def test_buy_vs_rent_shows_one_winner_and_a_matching_break_even(page_env):
    page, errors = page_env
    page.click("text=Calculate 20-Year Comparison")
    page.wait_for_selector("#bvr-result .re-winner")
    text = page.inner_text("#bvr-result")
    assert "wins by" in text
    # default scenario: rent is far cheaper than the EMI, so renting and investing wins and buying never catches up
    assert "RENTING" in text
    assert "not within 20" in text.lower() or "does not catch up" in text.lower()
    assert not errors, errors


def test_the_old_tax_benefit_default_of_350000_is_gone_and_claiming_it_helps_the_buyer(page_env):
    page, _ = page_env
    assert page.locator("#tax-benefit").get_attribute("type") == "checkbox"
    page.click("text=Calculate 20-Year Comparison")
    page.wait_for_selector("#bvr-result .re-winner")
    base_nw = inr(page.locator("#bvr-result .re-row-total").first.inner_text())
    page.check("#tax-benefit")
    page.select_option("#tax-bracket", "30")
    page.click("text=Calculate 20-Year Comparison")
    claimed = inr(page.locator("#bvr-result .re-row-total").first.inner_text())
    assert claimed > base_nw


def test_cheap_rent_vs_expensive_loan_flips_with_inputs(page_env):
    page, _ = page_env
    # high rent, low investment return, strong appreciation: buying should win
    page.fill("#rent", "70000")
    page.fill("#invest-ret", "6")
    page.fill("#prop-app", "9")
    page.click("text=Calculate 20-Year Comparison")
    page.wait_for_selector("#bvr-result .re-winner")
    assert "BUYING" in page.inner_text("#bvr-result")


def test_true_cost_and_yield_tabs(page_env):
    page, errors = page_env
    page.click(".re-tab >> nth=1")
    page.click("text=Show True Cost")
    page.wait_for_selector("#tco-result .re-metric-grid")
    t = page.inner_text("#tco-result")
    assert "₹90,92,000" in t                       # 80 L + 6% stamp + 1% reg + 0.5% of 64 L + 5 L furnishing
    assert "loan interest not included" in t
    page.click(".re-tab >> nth=2")
    page.click("text=Analyse This Investment")
    page.wait_for_selector("#ry-result .re-metric-grid")
    y = page.inner_text("#ry-result")
    assert "4.32%" in y and "3.52%" in y
    assert not errors, errors
