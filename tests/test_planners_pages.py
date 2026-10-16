"""html/benchmarking.html and html/financial-report.html: no sample figures in place of the person's own, no unsourced peer claims."""
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


def visit(env, name):
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    page.goto(f"{base}/html/{name}.html", wait_until="domcontentloaded")
    page.wait_for_timeout(1500)
    return page


def test_benchmarking_offline_shows_no_sample_figures(env):
    text = visit(env, "benchmarking").inner_text("body")
    assert "Demo mode" not in text
    assert "28%" not in text and "top 25%" not in text
    assert "SEBI" not in text and "RBI Household" not in text
    assert "rule-of-thumb" in text


def test_report_offline_shows_no_sample_report(env):
    text = visit(env, "financial-report").inner_text("body")
    assert "64" not in text.split("Health Score")[-1][:80] or "could not be loaded" in text
    assert "could not be loaded" in text
    assert "Solid foundation" not in text and "currently at 2.1 months" not in text
