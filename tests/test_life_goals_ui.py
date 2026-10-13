"""html/life-goals-planner.html: no invented profile, shared savings, escaped goal names, results + saved totals."""
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


def open_page(env, storage=None):
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    if storage:
        items = ";".join(f"localStorage.setItem({k!r},{v!r})" for k, v in storage.items())
        ctx.add_init_script(f"try{{{items}}}catch(e){{}}")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{base}/html/life-goals-planner.html", wait_until="domcontentloaded")
    page.wait_for_selector("#genBtn")
    return page, errors


def fill_profile(page, age="30", income="100000", savings="0", surplus="40000"):
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
