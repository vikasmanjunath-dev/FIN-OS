"""Calculator AI explainer (js/calc-explainer.js) must not hammer Ollama.

It used to start an Ollama stream from four independent triggers (calculate() hook, result observer, change events,
first paint) with no debounce, so one slider drag meant dozens of overlapping generations of a 14B model.
Now every trigger funnels into one debounced scheduler, unchanged numbers are not re-explained, a newer request
cancels the one still streaming, and recent explanations are memoised. Ollama is mocked; Chart.js is stubbed
(no network in the test), the rest is the real page.
"""
import json
import re
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

PAGE = "calculators/investment%20%26%20wealth/sip.html"
CHART_STUB = "window.Chart=class{constructor(){this.data={datasets:[{}]};this.options={};}update(){}destroy(){}};"


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def _open(env):
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    pg = ctx.new_page()
    hits = []

    def generate(route):
        hits.append(route.request.post_data)
        body = "\n".join(json.dumps({"response": t, "done": False}) for t in ["Aapka ", "SIP ", "ok."]) + "\n"
        route.fulfill(status=200, content_type="application/x-ndjson", body=body,
                      headers={"access-control-allow-origin": "*"})

    def other(route):
        url = route.request.url
        if url.startswith(base):
            if url.split("?")[0].endswith(".html"):
                # The stub below is not the real library, so it cannot match the page's integrity hash: drop it here.
                resp = route.fetch()
                body = re.sub(r'\s+integrity="[^"]*"', "", resp.text())
                return route.fulfill(response=resp, body=body)
            return route.continue_()
        if "chart" in url.lower():
            return route.fulfill(status=200, content_type="application/javascript", body=CHART_STUB)
        return route.abort()

    pg.route("**/*", other)
    pg.route("**/api/generate", generate)
    pg.goto(f"{base}/{PAGE}", wait_until="load")
    pg.wait_for_timeout(4000)
    return ctx, pg, hits


def _set_monthly(pg, value, also_change=False):
    pg.evaluate(
        """([v, ch]) => { const e = document.getElementById('monthly'); e.value = v;
             e.dispatchEvent(new Event('input', { bubbles: true }));
             if (ch) e.dispatchEvent(new Event('change', { bubbles: true })); }""",
        [str(value), also_change],
    )


def test_page_load_makes_a_single_explain_request(env):
    ctx, pg, hits = _open(env)
    try:
        assert len(hits) == 1, f"expected exactly one explain request at load, got {len(hits)}"
        assert "Aapka SIP ok." in pg.inner_text("#arya-calc-body")
    finally:
        ctx.close()


def test_slider_burst_collapses_to_one_request(env):
    ctx, pg, hits = _open(env)
    try:
        before = len(hits)
        for i in range(12):
            _set_monthly(pg, 5000 + i * 1000)
            pg.wait_for_timeout(50)
        pg.wait_for_timeout(3500)
        assert len(hits) - before == 1, f"12 rapid changes made {len(hits) - before} Ollama requests, expected 1"
        # the one request carries the FINAL numbers, not an intermediate tick
        assert "monthly: 16000" in hits[-1]
    finally:
        ctx.close()


def test_unchanged_numbers_are_not_re_explained_and_old_values_come_from_memo(env):
    ctx, pg, hits = _open(env)
    try:
        _set_monthly(pg, 9000, also_change=True)
        pg.wait_for_timeout(2500)
        n = len(hits)
        _set_monthly(pg, 9000, also_change=True)          # same numbers again
        pg.wait_for_timeout(2500)
        assert len(hits) == n, "re-explained identical inputs"
        _set_monthly(pg, 5000, also_change=True)          # the value the page loaded with: already explained
        pg.wait_for_timeout(2500)
        assert len(hits) == n, "memoised explanation was regenerated"
        assert "Aapka SIP ok." in pg.inner_text("#arya-calc-body")
    finally:
        ctx.close()
