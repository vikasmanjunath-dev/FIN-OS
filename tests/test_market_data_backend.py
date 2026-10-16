"""arya-ai market data: honest figures, honest failures.

Covers the fixes made for the phone app's market screens:
  * a quote's `pe_ratio` used to be Yahoo's price-to-book under the wrong name,
  * gold / silver silently used a made-up USD/INR (83.5) when the live rate could not be fetched,
  * crypto cache keys collided, FX/commodity/overview invented 0 changes, news was sorted by weekday name and scored with
    substring matches ("ban" in "bank"),
  * new: /api/fundamentals, /api/mf/history, chart dates.
All external providers are stubbed; nothing here touches the network.
"""
import importlib
import json
import math
import os
import sys
import time

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pd = pytest.importorskip("pandas")
pytest.importorskip("yfinance")
pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="module")
def arya():
    """arya-ai's modules (server/config/data/db) share names with other backends in this repo, so they are imported for this
    module only and removed again afterwards."""
    before_mods, before_path = set(sys.modules), list(sys.path)
    sys.path.insert(0, os.path.join(ROOT, "arya-ai"))
    try:
        if "ta" not in sys.modules:
            try:
                import ta  # noqa: F401
            except ImportError:
                from unittest.mock import MagicMock
                sys.modules["ta"] = MagicMock()
        for name in ("server", "config", "data", "db", "auth", "intelligence", "reports", "tts"):
            sys.modules.pop(name, None)
        server = importlib.import_module("server")
        market = importlib.import_module("data.market")
        news = importlib.import_module("data.news")
        store = importlib.import_module("db.store")
        yield server, market, news, store
    finally:
        for name in set(sys.modules) - before_mods:
            sys.modules.pop(name, None)
        sys.path[:] = before_path


@pytest.fixture()
def env(arya, monkeypatch, tmp_path):
    server, market, news, store = arya
    market.cache._cache._store.clear()
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "arya.db")      # never the real database
    store.init_db()
    # no real network: anything not stubbed by a test fails loudly
    def _no_net(*a, **k):
        raise AssertionError("unexpected network call: %r" % (a,))
    monkeypatch.setattr(market.requests, "get", _no_net)
    monkeypatch.setattr(market._nse, "get", lambda *a, **k: None)
    monkeypatch.setattr(market, "_mf_nav_store", {})
    monkeypatch.setattr(market, "_mf_last_loaded", 0)
    monkeypatch.setattr(market, "_mf_last_attempt", time.time())      # do not try to download AMFI unless a test asks to
    return server, market, news, store, TestClient(server.app)


# ── helpers ───────────────────────────────────────────────────────────────────

def hist(closes, start="2026-10-01", opens=None, vols=None):
    idx = pd.date_range(start, periods=len(closes), freq="D")
    return pd.DataFrame({
        "Open": opens or closes, "High": [c + 1 for c in closes], "Low": [c - 1 for c in closes],
        "Close": closes, "Volume": vols or [1000] * len(closes)}, index=idx)


class FI:
    """yfinance fast_info stand-in. Deliberately carries a price_to_book attribute: the old code read it into pe_ratio."""
    year_high = 1600.0
    year_low = 1100.0
    market_cap = 9.9e12
    price_to_book = 3.3


def make_ticker(history=None, info=None, per_symbol=None, fast_info=FI):
    class T:
        def __init__(self, symbol):
            self.symbol = symbol
            self.fast_info = fast_info()

        def history(self, period=None, interval="1d", auto_adjust=True):
            h = (per_symbol or {}).get(self.symbol, history)
            if isinstance(h, Exception):
                raise h
            return h if h is not None else pd.DataFrame()

        @property
        def info(self):
            i = (per_symbol or {}).get(self.symbol + ":info", info)
            if isinstance(i, Exception):
                raise i
            return i or {}
    return T


class Resp:
    def __init__(self, payload=None, text="", status=200, content=b""):
        self._p, self.text, self.status_code, self.content = payload, text, status, content

    def json(self):
        return self._p

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


# ── quote: pe_ratio is no longer price-to-book ────────────────────────────────

def test_yfinance_quote_does_not_report_price_to_book_as_pe(env, monkeypatch):
    _, market, *_ = env
    monkeypatch.setattr(market.yf, "Ticker", make_ticker(hist([100.0, 102.0])))
    q = market.get_quote("RELIANCE")
    assert q["price"] == 102.0 and q["change"] == 2.0 and q["change_pct"] == 2.0
    assert q["pe_ratio"] is None                       # was FI.price_to_book (3.3) under the name "pe_ratio"
    assert q["price_to_book"] is None
    assert q["week52_high"] == 1600.0 and q["market_cap"] == 9.9e12
    assert 3.3 not in [v for v in q.values() if isinstance(v, float)]


def test_single_bar_quote_has_no_invented_change(env, monkeypatch):
    _, market, *_ = env
    monkeypatch.setattr(market.yf, "Ticker", make_ticker(hist([250.0])))
    q = market.get_quote("NEWCO")
    assert q["price"] == 250.0 and q["change"] is None and q["change_pct"] is None and q["prev_close"] is None


def test_nan_close_rows_are_dropped_and_nan_volume_is_none(env, monkeypatch):
    _, market, *_ = env
    h = hist([100.0, 101.0, float("nan")], vols=[10, float("nan"), 30])
    monkeypatch.setattr(market.yf, "Ticker", make_ticker(h))
    q = market.get_quote("ABC")
    assert q["price"] == 101.0 and q["volume"] is None


def test_symbols_are_validated_and_ampersand_is_url_encoded_for_nse(env, monkeypatch):
    _, market, *_ = env
    seen = []

    def nse(path, **k):
        seen.append(path)
        return {"priceInfo": {"lastPrice": 2841.1, "change": -1, "pChange": -0.03, "intraDayHighLow": {"max": 2850, "min": 2800},
                              "weekHighLow": {"max": 3000, "min": 2000}, "previousClose": 2842.1, "open": 2840},
                "info": {"companyName": "Mahindra & Mahindra Limited"}, "metadata": {"totalTradedVolume": 123}}
    monkeypatch.setattr(market._nse, "get", nse)
    q = market.get_quote("m&m")
    assert seen == ["/api/quote-equity?symbol=M%26M"] and q["name"].startswith("Mahindra") and q["symbol"] == "M&M"
    assert q["pe_ratio"] is None and q["price_to_book"] is None
    for bad in ["", "A B", "../x", "X" * 21, "RELIANCE;DROP"]:
        assert "error" in market.get_quote(bad)
    assert "error" in market.get_quote("TCS", "LSE")
    assert len(seen) == 1                               # nothing invalid reached NSE


def test_an_unknown_symbol_is_remembered_briefly_not_retried(env, monkeypatch):
    _, market, *_ = env
    calls = []

    class T(make_ticker(None)):
        def history(self, *a, **k):
            calls.append(1)
            return pd.DataFrame()
    monkeypatch.setattr(market.yf, "Ticker", T)
    assert "error" in market.get_quote("ZZZZ")
    assert "error" in market.get_quote("ZZZZ")
    assert len(calls) == 1


def test_bulk_quotes_keep_order_cap_the_count_and_mark_failures(env, monkeypatch):
    server, market, _, _, client = env
    per = {f"S{i}.NS": hist([100.0 + i, 101.0 + i]) for i in range(3)}
    per["S1.NS"] = pd.DataFrame()                       # S1 cannot be quoted
    monkeypatch.setattr(market.yf, "Ticker", make_ticker(per_symbol=per))
    j = client.get("/api/quotes", params={"symbols": "s0,s1,s2"}).json()
    q = j["quotes"]
    assert [x["symbol"] for x in q] == ["S0", "S1", "S2"]
    assert q[0]["price"] == 101.0 and "error" in q[1] and q[2]["price"] == 103.0
    assert j["truncated"] is False
    many = ",".join(f"T{i}" for i in range(market.MAX_BULK + 5))
    j = client.get("/api/quotes", params={"symbols": many}).json()
    assert len(j["quotes"]) == market.MAX_BULK and j["truncated"] is True


def test_the_sqlite_copy_of_a_quote_keeps_every_field(env, monkeypatch):
    _, market, _, store, _ = env
    monkeypatch.setattr(market.yf, "Ticker", make_ticker(hist([100.0, 104.0])))
    first = market.get_quote("INFY")
    market.cache._cache._store.clear()                  # force the SQLite layer
    second = market.get_quote("INFY")
    assert second["price"] == 104.0 and second["source"] == "yfinance" and second["name"] == first["name"]
    assert "price_to_book" in second and second["pe_ratio"] is None


# ── fundamentals ──────────────────────────────────────────────────────────────

GOOD_INFO = {"trailingPE": 21.29, "trailingEps": 55.22, "currentPrice": 1175.8, "priceToBook": 1.76, "marketCap": 1.59e13,
             "longName": "Reliance Industries Limited", "sector": "Energy", "industry": "Oil & Gas", "currency": "INR"}


def test_fundamentals_pure_core(env):
    _, market, *_ = env
    f = market.fundamentals_from_info("RELIANCE", "NSE", GOOD_INFO)
    assert f["pe_ratio"] == 21.29 and f["pe_cross_checked"] is True and f["price_to_book"] == 1.76 and f["eps_ttm"] == 55.22
    assert f["name"].startswith("Reliance") and "third-party" in f["source"].lower()
    # Yahoo's P/E disagrees with price / EPS: withheld, with the reason
    bad = dict(GOOD_INFO, trailingPE=40.0)
    f = market.fundamentals_from_info("X", "NSE", bad)
    assert f["pe_ratio"] is None and "did not agree" in f["pe_note"] and f["price_to_book"] == 1.76
    # loss-making / missing / NaN / negative: None, never 0
    f = market.fundamentals_from_info("X", "NSE", {"longName": "Loss Co", "trailingPE": float("nan"), "priceToBook": -2, "marketCap": 0})
    assert f["pe_ratio"] is None and f["price_to_book"] is None and f["market_cap"] is None and f["name"] == "Loss Co"
    assert "error" in market.fundamentals_from_info("X", "NSE", {})
    assert "error" in market.fundamentals_from_info("X", "NSE", None)
    # no EPS or price to check against: accepted but flagged as unchecked
    f = market.fundamentals_from_info("X", "NSE", {"trailingPE": 18.0, "longName": "N"})
    assert f["pe_ratio"] == 18.0 and f["pe_cross_checked"] is False


def test_fundamentals_endpoint_caches_and_reports_failure(env, monkeypatch):
    server, market, _, _, client = env
    n = []

    class T(make_ticker(info=GOOD_INFO)):
        @property
        def info(self):
            n.append(1)
            return GOOD_INFO
    monkeypatch.setattr(market.yf, "Ticker", T)
    for _ in range(3):
        j = client.get("/api/fundamentals/reliance").json()
    assert j["pe_ratio"] == 21.29 and j["symbol"] == "RELIANCE" and len(n) == 1
    assert "error" in client.get("/api/fundamentals/bad symbol").json()
    monkeypatch.setattr(market.yf, "Ticker", make_ticker(info=RuntimeError("yahoo down")))
    market.cache._cache._store.clear()
    j = client.get("/api/fundamentals/TCS").json()
    assert "error" in j and "pe_ratio" not in j


# ── commodities and FX: no invented exchange rate ─────────────────────────────

def _commodity_ticker(prices):
    return make_ticker(per_symbol={k: hist(v, start="2026-10-12") for k, v in prices.items()})


PRICES = {"GC=F": [4000.0, 4100.0], "SI=F": [50.0, 51.0], "CL=F": [90.0, 91.0], "NG=F": [3.0, 3.3]}


def test_gold_and_silver_are_converted_with_the_live_rate_only(env, monkeypatch):
    _, market, *_ = env
    monkeypatch.setattr(market.yf, "Ticker", _commodity_ticker(PRICES))
    monkeypatch.setattr(market, "get_fx_rates", lambda: {"USD_INR": 90.0})
    c = market.get_commodities()
    gold = c["commodities"]["GOLD (10g, global equiv.)"]
    assert gold["price"] == round(4100.0 * 90.0 / 31.1035 * 10, 0)
    assert gold["usd_inr"] == 90.0 and gold["price_usd"] == 4100.0 and "not MCX" in gold["note"]
    assert c["commodities"]["SILVER (1kg, global equiv.)"]["price"] == round(51.0 * 90.0 / 31.1035 * 1000, 0)
    assert c["commodities"]["CRUDE OIL (bbl)"]["unit"] == "USD/bbl"
    assert c["commodities"]["NATURAL GAS"]["unit"] == "USD/MMBtu"
    assert c["unavailable"] == {} and c["commodities"]["NATURAL GAS"]["change_pct"] == 10.0


@pytest.mark.parametrize("fx", [{}, {"EUR_INR": 100.0}, {"USD_INR": float("nan")}, {"USD_INR": 0}])
def test_no_live_usd_inr_means_no_rupee_price_not_a_guessed_one(env, monkeypatch, fx):
    _, market, *_ = env
    monkeypatch.setattr(market.yf, "Ticker", _commodity_ticker(PRICES))
    monkeypatch.setattr(market, "get_fx_rates", lambda: fx)
    c = market.get_commodities()
    assert "GOLD (10g, global equiv.)" not in c["commodities"] and "SILVER (1kg, global equiv.)" not in c["commodities"]
    g = c["unavailable"]["GOLD (10g, global equiv.)"]
    assert g["price_usd"] == 4100.0 and "USD/INR" in g["reason"]
    assert "price" not in g
    assert c["commodities"]["CRUDE OIL (bbl)"]["price"] == 91.0          # USD items do not need FX
    assert "83.5" not in json.dumps(c)
    assert market.cache.get("commodities", 300) is None                  # a partial answer is not remembered


def test_fx_endpoint_says_unavailable_instead_of_returning_nothing(env, monkeypatch):
    server, market, _, _, client = env
    monkeypatch.setattr(market.yf, "Ticker", make_ticker(None))
    j = client.get("/api/fx").json()
    assert list(j) == ["error"]
    monkeypatch.setattr(market.yf, "Ticker", make_ticker(hist([94.0, 94.5])))
    market.cache._cache._store.clear()
    j = client.get("/api/fx").json()
    assert j["USD_INR"] == 94.5 and "error" not in j


# ── crypto ────────────────────────────────────────────────────────────────────

def test_crypto_cache_is_keyed_by_the_coins_asked_for(env, monkeypatch):
    _, market, *_ = env
    calls = []

    def get(url, params=None, timeout=None):
        calls.append(params["ids"])
        ids = params["ids"].split(",")
        return Resp({i: {"inr": 100.0 * (n + 1), "usd": 1.0, "inr_24h_change": -1.5, "inr_market_cap": 5e9} for n, i in enumerate(ids)})
    monkeypatch.setattr(market.requests, "get", get)
    five = market.get_crypto()
    three = market.get_crypto(["bitcoin", "ethereum", "ripple"])
    assert len(five["crypto"]) == 5 and len(three["crypto"]) == 3           # used to collide on one cache key
    market.get_crypto(["ripple", "bitcoin", "ethereum"])
    assert len(calls) == 2                                                  # same set, any order: one fetch
    assert three["crypto"]["bitcoin"]["change_24h"] == -1.5 and three["source"] == "CoinGecko"


def test_crypto_bad_ids_missing_fields_and_failure(env, monkeypatch):
    _, market, *_ = env
    assert "error" in market.get_crypto(["../etc", "BAD ID!!"])
    monkeypatch.setattr(market.requests, "get", lambda *a, **k: Resp({"bitcoin": {"inr": 7.5e6}, "junk": "x"}))
    c = market.get_crypto(["bitcoin"])["crypto"]["bitcoin"]
    assert c["price_inr"] == 7.5e6 and c["price_usd"] is None and c["change_24h"] is None
    market.cache._cache._store.clear()
    n = []

    def boom(*a, **k):
        n.append(1)
        raise RuntimeError("429 secret-host")
    monkeypatch.setattr(market.requests, "get", boom)
    r = market.get_crypto(["dogecoin"])
    assert "error" in r and "secret-host" not in r["error"]
    market.get_crypto(["dogecoin"])
    assert len(n) == 1                                                      # failure is remembered for a moment


# ── indices ───────────────────────────────────────────────────────────────────

def test_overview_maps_nse_fields_and_never_caches_nothing(env, monkeypatch):
    _, market, *_ = env
    nse = {"data": [{"indexSymbol": "NIFTY 50", "last": 22685.6, "variation": -36.35, "percentChange": -0.16, "open": 22715.75,
                     "high": 22757.95, "low": 22663.8, "previousClose": 22721.95, "yearHigh": 26373.2, "yearLow": 22179.9,
                     "pe": "19.41", "pb": "2.79", "dy": "1.51"},
                    {"indexSymbol": "NIFTY OTHER", "last": 1}]}
    monkeypatch.setattr(market._nse, "get", lambda p, **k: nse)
    monkeypatch.setattr(market.yf, "Ticker", make_ticker(None))
    o = market.get_market_overview()["indices"]
    n = o["NIFTY 50"]
    assert (n["high"], n["low"], n["pe"], n["pb"], n["dividend_yield"], n["year_high"]) == (22757.95, 22663.8, 19.41, 2.79, 1.51, 26373.2)
    assert "NIFTY OTHER" not in o
    # nothing available: empty result, and it is not cached
    market.cache._cache._store.clear()
    monkeypatch.setattr(market._nse, "get", lambda p, **k: None)
    assert market.get_market_overview()["indices"] == {}
    assert market.cache.get("market:overview", 15) is None


def test_yfinance_index_with_one_bar_has_no_change(env, monkeypatch):
    _, market, *_ = env
    monkeypatch.setattr(market.yf, "Ticker", make_ticker(hist([100.0])))
    o = market.get_market_overview()["indices"]
    assert o["NIFTY 50"]["price"] == 100.0 and o["NIFTY 50"]["change"] is None and o["NIFTY 50"]["change_pct"] is None


# ── chart dates ───────────────────────────────────────────────────────────────

def test_chart_has_a_date_for_every_close(env, monkeypatch):
    server, market, _, _, client = env
    h = hist([10.0, 11.0, float("nan"), 13.0], start="2026-10-01")
    monkeypatch.setattr(market.yf, "Ticker", make_ticker(h))
    j = client.get("/api/chart", params={"symbol": "TCS.NS", "range": "1mo"}).json()
    assert j["closes"] == [10.0, 11.0, 13.0]
    assert j["dates"] == ["2026-10-01", "2026-10-02", "2026-10-04"]          # the NaN row's date goes with it


# ── mutual funds ──────────────────────────────────────────────────────────────

NAVALL = """Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Open Ended Schemes(Equity Schemes - Large Cap Fund)

Axis Mutual Fund

120465;INF846K01DP8;-;Axis Large Cap Fund;Direct Plan;Growth Option;66.6200;13-Oct-2026
120466;INF846K01DQ6;-;Axis Large Cap Fund;Regular Plan;IDCW Option;N.A.;13-Oct-2026

Open Ended Schemes(Debt Scheme - Banking and PSU Fund)

Aditya Birla Sun Life Mutual Fund

119551;INF209KA12Z1;INF209KA13Z9;Aditya Birla Sun Life Banking & PSU Debt Fund;Direct Plan;IDCW-Re-investment;106.9563;13-Oct-2026
bad;row;;
"""


def test_amfi_file_parser(env):
    _, market, *_ = env
    d = market.parse_amfi_navall(NAVALL)
    assert set(d) == {"120465", "120466", "119551"}
    a = d["120465"]
    assert (a["scheme_name"], a["nav"], a["date"], a["fund_house"], a["plan"], a["option"]) == \
        ("Axis Large Cap Fund", 66.62, "13-Oct-2026", "Axis Mutual Fund", "Direct Plan", "Growth Option")
    assert a["category"].startswith("Open Ended Schemes(Equity")
    assert d["120466"]["nav"] is None                                       # "N.A." is not 0
    assert d["119551"]["fund_house"] == "Aditya Birla Sun Life Mutual Fund" and "Debt" in d["119551"]["category"]
    # reordered columns are found by header name
    swapped = "Scheme Code;Scheme Name;Plan;Option;Net Asset Value;Date;ISIN\n\nXYZ Mutual Fund\n\n1001;Fund X;Direct;Growth;12.5;01-Jan-2026;INF1\n"
    assert market.parse_amfi_navall(swapped)["1001"]["nav"] == 12.5


def test_fund_search_needs_every_word_in_any_order(env, monkeypatch):
    _, market, *_ = env
    monkeypatch.setattr(market, "_mf_nav_store", market.parse_amfi_navall(NAVALL))
    monkeypatch.setattr(market, "_mf_last_loaded", time.time())
    assert [r["scheme_code"] for r in market.search_mf("large cap direct growth")] == ["120465"]
    assert [r["scheme_code"] for r in market.search_mf("DIRECT axis")] == ["120465"]
    assert market.search_mf("axis banking") == []
    assert market.search_mf("   ") == []
    assert len(market.search_mf("fund", limit=2)) == 2


MFAPI = {"meta": {"fund_house": "Aditya Birla Sun Life Mutual Fund", "scheme_type": "Open Ended Schemes",
                  "scheme_category": "Debt - Banking and PSU", "scheme_code": 119551,
                  "scheme_name": "ABSL Banking & PSU Debt Fund - Direct Plan - IDCW", "isin_growth": "INF209KA12Z1",
                  "isin_div_reinvestment": None},
         "data": [{"date": "13-10-2026", "nav": "106.95630"}, {"date": "12-10-2026", "nav": "106.84580"},
                  {"date": "13-10-2024", "nav": "100.00000"}, {"date": "13-10-2020", "nav": "90.00000"},
                  {"date": "10-10-2026", "nav": "0.00000"}, {"date": "garbage", "nav": "5"}, {"date": "11-10-2026", "nav": "N.A."}]}


def test_history_core_sorts_dedupes_drops_bad_rows_and_trims(env):
    _, market, *_ = env
    h = market.mf_history_from_mfapi("119551", MFAPI, years=6)
    assert h["history"] == [["2020-10-13", 90.0], ["2024-10-13", 100.0], ["2026-10-12", 106.8458], ["2026-10-13", 106.9563]]
    assert h["first_date"] == "2020-10-13" and h["last_date"] == "2026-10-13" and h["count"] == 4
    short = market.mf_history_from_mfapi("119551", MFAPI, years=1)
    assert [x[0] for x in short["history"]] == ["2026-10-12", "2026-10-13"] and short["earliest_available"] == "2020-10-13"
    assert "error" in market.mf_history_from_mfapi("1", {"meta": {}, "data": []})
    assert "error" in market.mf_history_from_mfapi("1", None)
    assert "mirror" in h["source"]


def test_history_endpoint_cross_checks_amfi_and_maps_errors(env, monkeypatch):
    server, market, _, _, client = env
    n = []

    def get(url, timeout=None, **k):
        n.append(url)
        assert url.endswith("/119551") or url.endswith("/555555") or url.endswith("/777777"), url
        if url.endswith("/555555"):
            return Resp({"meta": {}, "data": []})
        if url.endswith("/777777"):
            raise RuntimeError("down")
        return Resp(MFAPI)
    monkeypatch.setattr(market.requests, "get", get)
    monkeypatch.setattr(market, "_mf_nav_store", market.parse_amfi_navall(NAVALL))
    monkeypatch.setattr(market, "_mf_last_loaded", time.time())
    r = client.get("/api/mf/history/119551")
    j = r.json()
    assert r.status_code == 200 and j["amfi_check"] == {"checked": True, "matches": True, "amfi_nav": 106.9563, "date": "2026-10-13"}
    client.get("/api/mf/history/119551")
    assert len(n) == 1                                                       # cached
    # a mismatching NAV is reported, not hidden
    market.cache._cache._store.clear()
    monkeypatch.setitem(market._mf_nav_store["119551"], "nav", 120.0)
    assert client.get("/api/mf/history/119551").json()["amfi_check"]["matches"] is False
    assert client.get("/api/mf/history/abc").status_code == 400
    assert client.get("/api/mf/history/555555").status_code == 404
    assert client.get("/api/mf/history/777777").status_code == 502


def test_amfi_outage_is_not_retried_on_every_request(env, monkeypatch):
    _, market, *_ = env
    n = []
    monkeypatch.setattr(market, "_mf_last_attempt", 0)

    def boom(*a, **k):
        n.append(1)
        raise RuntimeError("down")
    monkeypatch.setattr(market.requests, "get", boom)
    assert "error" in market.get_mf_nav("120465")
    assert "error" in market.get_mf_nav("120465")
    assert len(n) == 1


# ── news ──────────────────────────────────────────────────────────────────────

def test_sentiment_matches_whole_words_only(env):
    _, _, news, _, = env[:4]
    s = news.score_text
    assert s("HDFC Bank shares close higher")[0] == "neutral"       # "ban" in bank, "lose" in close
    assert s("Gold bullion prices steady")[0] == "neutral"          # "bull" in bullion
    assert s("Enterprise software surprise")[0] == "neutral"        # "rise" in enterprise / surprise
    assert s("China yuan against the dollar")[0] == "neutral"       # "gain" in against
    assert s("Sensex surges 500 points, Nifty rallies")[0] == "bullish"
    assert s("Markets plunge as FII selling continues")[0] == "bearish"
    assert s("Stocks dropped sharply, falling for third day")[0] == "bearish"
    assert s("Govt bans crypto ads")[0] == "bearish"                # the real word still counts
    assert s("") == ("neutral", 0.0)


def test_tags_are_whole_words(env):
    _, _, news, _ = env[:4]
    assert news._extract_tags("RBI holds repo rate; Nifty and Sensex flat, IPO pipeline, tax on gold") == \
        ["NIFTY", "SENSEX", "RBI", "IPO", "GOLD"]
    assert news._extract_tags("recipe for equipoise, taxiing, golden ticket") == []


def test_published_time_is_parsed_and_sorting_is_by_time_not_weekday_name(env):
    _, _, news, _ = env[:4]
    assert news._published_ts("Wed, 14 Oct 2026 11:18:30 +0530") == 1791956910
    assert news._published_ts("2026-10-14T05:48:30Z") == 1791956910
    assert news._published_ts("nonsense") is None and news._published_ts("") is None
    rows = news._with_time([
        {"id": "a", "published": "Tue, 13 Oct 2026 10:00:00 +0530"},
        {"id": "b", "published": "Wed, 14 Oct 2026 09:00:00 +0530"},     # newer, but "Wed" < "Tue" would put it last as a string
        {"id": "c", "published": "unreadable"},
    ])
    assert [r["id"] for r in rows] == ["b", "a", "c"]


RSS = """<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
<item><title>Nifty rallies as bank stocks surge &amp; IT gains</title><link>https://example.test/a</link>
<description>&lt;p&gt;Strong earnings lift markets.&lt;/p&gt;</description><pubDate>Tue, 13 Oct 2026 10:00:00 +0530</pubDate></item>
<item><title>Sensex slips as RBI warns on inflation</title><link>https://example.test/b</link>
<description>Weak rupee adds to concern.</description><pubDate>Wed, 14 Oct 2026 09:00:00 +0530</pubDate></item>
<item><title>Cricket final tonight</title><link>https://example.test/c</link><description>sports</description></item>
<item><title>Sensex slips as RBI warns on inflation</title><link>https://example.test/b</link><description>dup</description></item>
</channel></rss>""".encode()


def test_fetch_news_survives_a_dead_source_and_reports_it(env, monkeypatch):
    server, market, news, _, client = env
    monkeypatch.setattr(news, "NEWS_FEEDS", [{"name": "Good", "url": "https://good.test/rss"}, {"name": "Dead", "url": "https://dead.test/rss"},
                                              {"name": "Blocked", "url": "https://blocked.test/rss"}])

    def get(url, headers=None, timeout=None):
        if "good" in url:
            return Resp(content=RSS)
        if "blocked" in url:
            return Resp(status=403)
        raise RuntimeError("connection refused")
    monkeypatch.setattr(news.requests, "get", get)
    monkeypatch.setattr(news, "cache_news", lambda a: None)
    monkeypatch.setattr(news, "get_recent_news", lambda **k: [])
    monkeypatch.setattr(server, "fetch_news", news.fetch_news)
    j = client.get("/api/news", params={"force": "true"}).json()
    titles = [a["title"] for a in j["articles"]]
    assert titles == ["Sensex slips as RBI warns on inflation", "Nifty rallies as bank stocks surge & IT gains"]   # newest first, unescaped, deduped, non-finance dropped
    by = {a["title"].split()[0]: a for a in j["articles"]}
    assert by["Sensex"]["sentiment"] == "bearish" and by["Nifty"]["sentiment"] == "bullish"
    assert "RBI" in by["Sensex"]["tags"] and "NIFTY" in by["Nifty"]["tags"]
    assert j["sources"]["feeds_ok"] == 1 and j["sources"]["feeds_failed"] == 2 and j["sources"]["feeds_total"] == 3
    assert "not an AI model" in j["sentiment_method"] and isinstance(j["as_of"], int) and j["count"] == 2
    assert j["articles"][0]["published_ts"] > j["articles"][1]["published_ts"]
    assert client.get("/api/news", params={"limit": 0}).status_code == 422


def test_news_with_every_source_down_is_empty_not_an_error(env, monkeypatch):
    server, market, news, _, client = env
    monkeypatch.setattr(news.requests, "get", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("offline")))
    monkeypatch.setattr(news, "cache_news", lambda a: None)
    monkeypatch.setattr(news, "get_recent_news", lambda **k: [])
    monkeypatch.setattr(server, "fetch_news", news.fetch_news)
    j = client.get("/api/news", params={"force": "true"}).json()
    assert j["articles"] == [] and j["sources"]["feeds_ok"] == 0 and j["sources"]["feeds_failed"] == len(news.NEWS_FEEDS)
