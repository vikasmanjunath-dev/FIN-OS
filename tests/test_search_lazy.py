"""The search palette's page index (~50 KB) loads the first time search is opened, not on every page's critical path."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def open_page(env, page="html/home.html", block_index=False):
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    errors, fetched = [], []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("request", lambda r: fetched.append(r.url))
    if block_index:
        pg.route("**/finos-search-index.js*", lambda route: route.abort())
    pg.goto(f"{base}/{page}", wait_until="load")
    pg.wait_for_selector("#fs-toggle", state="attached")
    return ctx, pg, errors, fetched


def test_the_index_is_not_fetched_until_search_is_opened(env):
    ctx, pg, errors, fetched = open_page(env)
    pg.wait_for_timeout(2500)
    assert not [u for u in fetched if "finos-search-index.js" in u], "the index must not load with the page"
    assert pg.evaluate("window.FinosSearchIndex === undefined")
    pg.click("#fs-toggle")
    pg.wait_for_function("Array.isArray(window.FinosSearchIndex) && window.FinosSearchIndex.length > 100")
    assert len([u for u in fetched if "finos-search-index.js" in u]) == 1
    assert not errors
    ctx.close()


def test_typing_finds_pages_from_the_curated_and_the_generated_parts(env):
    ctx, pg, errors, _ = open_page(env)
    pg.click("#fs-toggle")
    pg.fill("#fs-input", "money score")
    pg.wait_for_selector("#fs-dropdown .fs-item")
    items = pg.locator("#fs-dropdown .fs-item .fs-item-title").all_inner_texts()
    assert any("Money Score" in t for t in items), items
    pg.fill("#fs-input", "feedback")
    pg.wait_for_function("[...document.querySelectorAll('#fs-dropdown .fs-item-title')].some(e => /Feedback/.test(e.innerText))")
    pg.fill("#fs-input", "zzzzqqqq")
    pg.wait_for_selector("#fs-dropdown .fs-empty")
    assert "No results" in pg.inner_text("#fs-dropdown")
    assert not errors
    ctx.close()


def test_typing_straight_after_opening_still_gets_results(env):
    """The keyboard shortcut opens search and the first character can arrive before the index has."""
    ctx, pg, errors, _ = open_page(env)
    pg.focus("body")
    pg.keyboard.press("/")
    pg.wait_for_function("document.activeElement && document.activeElement.id === 'fs-input'")      # the box takes focus a moment after opening
    pg.keyboard.type("emi", delay=0)                                                               # ...usually before the index has arrived
    pg.wait_for_selector("#fs-dropdown .fs-item")
    assert pg.locator("#fs-dropdown .fs-item").count() >= 1
    assert not errors
    ctx.close()


def test_if_the_index_cannot_load_search_says_so_and_does_not_throw(env):
    ctx, pg, errors, _ = open_page(env, block_index=True)
    pg.click("#fs-toggle")
    pg.fill("#fs-input", "tax")
    pg.wait_for_function("document.querySelector('#fs-dropdown').innerText.includes('could not load')")
    assert not errors
    ctx.close()
