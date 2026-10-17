"""Website -> alert engine: every call carries the Supabase session bearer token; no session means no call."""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

UID = "11111111-2222-3333-4444-555555555555"
TOKEN = "test-access-token-abc"
PAGES = ["benchmarking", "timeline", "couple-finance", "financial-report", "money-ai"]


def stub(signed_in):
    session = {"access_token": TOKEN, "user": {"id": UID, "email": "t@example.com", "user_metadata": {}}} if signed_in else None
    return ("window.FINOS_SB = { url: 'https://x.invalid', getClient: () => ({ auth: { getSession: async () => ({ data: { session: %s } }),"
            " onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }) };" % json.dumps(session))


@pytest.fixture()
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def run(env, page, signed_in):
    base, browser = env
    ctx = browser.new_context()
    ctx.add_init_script(stub(signed_in))
    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.abort())
    calls = []

    def engine(route, request):
        calls.append((request.url, request.headers))
        route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body="{}")

    ctx.route("http://localhost:8001/**", engine)
    pg = ctx.new_page()
    pg.goto(f"{base}/html/{page}.html", wait_until="domcontentloaded")
    pg.wait_for_timeout(2500)
    ctx.close()
    return calls


@pytest.mark.parametrize("page", PAGES)
def test_calls_carry_bearer_token(env, page):
    calls = run(env, page, True)
    assert calls, f"{page} made no alert-engine call"
    for url, headers in calls:
        if url.endswith("/health") or "/vapid-public-key" in url or url.endswith("/market"):
            continue
        assert headers.get("authorization") == f"Bearer {TOKEN}", url
        assert TOKEN not in url


@pytest.mark.parametrize("page", PAGES)
def test_no_session_no_call(env, page):
    calls = [u for u, _ in run(env, page, False) if not (u.endswith("/health") or "/vapid-public-key" in u or u.endswith("/market"))]
    assert calls == []
