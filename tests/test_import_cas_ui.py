"""The import dialog's CAS PDF path, with the statement service mocked at the network layer."""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

RESULT = {"source": "cams-kfin", "as_of": "2026-09-30", "warnings": [], "rows": [
    {"name": "Parag Parikh Flexi Cap", "isin": "INF879O01027", "kind": "mf", "qty": 1234.567, "price": 78.9, "value": 97407, "invested": 68148},
    {"name": "HDFC Bank", "isin": "INE040A01034", "kind": "equity", "qty": 10, "price": 1620.25, "value": 16202.5}]}
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*"}


@pytest.fixture()
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def open_dialog(browser, base, handler):
    ctx = browser.new_context()
    pg = ctx.new_page()
    pg.route("**/parse/cas", handler)
    pg.goto(f"{base}/html/net-worth.html", wait_until="domcontentloaded")
    pg.wait_for_function("window.FinosImport && window.FinosAPI")
    pg.evaluate("FinosImport.openDialog()")
    pg.set_input_files("#finos-import-file", {"name": "cas.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4 fake"})
    pg.wait_for_selector("#finos-cas-pw")
    return ctx, pg


def test_pdf_asks_for_password_previews_and_applies(env):
    base, browser = env
    seen = {}

    def ok(route):
        if route.request.method == "OPTIONS":
            return route.fulfill(status=204, headers=CORS)
        seen["body"] = route.request.post_data_buffer or b""
        route.fulfill(status=200, headers={**CORS, "content-type": "application/json"}, body=json.dumps(RESULT))

    ctx, pg = open_dialog(browser, base, ok)
    pg.fill("#finos-cas-pw", "ABCDE1234F"); pg.click("button[type=submit]")
    pg.wait_for_selector("#finos-import-apply")
    text = pg.inner_text("#finos-import-out")
    assert "2 holdings" in text and "Parag Parikh" in text and "as of 2026-09-30" in text and "cas-cams-kfin" in text
    assert b"ABCDE1234F" in seen["body"] and b"%PDF" in seen["body"]            # password and file went to the service
    pg.click("#finos-import-apply")
    pg.wait_for_timeout(300)
    assert pg.evaluate("localStorage.getItem('finos_portfolio_value')") == "16203"
    assert pg.evaluate("localStorage.getItem('finos_mf_import_value')") == "97407"
    assert "ABCDE1234F" not in json.dumps(pg.evaluate("Object.fromEntries(Object.entries(localStorage))"))   # password never persisted
    ctx.close()


def test_wrong_password_shows_the_servers_message_and_allows_retry(env):
    base, browser = env

    def bad(route):
        if route.request.method == "OPTIONS":
            return route.fulfill(status=204, headers=CORS)
        route.fulfill(status=400, headers={**CORS, "content-type": "application/json"}, body=json.dumps({"detail": "Wrong PDF password. CAS files are usually protected with your PAN."}))

    ctx, pg = open_dialog(browser, base, bad)
    pg.fill("#finos-cas-pw", "nope"); pg.click("button[type=submit]")
    pg.wait_for_function("document.getElementById('finos-cas-err').textContent.includes('Wrong PDF password')")
    assert pg.is_enabled("button[type=submit]")                                  # can retry
    assert pg.evaluate("localStorage.getItem('finos_portfolio_value')") is None
    ctx.close()


def test_service_down_gives_a_plain_explanation(env):
    base, browser = env
    ctx, pg = open_dialog(browser, base, lambda route: route.abort())
    pg.fill("#finos-cas-pw", "x"); pg.click("button[type=submit]")
    pg.wait_for_function("document.getElementById('finos-cas-err').textContent.length > 10", timeout=20000)
    assert "document-ai" in pg.inner_text("#finos-cas-err") or "backend" in pg.inner_text("#finos-cas-err")
    ctx.close()
