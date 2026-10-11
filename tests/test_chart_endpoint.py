"""arya-ai GET /api/chart: the Trading Brain's price data comes from this machine, not from a public relay."""
import importlib
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pd = pytest.importorskip("pandas")
pytest.importorskip("yfinance")
pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402


class FakeTicker:
    calls = []

    def __init__(self, symbol):
        self.symbol = symbol
        self.fast_info = type("FI", (), {"last_price": 101.256})()

    def history(self, period, interval, auto_adjust=False):
        FakeTicker.calls.append((self.symbol, period, interval))
        idx = pd.date_range("2026-10-01", periods=4, freq="D")
        return pd.DataFrame({"Open": [10, 11, 12, 13], "High": [11, 12, 13, 14], "Low": [9, 10, 11, 12],
                             "Close": [10.5, 11.5, None, 13.5], "Volume": [100, 200, 0, None]}, index=idx)


@pytest.fixture(scope="module")
def arya():
    """arya-ai's modules are named server/config/data/db, which other backends in this repo also use, so they are imported for this
    module only and removed again afterwards (otherwise document-ai's tests would get the wrong `server`)."""
    before_mods, before_path = set(sys.modules), list(sys.path)
    sys.path.insert(0, os.path.join(ROOT, "arya-ai"))
    try:
        if "ta" not in sys.modules:           # technical-indicator library: not needed for this route, may not be installed
            try:
                import ta  # noqa: F401
            except ImportError:
                from unittest.mock import MagicMock
                sys.modules["ta"] = MagicMock()
        for name in ("server", "config", "data", "db", "auth", "intelligence", "reports", "tts"):
            sys.modules.pop(name, None)
        server = importlib.import_module("server")
        market = importlib.import_module("data.market")
        yield server, market
    finally:
        for name in set(sys.modules) - before_mods:
            sys.modules.pop(name, None)
        sys.path[:] = before_path


@pytest.fixture()
def client(arya, monkeypatch):
    server, market = arya
    FakeTicker.calls = []
    monkeypatch.setattr(market.yf, "Ticker", FakeTicker)
    market.cache._cache._store.clear()
    return TestClient(server.app), market


def test_returns_the_arrays_the_page_reads_and_drops_rows_without_a_close(client):
    c, _ = client
    r = c.get("/api/chart", params={"symbol": "RELIANCE.NS", "interval": "1d", "range": "3mo"})
    assert r.status_code == 200
    j = r.json()
    assert j["closes"] == [10.5, 11.5, 13.5]                      # the row with no close is dropped, all arrays stay aligned
    assert len(j["opens"]) == len(j["highs"]) == len(j["lows"]) == len(j["volumes"]) == 3
    assert j["volumes"] == [100, 200, 0]
    assert j["currentPrice"] == 101.26 and j["symbol"] == "RELIANCE.NS" and j["interval"] == "1d"
    assert FakeTicker.calls == [("RELIANCE.NS", "3mo", "1d")]


def test_a_repeat_request_is_served_from_the_cache(client):
    c, _ = client
    for _ in range(3):
        assert c.get("/api/chart", params={"symbol": "^NSEI"}).status_code == 200
    assert len(FakeTicker.calls) == 1


@pytest.mark.parametrize("params", [
    {"symbol": "RELIANCE.NS; DROP"}, {"symbol": "../etc/passwd"}, {"symbol": "A" * 40},
    {"symbol": "TCS.NS", "interval": "7m"}, {"symbol": "TCS.NS", "range": "forever"},
])
def test_unsafe_or_unknown_inputs_are_refused_before_anything_is_fetched(client, params):
    c, _ = client
    assert c.get("/api/chart", params=params).status_code == 400
    assert FakeTicker.calls == []


def test_index_and_futures_symbols_are_accepted(client):
    c, _ = client
    for sym in ["^NSEI", "^NSEBANK", "GC=F", "USDINR=X", "M&M.NS", "BAJAJ-AUTO.NS"]:
        assert c.get("/api/chart", params={"symbol": sym}).status_code == 200, sym


def test_a_source_failure_is_reported_not_raised(client, monkeypatch):
    c, market = client

    class Boom(FakeTicker):
        def history(self, *a, **k):
            raise RuntimeError("upstream down")
    monkeypatch.setattr(market.yf, "Ticker", Boom)
    market.cache._cache._store.clear()
    r = c.get("/api/chart", params={"symbol": "TCS.NS"})
    assert r.status_code == 502 and "upstream down" in r.json()["detail"]
