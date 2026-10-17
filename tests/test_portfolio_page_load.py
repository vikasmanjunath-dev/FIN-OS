"""Portfolio.AI page (Porfolio Analyser/portfolio-analyser-v10.html): request discipline and refresh behaviour, in a real browser.

The page used to
  * send ~30 requests to public CORS proxies / Yahoo on every portfolio load (macro tiles + quant histories), none of them remembered
    when a provider answered 429/502, so a failing provider was hit ~120 times a minute;
  * refresh every 60 s forever (background tabs included), rebuild every page each time, and ignore the backend's Retry-After.
Providers are stubbed at the network layer; nothing leaves the machine.

    python3 -m pytest tests/test_portfolio_page_load.py -q
"""
import os
import sys
from urllib.parse import quote, urlparse

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402
from portfolio_profile import PAGE, synthetic  # noqa: E402

THIRD_PARTY = ("allorigins.win", "corsproxy.io", "thingproxy.freeboard.io", "api.codetabs.com", "finance.yahoo.com", "stooq.com",
               "open.er-api.com", "frankfurter.app")


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch()
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def load(env, fail_with=None, backend_ok=True):
    """A page with a 30-holding synthetic portfolio injected; returns (page, third_party_requests list)."""
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    page = ctx.new_page()
    hits = []

    def route(r):
        u = r.request.url
        host = urlparse(u).netloc
        if host.startswith(("127.0.0.1:8766", "localhost:8766")):
            if not backend_ok:
                return r.abort()
            if "/health" in u:
                return r.fulfill(status=200, body='{"status":"ok","price_cache":0,"fund_cache":0}', headers={"access-control-allow-origin": "*", "content-type": "application/json"})
            return r.fulfill(status=200, body="{}", headers={"access-control-allow-origin": "*", "content-type": "application/json"})
        if any(h in host for h in THIRD_PARTY):
            hits.append(u)
            if fail_with:
                return r.fulfill(status=fail_with, body="nope", headers={"access-control-allow-origin": "*", "retry-after": "120"})
            return r.fulfill(status=404, body="x", headers={"access-control-allow-origin": "*"})
        if host.startswith(("127.0.0.1", "localhost")):
            return r.continue_()
        r.continue_()          # CDN scripts and fonts
    ctx.route("**/*", route)
    page.goto(base + quote(PAGE, safe="/"))
    page.wait_for_function("typeof buildAll === 'function' && typeof mktFetch === 'function'")
    eq, mf = synthetic(30, 8)
    page.evaluate("([eq, mf]) => { EQ = eq; MF = mf; buildAll(); }", [eq, mf])
    page.wait_for_timeout(1500)
    return page, hits


def test_loading_a_portfolio_makes_no_third_party_requests_until_the_quant_page_is_opened(env):
    page, hits = load(env)
    baseline = len(hits)                       # the one-off Nifty 1Y probe at page load is allowed (<= 3); nothing else
    assert baseline <= 3, hits
    assert page.evaluate("window._quantPending") is True
    page.evaluate("go('quant')")
    page.wait_for_timeout(1500)
    assert page.evaluate("window._quantPending") is False, "opening the Quant page loads it exactly once"
    before = len(hits)
    page.evaluate("go('overview'); go('quant')")
    page.wait_for_timeout(500)
    assert len(hits) == before, "re-opening the page does not reload it"


def test_a_provider_that_says_429_or_502_is_not_asked_again(env):
    page, hits = load(env, fail_with=429)
    page.evaluate("go('quant')")
    page.wait_for_timeout(4000)
    per_host = {}
    for u in hits:
        per_host[urlparse(u).netloc] = per_host.get(urlparse(u).netloc, 0) + 1
    assert per_host and max(per_host.values()) <= 2, per_host
    paused = page.evaluate("Object.keys(MKT.brk).filter(h => mktPaused(h))")
    assert paused, "failed providers are paused"
    # persisted for the session: a reload does not start by hitting them again
    assert page.evaluate("JSON.parse(sessionStorage.getItem('finos_mkt_brk') || '{}')") != {}


def test_mktfetch_shares_in_flight_requests_caches_and_short_circuits(env):
    page, hits = load(env)
    r = page.evaluate("""async () => {
        const url = 'https://api.allorigins.win/raw?url=probe-share';
        const n0 = MKT.stats.net;
        const [a, b, c] = await Promise.all([mktFetch(url, {ttl: 60000}), mktFetch(url, {ttl: 60000}), mktFetch(url, {ttl: 60000})]);
        const net = MKT.stats.net - n0, s1 = {...MKT.stats};
        await mktFetch(url, {ttl: 60000});
        return { statuses: [a.status, b.status, c.status], net, cachedAfter: MKT.stats.cached - s1.cached };
    }""")
    assert r["statuses"] == [404, 404, 404]
    assert r["net"] == 1, "three concurrent callers, one network request"
    assert r["cachedAfter"] == 0, "a 404 is never cached"


def test_refresh_pacing_backs_off_pauses_and_honours_retry_after(env):
    page, _ = load(env)
    r = page.evaluate("""() => {
        const open = Date.UTC(2026, 9, 14, 5, 0);      // Wed 14 Oct 2026 10:30 IST: market open
        const closed = Date.UTC(2026, 9, 17, 5, 0);    // Sat 17 Oct 2026
        const out = {};
        _liveFailStreak = 0; _liveRetryAfterMs = 0;
        out.open = liveRefreshDelay(open); out.closed = liveRefreshDelay(closed);
        _liveFailStreak = 1; out.fail1 = liveRefreshDelay(open);
        _liveFailStreak = 2; out.fail2 = liveRefreshDelay(open);
        _liveFailStreak = 9; out.failMax = liveRefreshDelay(open);
        _liveFailStreak = 0; _liveRetryAfterMs = 240000; out.retryAfter = liveRefreshDelay(open);
        return out;
    }""")
    assert r["open"] == 60000 and r["closed"] == 300000
    assert r["fail1"] == 120000 and r["fail2"] == 240000 and r["failMax"] == 300000
    assert r["retryAfter"] == 240000


def test_hidden_tab_stops_the_refresh_timer_and_resumes_when_visible(env):
    page, _ = load(env)
    assert page.evaluate("scheduleLiveRefresh(), _liveTimer !== null")
    page.evaluate("""() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => true}); scheduleLiveRefresh(); }""")
    assert page.evaluate("_nextRefreshAt") is not None
    t = page.evaluate("""() => { const n = _nextRefreshAt; scheduleLiveRefresh(); return _nextRefreshAt === n; }""")
    assert t, "no new timer is armed while the tab is hidden"


def test_refresh_rebuilds_only_the_visible_page_and_only_when_prices_changed(env):
    page, _ = load(env)
    r = page.evaluate("""async () => {
        go('overview'); _stalePages.clear();
        const calls = {};
        Object.keys(PRICE_PAGES).forEach(k => { const f = PRICE_PAGES[k]; PRICE_PAGES[k] = () => { calls[k] = (calls[k] || 0) + 1; return f(); }; });
        const prices = () => { const o = {}; EQ.forEach(h => o[h.sym.toUpperCase()] = { price: h.cmp, changePct: h.changePct || 0 }); return o; };
        window.fetchAllLivePrices = async () => prices();
        await globalRefresh(false);                                               // warm-up: first quotes land (changePct appears)
        Object.keys(calls).forEach(k => delete calls[k]); _stalePages.clear();
        await globalRefresh(true);                                                // nothing moved
        const unchanged = { ...calls };
        window.fetchAllLivePrices = async () => { const o = prices(); const k = Object.keys(o)[0]; o[k].price += 1; return o; };
        await globalRefresh(true);
        const moved = { ...calls };
        const stale = [..._stalePages].sort();
        go('sectors');
        return { unchanged, moved, stale, rebuiltOnOpen: calls.sectors, staleAfter: [..._stalePages].includes('sectors') };
    }""")
    assert r["unchanged"] == {}, "a refresh in which no price moved rebuilds nothing"
    assert r["moved"] == {"overview": 1}, "only the page on screen is rebuilt"
    assert "sectors" in r["stale"] and "equity" in r["stale"] and "overview" not in r["stale"]
    assert r["rebuiltOnOpen"] == 1 and r["staleAfter"] is False, "a stale page is rebuilt when it is opened"


def test_concurrent_price_refreshes_share_one_request(env):
    page, _ = load(env)
    n = page.evaluate("""async () => {
        let calls = 0;
        const realFetch = window.fetch;
        window.fetch = (u, o) => { if (String(u).includes('/bulk')) { calls++; return Promise.resolve(new Response('{}', {status: 200, headers: {'Retry-After': '90'}})); } return realFetch(u, o); };
        await Promise.all([fetchAllLivePrices(), fetchAllLivePrices(), fetchAllLivePrices()]);
        window.fetch = realFetch;
        return { calls, retryAfter: _liveRetryAfterMs };
    }""")
    assert n["calls"] == 1 and n["retryAfter"] == 90000


def test_research_history_prefers_the_local_backend_over_public_proxies(env):
    page, hits = load(env)
    rows = page.evaluate("""async () => {
        _backendOnline = true;
        const bars = Array.from({length: 40}, (_, i) => ({date: `2026-0${1 + (i % 9)}-${String(1 + (i % 27)).padStart(2, '0')}`, open: 100, high: 101, low: 99, close: 100 + i, volume: 1000}));
        const realFetch = window.fetch;
        window.fetch = (u, o) => String(u).includes('/history/') ? Promise.resolve(new Response(JSON.stringify({rows: bars}), {status: 200})) : realFetch(u, o);
        const r = await liveFetchHistory('RELIANCE', '5y', '1d');
        window.fetch = realFetch;
        return r.length;
    }""")
    assert rows == 40


def test_successful_responses_are_cached_and_a_429_pauses_the_provider_for_retry_after(env):
    page, _ = load(env)
    r = page.evaluate("""async () => {
        const realFetch = window.fetch; let calls = 0, mode = 'ok';
        window.fetch = (u, o) => {
            const s = String(u);
            if (!s.includes('probe-')) return realFetch(u, o);
            calls++;
            return Promise.resolve(mode === 'ok' ? new Response('{"a":1}', {status: 200})
                                                 : new Response('slow down', {status: 429, headers: {'Retry-After': '120'}}));
        };
        const ok = 'https://api.allorigins.win/raw?url=probe-cache';
        await mktFetch(ok, {ttl: 60000}); await mktFetch(ok, {ttl: 60000});
        const cachedCalls = calls;
        mode = '429';
        const bad = 'https://corsproxy.io/?probe-429';
        const first = (await mktFetch(bad)).status;
        let paused = false, afterCalls = calls;
        try { await mktFetch('https://corsproxy.io/?probe-other'); } catch (e) { paused = /paused/.test(e.message); }
        const wait = MKT.brk['corsproxy.io'].until - Date.now();
        window.fetch = realFetch;
        return { cachedCalls, first, paused, noExtraNetwork: calls === afterCalls, waitSec: Math.round(wait / 1000) };
    }""")
    assert r["cachedCalls"] == 1, "a 200 is served from cache inside its TTL"
    assert r["first"] == 429 and r["paused"] and r["noExtraNetwork"]
    assert 100 <= r["waitSec"] <= 120, "the pause follows the provider's Retry-After"


def test_hidden_pages_are_built_when_opened_not_on_upload(env):
    page, _ = load(env)
    first = page.evaluate("""() => ({stale: [..._stalePages].sort(), etf: _etfBuilt, mf: _mfBuilt,
        sectorsBuilt: document.querySelectorAll('#page-sectors canvas').length,
        dom: document.getElementsByTagName('*').length})""")
    assert first["stale"] == ["analytics", "insights", "rebalance", "sectors", "tax"]
    assert first["etf"] is False and first["mf"] is False
    assert first["dom"] < 7000, "30 holdings should not need thousands of hidden DOM nodes"
    after = page.evaluate("""() => { const t = ['sectors', 'insights', 'tax', 'rebalance', 'analytics'];
        t.forEach(go); eqPageTab('etf'); eqPageTab('mf');
        return {stale: [..._stalePages], text: t.map(id => document.getElementById('page-' + id).innerText.length), etf: _etfBuilt, mf: _mfBuilt}; }""")
    assert after["stale"] == [] and all(n > 200 for n in after["text"]) and after["etf"] and after["mf"]


def test_every_page_opens_without_console_errors(env):
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    ctx.route("**/*", lambda r: r.fulfill(status=404, body="") if any(h in r.request.url for h in THIRD_PARTY + (":8766",)) else r.continue_())
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)[:160]))
    page.on("console", lambda m: errors.append(m.text[:160]) if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.goto(base + quote(PAGE, safe="/"))
    page.wait_for_function("typeof buildAll === 'function'")
    eq, mf = synthetic(40, 10)
    page.evaluate("([eq, mf]) => { EQ = eq; MF = mf; buildAll(); }", [eq, mf])
    for pid in ("overview", "equity", "sectors", "insights", "tax", "rebalance", "analytics", "quant", "research", "watchlist", "overview"):
        page.evaluate(f"go('{pid}')")
        page.wait_for_timeout(250)
    page.evaluate("eqPageTab('etf'); eqPageTab('mf')")
    page.wait_for_timeout(1200)
    assert errors == [], errors


def test_sector_insights_card_renders_instead_of_throwing(env):
    page, _ = load(env)
    txt = page.evaluate("go('sectors'), document.getElementById('sec-insights-box').innerText")
    assert "SECTOR INSIGHTS" in txt.upper() and "Largest sector" in txt and "not a recommendation" in txt


def test_overview_drag_sections_wrap_once_and_survive_revisits(env):
    page, _ = load(env)
    page.evaluate("go('overview')")
    page.wait_for_timeout(900)
    got = page.evaluate("""() => ({n: document.querySelectorAll('#page-overview .ov-drag-section').length,
                                  bar: !!document.getElementById('ov-layout-bar'),
                                  ids: document.querySelectorAll('#page-overview .ov-drag-section [id]').length})""")
    assert got["n"] == 5 and got["bar"] and got["ids"] >= 5
    page.evaluate("document.querySelector('#page-overview .ov-drag-section').dataset.mark = 'kept'; go('equity'); go('overview')")
    page.wait_for_timeout(900)
    assert page.evaluate("document.querySelector('#page-overview .ov-drag-section').dataset.mark") == "kept", "a revisit must not rebuild the sections"


def _holdings_xlsx(path, n_eq=12):
    openpyxl = pytest.importorskip("openpyxl")
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Equity"
    for _ in range(3):
        ws.append(["Client ID", "SYNTHETIC"])
    ws.append([])
    ws.append(["Symbol", "ISIN", "Sector", "Quantity Available", "Average Price", "Previous Closing Price", "Unrealized P&L", "Unrealized P&L Pct."])
    for i in range(n_eq):
        qty, avg, cmp_ = 10 + i, 100.0 + i, 110.0 + i
        ws.append([f"SYN{i:02d}", f"INE{i:06d}", "IT", qty, avg, cmp_, round((cmp_ - avg) * qty, 2), round((cmp_ / avg - 1) * 100, 2)])
    mf = wb.create_sheet("Mutual Funds")
    mf.append(["Symbol", "ISIN", "Instrument Type", "Quantity Available", "Average Price", "Previous Closing Price", "Unrealized P&L", "Unrealized P&L Pct."])
    mf.append(["Synthetic Equity Fund - Direct Growth", "INF000001", "Equity", 100.5, 50.0, 60.0, 1005.0, 20.0])
    wb.save(path)


def test_page_loads_without_the_big_libraries_and_an_xlsx_upload_still_works(env, tmp_path):
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    page = ctx.new_page()
    urls = []
    page.on("request", lambda r: urls.append(r.url))
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)[:160]))
    page.goto(base + quote(PAGE, safe="/"))
    page.wait_for_function("typeof buildAll === 'function'")
    assert not any("lightweight-charts" in u for u in urls), "lightweight-charts is only fetched for the Research page"
    assert page.evaluate("typeof LightweightCharts") == "undefined"
    f = tmp_path / "holdings.xlsx"
    _holdings_xlsx(str(f))
    page.set_input_files("#fileIn", str(f))
    page.wait_for_function("EQ.length >= 12 && MF.length >= 1", timeout=20000)
    assert any("xlsx.full.min.js" in u for u in urls)
    assert page.evaluate("EQ.length") == 12 and page.evaluate("MF.length") == 1
    assert errors == [], errors
    page.evaluate("go('research')")
    page.wait_for_function("typeof LightweightCharts !== 'undefined'", timeout=20000)


def test_one_supabase_client_is_shared_on_this_page(env):
    base, browser = env
    ctx = browser.new_context()
    ctx.route("**/*", lambda r: r.fulfill(status=404, body="") if any(h in r.request.url for h in THIRD_PARTY + (":8766", "11434", "8767")) else r.continue_())
    page = ctx.new_page()
    page.add_init_script("window.__timers = []; const _si = window.setInterval; window.setInterval = function(f, ms, ...a) { window.__timers.push(ms); return _si.call(window, f, ms, ...a); };")
    page.goto(base + quote(PAGE, safe="/"))
    page.wait_for_timeout(3000)
    assert page.evaluate("window.__timers.filter(x => x === 30000).length") <= 1, "one auth-refresh timer, not one per client"
