"""html/news.html: no fabricated headlines or market figures when the feed is offline; last real answer with its time."""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

INTEL = "http://localhost:5002/api/intel"
OLD_FAKE = ["Nifty hits record high", "RBI maintains repo rate", "Ethereum gas fees", "Bitcoin surges past key resistance"]


@pytest.fixture()
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def open_news(base, ctx, intel):
    """intel: None -> service unreachable; dict -> served as JSON."""
    page = ctx.new_page()

    def handle(route):
        url = route.request.url
        if url.startswith(INTEL):
            if intel is None:
                return route.abort()
            return route.fulfill(status=200, content_type="application/json",
                                 headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(intel))
        if url.startswith(base):
            return route.continue_()
        return route.abort()

    page.route("**/*", handle)
    page.goto(f"{base}/html/news.html", wait_until="domcontentloaded")
    page.wait_for_timeout(1800)
    return page


def test_offline_with_nothing_saved_shows_no_invented_headlines_or_market_figures(env):
    base, browser = env
    ctx = browser.new_context()
    page = open_news(base, ctx, None)
    text = page.inner_text("body")
    assert page.locator(".data-shard").count() == 0
    for fake in OLD_FAKE:
        assert fake not in text
    assert "GHOST" not in text.upper()
    assert "+0.8%" not in text and "+2.5%" not in text and "▲ +1.1%" not in text
    assert "no saved headlines" in text.lower() or "no earlier headlines are saved" in text


def test_online_renders_escaped_text_and_only_http_links(env):
    base, browser = env
    ctx = browser.new_context()
    items = [
        {"title": "Real headline <img src=x onerror=window.__pwned=1>", "link": "https://example.com/a", "source": "Src & Co",
         "type": "stocks", "high_impact": True, "timestamp": 1760000000},
        {"title": "Bad link item", "link": "javascript:window.__pwned=2", "source": "x", "type": "macro", "timestamp": 1760000000},
    ]
    page = open_news(base, ctx, {"status": "online", "items": items})
    assert page.evaluate("window.__pwned") is None
    cards = page.locator(".data-shard")
    assert cards.count() == 1
    assert "<img" in cards.first.inner_text()
    assert cards.first.get_attribute("href") == "https://example.com/a"
    saved = page.evaluate("localStorage.getItem('finos_news_intel_last_v1')")
    assert saved and "Real headline" in saved


def test_offline_after_a_good_load_shows_the_saved_headlines_with_their_time(env):
    base, browser = env
    ctx = browser.new_context()
    items = [{"title": "Saved real headline", "link": "https://example.com/s", "source": "S", "type": "macro", "timestamp": 1760000000}]
    page = open_news(base, ctx, {"status": "online", "items": items})
    assert page.locator(".data-shard").count() == 1
    page.close()
    page2 = open_news(base, ctx, None)
    text = page2.inner_text("body")
    assert "Saved real headline" in text
    assert "FEED OFFLINE" in text.upper() and "saved on" in text
    for fake in OLD_FAKE:
        assert fake not in text


def test_corrupt_saved_cache_is_ignored(env):
    base, browser = env
    ctx = browser.new_context()
    ctx.add_init_script("localStorage.setItem('finos_news_intel_last_v1', JSON.stringify({items: 'abc', savedAt: 'x'}))")
    text = open_news(base, ctx, None).inner_text("body")
    assert "no earlier headlines are saved" in text
