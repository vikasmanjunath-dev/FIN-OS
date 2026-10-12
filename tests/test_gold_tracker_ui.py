"""Gold tracker: grams are valued only with a price the person typed; no invented MCX rate feeds the net worth."""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

HOLDINGS = [{"id": "a", "type": "physical", "grams": 50, "name": "Bar"},
            {"id": "b", "type": "sgb", "units": 10, "faceValue": 5409, "series": "SGB 2022", "issueDate": "2022-06-01"},
            {"id": "c", "type": "etf", "units": 20, "nav": 68.5},
            {"id": "d", "type": "goldmf", "currentValue": 12000, "fundName": "Gold MF"}]


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def open_page(env, price=None):
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    init = f"localStorage.setItem('finos_gold_portfolio', {json.dumps(json.dumps(HOLDINGS))});"
    if price is not None:
        init += f"localStorage.setItem('finos_gold_price_per_g', '{price}');"
    ctx.add_init_script(init)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{base}/html/gold-tracker.html", wait_until="load")
    pg.wait_for_function("document.querySelector('.gt-holding-card')", timeout=10000)
    return ctx, pg, errors


def test_without_a_price_grams_are_not_valued_and_the_total_leaves_them_out(env):
    ctx, pg, errors = open_page(env)
    total = int(pg.evaluate("localStorage.getItem('finos_gold_value')"))
    assert total == round(20 * 68.5) + 12000, total                      # only the ETF and the fund, which have their own values
    text = pg.inner_text("body")
    assert "Enter today's gold price per gram" in text
    assert pg.locator(".gt-hc-val", has_text="Enter price").count() == 2    # the bar and the SGB
    assert "9500" not in pg.evaluate("localStorage.getItem('finos_gold_price_per_g') || ''")
    assert not errors
    ctx.close()


def test_with_a_price_everything_is_valued(env):
    ctx, pg, errors = open_page(env, price=7000)
    total = int(pg.evaluate("localStorage.getItem('finos_gold_value')"))
    assert total == 50 * 7000 + 10 * 7000 + round(20 * 68.5) + 12000, total
    assert "Enter today's gold price per gram" not in pg.inner_text("body")
    ctx.close()
