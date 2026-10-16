"""html/life-goals-planner.html: no invented profile, shared savings, escaped goal names, results + saved totals."""
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


THREE = [
    {"name": "Own Home", "target": 8000000, "target_date": "2100-01-01"},
    {"name": "Education", "target": 2500000, "target_date": "2100-01-01"},
    {"name": "Retirement Corpus", "target": 50000000, "target_date": "2100-01-01"},
]


def open_page(env, storage=None, goals=THREE):
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    storage = dict(storage or {})
    if goals is not None:
        storage["finos_goals"] = json.dumps(goals)
    if storage:
        items = ";".join(f"localStorage.setItem({k!r},{v!r})" for k, v in storage.items())
        ctx.add_init_script(f"try{{{items}}}catch(e){{}}")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{base}/html/life-goals-planner.html", wait_until="domcontentloaded")
    page.wait_for_selector("#genBtn")
    return page, errors


def fill_profile(page, age="30", income="100000", savings="0", surplus="40000", retire="58", ret="12"):
    page.fill("#inRetireAge", retire)
    page.fill("#inReturn", ret)
    page.fill("#inAge", age)
    page.fill("#inIncome", income)
    page.fill("#inSavings", savings)
    page.fill("#inSurplus", surplus)


def test_profile_starts_blank_and_asks_for_it(env):
    page, errors = open_page(env)
    for sel in ("#inAge", "#inIncome", "#inSavings", "#inSurplus"):
        assert page.input_value(sel) == "", f"{sel} was pre-filled with an invented value"
    page.click("#genBtn")
    assert page.locator("#validationError").is_visible()
    assert "age" in page.inner_text("#validationError").lower()
    assert not page.locator("#results.active").count()
    assert page.evaluate("localStorage.getItem('finos_goals_monthly_sip')") is None
    assert not errors, errors


def test_known_age_and_income_prefill_and_are_flagged(env):
    page, _ = open_page(env, {"finos_age": "34", "finos_monthly_income": "150000"})
    assert page.input_value("#inAge") == "34"
    assert page.input_value("#inIncome") == "150000"
    assert "Pre-filled" in page.inner_text(".hero")


def test_generate_shows_roadmap_and_saves_totals(env):
    page, errors = open_page(env)
    fill_profile(page, savings="900000")
    page.click("#genBtn")
    page.wait_for_selector("#results.active")
    assert page.locator(".phase-card").count() >= 4
    saved = int(page.evaluate("localStorage.getItem('finos_goals_monthly_sip')"))
    assert saved > 0 and saved % 500 == 0
    assert int(page.evaluate("localStorage.getItem('finos_goals_count')")) == 3
    # savings above the 6-month fund (900,000 - 360,000) are mentioned once, not per goal
    assert "of savings above your emergency fund" in page.inner_text("#summaryStrip")
    assert not errors, errors


def test_more_savings_never_raise_the_sip_needed(env):
    page, _ = open_page(env)
    fill_profile(page, savings="0")
    page.click("#genBtn")
    page.wait_for_selector("#results.active")
    none = int(page.evaluate("localStorage.getItem('finos_goals_monthly_sip')"))
    page.fill("#inSavings", "2000000")
    page.click("#genBtn")
    page.wait_for_function("document.getElementById('genBtn').textContent.includes('Regenerate')")
    rich = int(page.evaluate("localStorage.getItem('finos_goals_monthly_sip')"))
    assert rich < none


def test_goal_names_are_escaped_everywhere(env):
    page, errors = open_page(env)
    fill_profile(page, savings="500000")
    page.fill("#g-name-1", '<img src=x onerror="window.__pwn=1">')
    page.click("#genBtn")
    page.wait_for_selector("#results.active")
    page.wait_for_timeout(300)
    assert page.evaluate("window.__pwn") is None
    assert page.locator("#goalsOverview img").count() == 0
    assert page.locator("#phasesContainer img").count() == 0
    assert "<img" in page.inner_text("#goalsOverview")
    assert not errors, errors


def test_no_goals_recorded_means_one_empty_row_not_demo_goals(env):
    page, _ = open_page(env, goals=None)
    assert page.locator(".goal-row").count() == 1
    assert page.input_value("#g-name-1") == ""
    assert page.input_value("#g-amt-1") == ""


def test_return_and_retirement_age_are_never_assumed(env):
    page, _ = open_page(env)
    assert page.input_value("#inReturn") == ""
    assert page.input_value("#inRetireAge") == ""
    fill_profile(page, savings="0", ret="")
    page.click("#genBtn")
    assert "return" in page.inner_text("#validationError").lower()
    assert not page.locator("#results.active").count()


def test_zero_return_and_zero_inflation_are_honoured(env):
    page, errors = open_page(env, goals=[{"name": "Car", "target": 1200000, "target_date": "2100-01-01"}])
    page.fill("#g-yrs-1", "10")
    page.fill("#g-inf-1", "0")
    fill_profile(page, savings="0", ret="0")
    page.click("#genBtn")
    page.wait_for_selector("#results.active")
    # 12 lakh over 120 months with nothing earned: 10,000 a month
    assert int(page.evaluate("localStorage.getItem('finos_goals_monthly_sip')")) == 10000
    assert not errors, errors


def test_income_band_savings_and_net_worth_are_not_guessed(env):
    page, _ = open_page(env, {"finos_income": "1L-2.5L", "finos_net_worth": "9000000"})
    assert page.input_value("#inIncome") == ""
    assert page.input_value("#inSurplus") == ""
    assert page.input_value("#inSavings") == ""


def test_roadmap_has_no_fixed_advice(env):
    page, _ = open_page(env)
    fill_profile(page, savings="900000")
    page.click("#genBtn")
    page.wait_for_selector("#results.active")
    text = page.inner_text("#phasesContainer")
    for banned in ("Nifty", "FlexiCap", "ELSS", "8,000", "Small Cap", "floater", "SWR"):
        assert banned not in text, banned
