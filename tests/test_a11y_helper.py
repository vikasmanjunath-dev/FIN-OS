"""finos-a11y.js behaviours that axe doesn't assert: skip link, chart names, labels from visible text, idempotence."""
import os
import sys
from urllib.parse import quote

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402


@pytest.fixture(scope="module")
def page():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        pg = browser.new_page()
        pg.goto(f"{base}/{quote('calculators/investment & wealth/sip.html')}", wait_until="domcontentloaded")
        pg.wait_for_function("window.FinosA11y", timeout=15000)
        pg.wait_for_timeout(800)
        yield pg
        browser.close()


def test_slider_and_number_get_names_from_the_visible_label(page):
    assert page.get_attribute("#monthly", "aria-label") == "Monthly Investment (₹) (slider)"
    assert page.get_attribute("#monthlyNum", "aria-label") == "Monthly Investment (₹) (value)"


def test_first_tab_stop_is_the_skip_link_and_it_moves_focus_to_main(page):
    page.keyboard.press("Tab")
    assert page.evaluate("document.activeElement.id") == "finos-skip-link"
    page.keyboard.press("Enter")
    assert page.evaluate("document.activeElement.matches('main, .main, [role=main]')")


def test_canvas_charts_are_named(page):
    n = page.evaluate("document.querySelectorAll('canvas').length")
    unnamed = page.evaluate("[...document.querySelectorAll('canvas')].filter(c => !c.getAttribute('aria-label') && c.getAttribute('aria-hidden') !== 'true').length")
    assert n > 0 and unnamed == 0


def test_running_twice_changes_nothing(page):
    before = page.evaluate("document.body.innerHTML.length")
    page.evaluate("window.FinosA11y.run(); window.FinosA11y.run();")
    assert page.evaluate("document.querySelectorAll('#finos-skip-link').length") == 1
    assert page.evaluate("document.body.innerHTML.length") == before
