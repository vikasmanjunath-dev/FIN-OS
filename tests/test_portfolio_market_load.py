"""Portfolio.AI market-data backend: how many upstream requests a refresh costs, and what happens when a provider says 429.

Background: a 60 s refresh of a ~80 holding portfolio re-fetched NSE (x3), Screener (x2) and Yahoo fundamentals for every symbol even though
fundamentals are cached for 6 h; broker symbols such as "GOLDBEES-E" and other unknown tickers were retried on every refresh; a 429 was
never remembered. The browser console showed 502/429. All providers are stubbed here; nothing touches the network.
"""
import asyncio
import importlib.util
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

SERVER_PATH = Path(__file__).resolve().parents[1] / "Porfolio Analyser" / "server.py"
SPEC = importlib.util.spec_from_file_location("finos_portfolio_analyser_load", SERVER_PATH)
srv = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(srv)


class Calls:
    def __init__(self):
        self.nse = self.fund = self.light = self.scr = 0


@pytest.fixture()
def stub(monkeypatch):
    """Fresh caches + counting stubs for the four upstream fetchers."""
    for c in (srv.price_cache, srv.fund_cache, srv.hist_cache, srv.neg_cache, srv.scr_cache, srv.stale_price, srv.stale_fund):
        c.clear()
    srv._inflight.clear()
    for k in srv._backoff_until:
        srv._backoff_until[k] = 0.0
    calls = Calls()
    known = {"RELIANCE", "GOLDBEES", "TCS"}

    async def nse(symbol, client=None):
        calls.nse += 1
        await asyncio.sleep(0.01)
        return {"price": 100.0, "changePct": 1.0, "source": "NSE", "_ts": time.time()} if srv.clean_sym(symbol) in known else {}

    def fund(symbol):
        calls.fund += 1
        if srv.clean_sym(symbol) not in known:
            return {}
        return {"price": 99.0, "pe": 20.0, "mktCapCr": 5000.0, "source": "Yahoo Finance", "_ts": time.time()}

    def light(symbol):
        calls.light += 1
        return {"price": 98.0, "source": "Yahoo Finance", "_ts": time.time()} if srv.clean_sym(symbol) in known else {}

    async def scr(symbol, client):
        calls.scr += 1
        return {"roce_scr": 15.0}

    monkeypatch.setattr(srv, "fetch_nse_price", nse)
    monkeypatch.setattr(srv, "fetch_yf_fundamentals", fund)
    monkeypatch.setattr(srv, "fetch_yf_price", light)
    monkeypatch.setattr(srv, "fetch_screener_data", scr)
    return calls


def run(coro):
    return asyncio.run(coro)


def test_series_suffixes_from_broker_exports_are_stripped():
    assert srv.clean_sym("GOLDBEES-E") == "GOLDBEES"
    assert srv.clean_sym("tcs-eq") == "TCS"
    assert srv.clean_sym("INFY-BE") == "INFY"
    assert srv.to_yf_ticker("MON100-E") == "MON100.NS"
    assert srv.clean_sym("BAJAJ-AUTO") == "BAJAJ-AUTO"        # a real hyphenated symbol is untouched
    assert srv.clean_sym("^NSEI") == "^NSEI"


def test_a_fresh_quote_is_fetched_once_then_served_from_cache(stub):
    run(srv.get_full_quote("RELIANCE"))
    first = (stub.nse, stub.fund, stub.scr)
    q = run(srv.get_full_quote("RELIANCE"))
    assert first == (1, 1, 1)
    assert (stub.nse, stub.fund, stub.scr) == first
    assert q["_freshness"]["cached"] is True and q["price"] == 100.0


def test_price_refresh_reuses_cached_fundamentals_and_screener(stub):
    run(srv.get_full_quote("RELIANCE"))
    srv.price_cache.clear()                                    # 60 s later: only the price has expired
    q = run(srv.get_full_quote("RELIANCE"))
    assert (stub.nse, stub.fund, stub.scr) == (2, 1, 1), "only NSE may be asked again"
    assert q["price"] == 100.0 and q["pe"] == 20.0


def test_price_refresh_falls_back_to_a_light_yahoo_price_not_the_full_lookup(stub, monkeypatch):
    run(srv.get_full_quote("RELIANCE"))
    srv.price_cache.clear()

    async def nse_down(symbol, client=None):
        stub.nse += 1
        return {}
    monkeypatch.setattr(srv, "fetch_nse_price", nse_down)
    q = run(srv.get_full_quote("RELIANCE"))
    assert stub.fund == 1 and stub.light == 1
    assert q["price"] == 98.0 and q["pe"] == 20.0


def test_unknown_symbols_are_remembered_not_retried(stub):
    first = run(srv.get_full_quote("NOSUCHSYM"))
    assert first.get("negative") is True
    before = (stub.nse, stub.fund, stub.scr)
    for _ in range(5):
        assert run(srv.get_full_quote("NOSUCHSYM")).get("negative") is True
    assert (stub.nse, stub.fund, stub.scr) == before
    run(srv.get_full_quote("NOSUCHSYM", force_refresh=True))    # an explicit refresh may try again
    assert stub.fund == before[1] + 1


def test_suffixed_and_plain_symbols_share_one_fetch(stub):
    run(srv.get_full_quote("GOLDBEES-E"))
    run(srv.get_full_quote("GOLDBEES"))
    assert stub.fund == 1


def test_concurrent_callers_share_one_fetch(stub):
    async def many():
        return await asyncio.gather(*[srv.get_full_quote("TCS") for _ in range(12)])
    results = run(many())
    assert all(r["price"] == 100.0 for r in results)
    assert (stub.nse, stub.fund, stub.scr) == (1, 1, 1)


def test_a_rate_limited_provider_is_left_alone_and_stale_data_is_served(stub, monkeypatch):
    run(srv.get_full_quote("TCS"))
    srv.price_cache.clear(); srv.fund_cache.clear()
    srv.trip_backoff("yahoo", "test")
    srv.trip_backoff("nse", "test")
    assert srv.backing_off("yahoo") and srv.backoff_remaining() > 0

    async def nse_blocked(symbol, client=None):
        stub.nse += 1
        return {}
    monkeypatch.setattr(srv, "fetch_nse_price", nse_blocked)
    q = run(srv.get_full_quote("TCS"))
    assert q["price"] == 100.0 and q["_freshness"]["stale"] is True
    assert stub.light == 0, "no Yahoo request while it is backing off"


def test_backoff_without_stale_data_is_not_mistaken_for_an_unknown_symbol(stub):
    srv.trip_backoff("yahoo", "test"); srv.trip_backoff("nse", "test")
    out = run(srv.get_full_quote("INFY"))
    assert out.get("rateLimited") is True and "negative" not in out
    assert "INFY" not in srv.neg_cache


def test_provider_rate_limit_detection():
    class YFRateLimitError(Exception):
        pass
    assert srv.is_rate_limit(YFRateLimitError("x"))
    assert srv.is_rate_limit(RuntimeError("HTTP Error 429: Too Many Requests"))
    assert not srv.is_rate_limit(RuntimeError("symbol may be delisted"))


def test_endpoints_report_rate_limits_with_retry_after_not_a_bare_502(stub):
    client = TestClient(srv.app)
    srv.trip_backoff("yahoo", "test"); srv.trip_backoff("nse", "test")
    r = client.get("/quote/INFY")
    assert r.status_code == 503 and int(r.headers["retry-after"]) > 0
    b = client.get("/bulk?symbols=INFY,INFY,WIPRO")
    assert b.status_code == 200 and set(b.json()) == {"INFY", "WIPRO"} and int(b.headers["retry-after"]) > 0
    h = client.get("/health").json()
    assert h["backing_off"]["yahoo"] is True and h["retry_after_sec"] > 0


def test_bulk_makes_one_fetch_per_distinct_symbol_and_none_on_the_second_call(stub):
    client = TestClient(srv.app)
    syms = "RELIANCE,TCS,GOLDBEES-E,NOPE1,NOPE2,RELIANCE"
    first = client.get("/bulk?symbols=" + syms).json()
    assert first["RELIANCE"]["price"] == 100.0 and first["NOPE1"].get("negative") is True
    used = (stub.nse, stub.fund, stub.scr)
    client.get("/bulk?symbols=" + syms)
    assert (stub.nse, stub.fund, stub.scr) == used, "a second refresh inside the cache window costs no upstream request"


def test_nse_being_blocked_does_not_stop_unknown_symbols_being_remembered(stub):
    srv.trip_backoff("nse", "test")                            # NSE blocks bots: Yahoo alone decides a symbol does not exist
    assert run(srv.get_full_quote("NOPE9")).get("negative") is True
    assert "NOPE9" in srv.neg_cache
