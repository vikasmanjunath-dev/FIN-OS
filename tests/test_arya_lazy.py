"""arya-lazy.js: the 470 KB panel must stay off the critical path, yet behave as if it were always there."""
import os
import sys
import threading

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

PANEL = "**/js/arya-sidebar-panel.js"


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def test_panel_loads_after_first_paint_not_during_page_load(env):
    base, browser = env
    pg = browser.new_page()
    pg.goto(f"{base}/html/dashboard.html", wait_until="load")
    pg.wait_for_function("window._aryaLazy && window._aryaLazy.isLoaded()", timeout=10000)
    t = pg.evaluate("""() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const r = performance.getEntriesByType('resource').find(e => e.name.includes('arya-sidebar-panel.js'));
        return { panelStart: r.startTime, loadEnd: nav.loadEventEnd, dcl: nav.domContentLoadedEventEnd };
    }""")
    assert t["panelStart"] >= t["dcl"], t                                # never delays DOMContentLoaded
    assert pg.evaluate("typeof window.AryaSidebar.tools === 'object'")    # the stub was replaced by the real API
    pg.close()


def test_sidebar_arya_click_before_load_opens_the_panel(env):
    base, browser = env
    pg = browser.new_page()
    gate = threading.Event()
    pg.route(PANEL, lambda route: (gate.wait(5), route.continue_()))      # hold the panel script back
    pg.goto(f"{base}/html/dashboard.html", wait_until="domcontentloaded")
    assert pg.evaluate("window._aryaLazy.isLoaded()") is False
    pg.click("#sb-arya-btn", no_wait_after=True)                          # user clicks before the panel exists
    gate.set()
    pg.wait_for_selector("#arya-sp-messages", state="visible", timeout=15000)   # …and it opens as soon as it loads
    pg.close()


def test_calls_made_before_load_are_forwarded(env):
    base, browser = env
    pg = browser.new_page()
    gate = threading.Event()
    pg.route(PANEL, lambda route: (gate.wait(5), route.continue_()))
    pg.goto(f"{base}/html/dashboard.html", wait_until="domcontentloaded")
    pg.evaluate("window.AryaSidebar.open()")                              # stub method → loads, then forwards
    gate.set()
    pg.wait_for_selector("#arya-sp-messages", state="visible", timeout=15000)
    pg.close()


def test_failed_load_can_be_retried(env):
    base, browser = env
    pg = browser.new_page()
    state = {"n": 0}
    def handler(route):
        state["n"] += 1
        route.abort() if state["n"] == 1 else route.continue_()
    pg.route(PANEL, handler)
    pg.goto(f"{base}/html/dashboard.html", wait_until="load")
    pg.wait_for_timeout(3500)                                             # first (aborted) attempt happens at idle
    assert pg.evaluate("window._aryaLazy.isLoaded()") is False
    pg.evaluate("window._aryaLazy.load()")                                # a later trigger retries
    pg.wait_for_function("window._aryaLazy.isLoaded()", timeout=10000)
    pg.close()
