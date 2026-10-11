"""Trading Brain gets prices from the Arya backend on this machine; the public relay runs only if the person switched it on."""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

CHART = {"symbol": "TCS.NS", "interval": "1d", "closes": [100, 101, 102], "opens": [99, 100, 101], "highs": [101, 102, 103], "lows": [98, 99, 100],
         "volumes": [10, 20, 30], "currentPrice": 102.5}
YAHOO = {"chart": {"result": [{"meta": {"regularMarketPrice": 55.5},
                               "indicators": {"quote": [{"close": [1, 2, 3], "open": [1, 1, 2], "high": [2, 3, 4], "low": [1, 1, 1], "volume": [5, 6, 7]}]}}]}}


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def open_page(env, backend=True, relay_consent=False):
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    if relay_consent:
        ctx.add_init_script("localStorage.setItem('finos_consents', JSON.stringify({relay: {granted: true, v: 1, at: '2026-10-01T00:00:00.000Z'}}));")
    pg = ctx.new_page()
    seen = {"backend": [], "relay": [], "yahoo": []}
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))

    def chart(route):
        seen["backend"].append(route.request.url)
        if backend:
            route.fulfill(status=200, content_type="application/json", body=json.dumps(CHART), headers={"Access-Control-Allow-Origin": "*"})
        else:
            route.abort()

    def relay(route):
        seen["relay"].append(route.request.url)
        route.fulfill(status=200, content_type="application/json", body=json.dumps(YAHOO), headers={"Access-Control-Allow-Origin": "*"})

    pg.route("**/localhost:7475/api/chart**", chart)
    pg.route("**/api.allorigins.win/**", relay)
    pg.route("**/query1.finance.yahoo.com/**", lambda r: (seen["yahoo"].append(r.request.url), r.abort()))
    pg.goto(f"{base}/html/trading-brain.html", wait_until="load")
    pg.wait_for_function("typeof YF !== 'undefined' && window.FinosAPI")
    pg.wait_for_timeout(500)                                         # let the page's own start-up fetches settle
    for k in seen:
        seen[k].clear()
    return ctx, pg, seen, errors


def test_prices_come_from_the_backend_and_no_third_party_is_contacted(env):
    ctx, pg, seen, errors = open_page(env)
    d = pg.evaluate("YF.fetch('TCS.NS', '1d', '3mo')")
    assert d["closes"] == [100, 101, 102] and d["currentPrice"] == 102.5 and d["symbol"] == "TCS.NS"
    assert len(seen["backend"]) == 1 and "symbol=TCS.NS" in seen["backend"][0] and "range=3mo" in seen["backend"][0]
    assert seen["relay"] == [] and seen["yahoo"] == []
    ctx.close()


def test_without_the_backend_and_without_consent_nothing_goes_to_the_relay(env):
    ctx, pg, seen, errors = open_page(env, backend=False)
    msg = pg.evaluate("YF.fetch('TCS.NS').then(() => 'ok', e => e.message)")
    assert "Arya backend" in msg and "Privacy" in msg
    assert seen["relay"] == [] and seen["yahoo"] == []
    ctx.close()


def test_with_consent_and_no_backend_the_relay_is_used(env):
    ctx, pg, seen, errors = open_page(env, backend=False, relay_consent=True)
    d = pg.evaluate("YF.fetch('TCS.NS', '1d', '3mo')")
    assert d["closes"] == [1, 2, 3] and d["currentPrice"] == 55.5
    assert len(seen["relay"]) == 1
    ctx.close()


def test_consent_alone_does_not_bypass_the_backend(env):
    ctx, pg, seen, errors = open_page(env, backend=True, relay_consent=True)
    pg.evaluate("YF.fetch('TCS.NS')")
    assert len(seen["backend"]) == 1 and seen["relay"] == []
    ctx.close()


def test_the_privacy_page_offers_the_relay_switch_off_by_default(env):
    base, browser = env
    ctx = browser.new_context()
    pg = ctx.new_page()
    pg.goto(f"{base}/html/privacy.html", wait_until="load")
    pg.wait_for_selector("#pv-consents")
    text = pg.inner_text("#pv-consents")
    assert "public relay for market data" in text.lower()
    assert pg.evaluate("FinosPrivacy.consent.get('relay')") is False
    ctx.close()
