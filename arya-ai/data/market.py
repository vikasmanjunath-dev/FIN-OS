"""
Arya AI — Market Data Layer
Fetches: NSE/BSE quotes, indices, MF NAVs, gold/silver, crypto, FX.
All functions return clean dicts. No dependency on voice, UI, or other modules.
"""
import time
import json
import math
import os
import re
import concurrent.futures
from datetime import datetime, timedelta
from urllib.parse import quote as _urlquote

import requests
import yfinance as yf
import feedparser

import data.cache as cache
from db.store import (
    cache_quote, get_quote_cached,
    cache_news, get_recent_news,
    upsert, get_cached
)
from config import (
    NSE_BASE, NSE_HEADERS, NSE_SUFFIX, BSE_SUFFIX,
    AMFI_NAV_URL, COINGECKO_BASE, INDEX_TICKERS,
    TTL_QUOTE, TTL_INDEX, TTL_MF_NAV, TTL_GOLD, TTL_CRYPTO, TTL_FX,
)

# ── NSE Session Manager ────────────────────────────────────────────────────────
# This custom session, not the `nsepy` library originally specified — checked,
# not assumed: nsepy's last PyPI release was 2020-03-07 (verified via PyPI's
# API), and a real test against the live NSE site today fails immediately —
# `nsepy.get_quote()` hardcodes `www1.nseindia.com` (a legacy subdomain) and
# gets an SSL handshake error (TLSV1_ALERT_INTERNAL_ERROR) before even
# reaching a real endpoint. Switching to nsepy would be a regression, not the
# spec-compliance fix it looks like on paper — this custom session (live
# cookies against the *current* nseindia.com, yfinance fallback if NSE itself
# blocks the request) is the one that actually works against NSE as it exists
# today, six years after nsepy's last update.

class _NSESession:
    """Keeps a live NSE session with cookies so their API responds."""
    def __init__(self):
        self._session = requests.Session()
        self._session.headers.update(NSE_HEADERS)
        self._last_refresh = 0
        self._TTL = 300   # refresh cookies every 5 min

    def _refresh(self):
        try:
            self._session.get(NSE_BASE, timeout=8)
            self._last_refresh = time.time()
        except Exception:
            pass

    def get(self, path: str, **kwargs) -> dict | None:
        if time.time() - self._last_refresh > self._TTL:
            self._refresh()
        url = f"{NSE_BASE}{path}"
        try:
            r = self._session.get(url, timeout=8, **kwargs)
            if r.status_code == 401:
                self._refresh()
                r = self._session.get(url, timeout=8, **kwargs)
            r.raise_for_status()
            return r.json()
        except Exception:
            return None

_nse = _NSESession()


# ── Small helpers ──────────────────────────────────────────────────────────────

def _num(v):
    """A finite float, or None. NaN / inf / text / bool become None: a missing figure is never turned into a 0."""
    if isinstance(v, bool) or v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _pos(v):
    f = _num(v)
    return f if f is not None and f > 0 else None


_SYMBOL_OK = re.compile(r"^[A-Z0-9&\-]{1,20}$")      # NSE tickers: letters, digits, & and -  (M&M, BAJAJ-AUTO)
_EXCHANGES = ("NSE", "BSE")
TTL_MISS = 20            # an unknown symbol is remembered for this long so a bad ticker does not hit NSE + Yahoo on every request
TTL_FUNDAMENTALS = 6 * 3600
MAX_BULK = 60


# ── Quote fetching ─────────────────────────────────────────────────────────────

def _quote_from_nse(symbol: str) -> dict | None:
    """Try NSE official API first."""
    # url-quoted: a ticker such as M&M would otherwise be cut at the "&"
    data = _nse.get(f"/api/quote-equity?symbol={_urlquote(symbol.upper(), safe='')}")
    if not data:
        return None
    try:
        pd   = data.get("priceInfo", {})
        info = data.get("info", {})
        meta = data.get("metadata", {})
        if _num(pd.get("lastPrice")) is None:
            return None
        return {
            "symbol":      symbol.upper(),
            "name":        info.get("companyName", symbol),
            "exchange":    "NSE",
            "price":       pd.get("lastPrice"),
            "change":      pd.get("change"),
            "change_pct":  pd.get("pChange"),
            "open":        pd.get("open"),
            "high":        pd.get("intraDayHighLow", {}).get("max"),
            "low":         pd.get("intraDayHighLow", {}).get("min"),
            "prev_close":  pd.get("previousClose"),
            "volume":      meta.get("totalTradedVolume"),
            "market_cap":  None,
            "pe_ratio":    None,        # not part of this payload: see get_fundamentals()
            "price_to_book": None,
            "week52_high": pd.get("weekHighLow", {}).get("max"),
            "week52_low":  pd.get("weekHighLow", {}).get("min"),
            "source":      "nse_api",
        }
    except Exception:
        return None


def _quote_from_yfinance(symbol: str, exchange: str = "NSE") -> dict | None:
    """Fallback: yfinance for any symbol."""
    suffix = NSE_SUFFIX if exchange.upper() == "NSE" else BSE_SUFFIX
    ticker_sym = f"{symbol.upper()}{suffix}"
    try:
        t    = yf.Ticker(ticker_sym)
        info = t.fast_info
        hist = t.history(period="2d", interval="1d")
        if hist.empty:
            return None
        hist = hist.dropna(subset=["Close"])
        if hist.empty:
            return None
        prev  = _pos(hist["Close"].iloc[-2]) if len(hist) >= 2 else None
        price = float(hist["Close"].iloc[-1])
        chg   = round(price - prev, 2) if prev else None
        chg_p = round((chg / prev) * 100, 2) if prev and chg is not None else None
        vol   = _num(hist["Volume"].iloc[-1])
        return {
            "symbol":      symbol.upper(),
            "name":        getattr(info, "long_name", symbol),
            "exchange":    exchange.upper(),
            "price":       price,
            "change":      chg,
            "change_pct":  chg_p,
            "open":        _num(hist["Open"].iloc[-1]),
            "high":        _num(hist["High"].iloc[-1]),
            "low":         _num(hist["Low"].iloc[-1]),
            "prev_close":  prev,
            "volume":      int(vol) if vol is not None else None,
            "market_cap":  getattr(info, "market_cap", None),
            # This used to be price_to_book under the name "pe_ratio": a different ratio under a wrong label. fast_info carries
            # neither ratio, so neither is guessed here; get_fundamentals() reads them (labelled) from Yahoo's company info.
            "pe_ratio":    None,
            "price_to_book": None,
            "week52_high": getattr(info, "year_high", None),
            "week52_low":  getattr(info, "year_low", None),
            "source":      "yfinance",
        }
    except Exception:
        return None


def get_quote(symbol: str, exchange: str = "NSE") -> dict:
    """
    Public API. Returns live quote dict.
    L1: in-memory cache → L2: SQLite cache → L3: live fetch
    An unknown or malformed symbol returns {"error": ..., "symbol": ...}; a missing figure is None, never 0.
    """
    symbol = (symbol or "").strip().upper()
    exchange = (exchange or "NSE").strip().upper()
    if not _SYMBOL_OK.match(symbol):
        return {"error": "Invalid symbol", "symbol": symbol}
    if exchange not in _EXCHANGES:
        return {"error": "Exchange must be NSE or BSE", "symbol": symbol}
    key = f"quote:{exchange}:{symbol}".upper()

    # L1 — memory
    cached = cache.get(key, TTL_QUOTE)
    if cached:
        return cached

    # a symbol that just failed is not retried for a few seconds
    if cache.get(key + ":miss", TTL_MISS):
        return {"error": f"Could not fetch quote for {symbol}", "symbol": symbol}

    # L2 — SQLite
    db_row = get_quote_cached(symbol, exchange, TTL_QUOTE)
    if db_row:
        cache.set(key, db_row)
        return db_row

    # L3 — live fetch
    result = _quote_from_nse(symbol) if exchange == "NSE" else None
    if not result:
        result = _quote_from_yfinance(symbol, exchange)
    if not result:
        cache.set(key + ":miss", True)
        return {"error": f"Could not fetch quote for {symbol}", "symbol": symbol}

    cache.set(key, result)
    try:
        cache_quote(symbol, exchange, result)
    except Exception:                      # the SQLite copy is an optimisation; a quote is still a quote without it
        pass
    return result


def get_multiple_quotes(symbols: list[str], exchange: str = "NSE") -> list[dict]:
    """Quotes for several symbols, fetched a few at a time (50 serial network calls would take minutes). Order is kept."""
    syms = list(symbols)[:MAX_BULK]
    if len(syms) <= 1:
        return [get_quote(s, exchange) for s in syms]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        return list(pool.map(lambda s: get_quote(s, exchange), syms))


# ── Fundamentals (P/E, P/B, market cap) ───────────────────────────────────────────

def fundamentals_from_info(symbol: str, exchange: str, info: dict) -> dict:
    """Pure: Yahoo's company `info` dict -> the few ratios we show, each only when it is a sane positive number.
    The trailing P/E is cross-checked against price / trailing EPS; if the two disagree by more than 15% the P/E is withheld
    rather than shown (Yahoo mixes reporting currencies and stale prices for some listings)."""
    info = info or {}
    price = _pos(info.get("currentPrice")) or _pos(info.get("regularMarketPrice")) or _pos(info.get("previousClose"))
    eps = _num(info.get("trailingEps"))
    pe = _pos(info.get("trailingPE"))
    pe_checked = False
    pe_note = None
    if pe is not None and price is not None and eps is not None and eps > 0:
        implied = price / eps
        pe_checked = True
        if abs(pe - implied) / implied > 0.15:
            pe, pe_note = None, "Yahoo's P/E did not agree with price / EPS, so it is not shown"
    if pe is None and pe_note is None:
        pe_note = "Not available (loss-making, newly listed, or not reported)"
    out = {
        "symbol": symbol,
        "exchange": exchange,
        "name": (info.get("longName") or info.get("shortName") or None),
        "sector": info.get("sector") or None,
        "industry": info.get("industry") or None,
        "pe_ratio": round(pe, 2) if pe is not None else None,
        "pe_basis": "trailing twelve months" if pe is not None else None,
        "pe_cross_checked": pe_checked if pe is not None else None,
        "pe_note": pe_note,
        "price_to_book": round(_pos(info.get("priceToBook")), 2) if _pos(info.get("priceToBook")) is not None else None,
        "eps_ttm": round(eps, 2) if eps is not None else None,
        "market_cap": _pos(info.get("marketCap")),
        "currency": info.get("currency") or None,
        "source": "yfinance (Yahoo Finance company info). Third-party figures, not exchange-published.",
    }
    useful = any(out[k] is not None for k in ("pe_ratio", "price_to_book", "eps_ttm", "market_cap", "name", "sector"))
    return out if useful else {"error": f"No fundamentals available for {symbol}", "symbol": symbol}


def get_fundamentals(symbol: str, exchange: str = "NSE") -> dict:
    symbol = (symbol or "").strip().upper()
    exchange = (exchange or "NSE").strip().upper()
    if not _SYMBOL_OK.match(symbol):
        return {"error": "Invalid symbol", "symbol": symbol}
    if exchange not in _EXCHANGES:
        return {"error": "Exchange must be NSE or BSE", "symbol": symbol}
    key = f"fundamentals:{exchange}:{symbol}"
    cached = cache.get(key, TTL_FUNDAMENTALS)
    if cached:
        return cached
    if cache.get(key + ":miss", 120):
        return {"error": f"Fundamentals unavailable for {symbol}", "symbol": symbol}
    suffix = NSE_SUFFIX if exchange == "NSE" else BSE_SUFFIX
    try:
        info = yf.Ticker(f"{symbol}{suffix}").info or {}
    except Exception:
        info = {}
    out = fundamentals_from_info(symbol, exchange, info)
    out["as_of"] = int(time.time())
    if "error" in out:
        cache.set(key + ":miss", True)
        return out
    cache.set(key, out)
    return out


# ── Index data ─────────────────────────────────────────────────────────────────

def _index_from_nse(idx: dict) -> dict:
    """One row of NSE's allIndices. Fields NSE does not send stay None."""
    return {
        "price":          _num(idx.get("last")),
        "change":         _num(idx.get("variation")),
        "change_pct":     _num(idx.get("percentChange")),
        "open":           _num(idx.get("open")),
        "high":           _num(idx.get("high", idx.get("dayHigh"))),
        "low":            _num(idx.get("low", idx.get("dayLow"))),
        "prev_close":     _num(idx.get("previousClose")),
        "year_high":      _num(idx.get("yearHigh")),
        "year_low":       _num(idx.get("yearLow")),
        # NSE's own published index ratios (strings in the payload)
        "pe":             _num(idx.get("pe")),
        "pb":             _num(idx.get("pb")),
        "dividend_yield": _num(idx.get("dy")),
        "source":         "nse_api",
    }


def get_market_overview() -> dict:
    key = "market:overview"
    cached = cache.get(key, TTL_INDEX)
    if cached:
        return cached

    indices = {}
    # Try NSE allIndices endpoint
    nse_data = _nse.get("/api/allIndices")
    if nse_data and "data" in nse_data:
        for idx in nse_data["data"]:
            name = idx.get("indexSymbol", "")
            if name in ("NIFTY 50", "NIFTY BANK", "NIFTY IT", "INDIA VIX", "NIFTY MIDCAP 50"):
                row = _index_from_nse(idx)
                if row["price"] is not None:
                    indices[name] = row
    # Fallback: yfinance for missing ones
    for name, ticker in INDEX_TICKERS.items():
        if name not in indices:
            try:
                t    = yf.Ticker(ticker)
                hist = t.history(period="5d").dropna(subset=["Close"])
                if not hist.empty:
                    price = float(hist["Close"].iloc[-1])
                    prev  = _pos(hist["Close"].iloc[-2]) if len(hist) >= 2 else None
                    indices[name] = {
                        "price":      round(price, 2),
                        # no previous close -> no change; never a made-up 0
                        "change":     round(price - prev, 2) if prev else None,
                        "change_pct": round((price - prev) / prev * 100, 2) if prev else None,
                        "source":     "yfinance",
                    }
            except Exception:
                pass

    result = {"indices": indices, "as_of": int(time.time())}
    if indices:                                   # never cache an empty answer
        cache.set(key, result)
    return result


# ── Sector indices ─────────────────────────────────────────────────────────────

# NSE index name -> (short label, yfinance fallback ticker)
SECTOR_INDICES = {
    "NIFTY IT":     ("IT",     "^CNXIT"),
    "NIFTY BANK":   ("BANK",   "^NSEBANK"),
    "NIFTY FMCG":   ("FMCG",   "^CNXFMCG"),
    "NIFTY PHARMA": ("PHARMA", "^CNXPHARMA"),
    "NIFTY AUTO":   ("AUTO",   "^CNXAUTO"),
    "NIFTY METAL":  ("METAL",  "^CNXMETAL"),
    "NIFTY ENERGY": ("ENERGY", "^CNXENERGY"),
    "NIFTY REALTY": ("REALTY", "^CNXREALTY"),
}


def get_sector_overview() -> dict:
    """Day change for the main NSE sector indices. NSE's allIndices first, yfinance for any it lacks.
    Sectors that cannot be fetched are simply absent — callers must not invent numbers for them."""
    key = "market:sectors"
    cached = cache.get(key, TTL_INDEX)
    if cached:
        return cached

    sectors = {}
    nse_data = _nse.get("/api/allIndices")
    if nse_data and "data" in nse_data:
        for idx in nse_data["data"]:
            name = idx.get("indexSymbol", "")
            if name in SECTOR_INDICES and _num(idx.get("percentChange")) is not None:
                sectors[name] = {
                    "label":      SECTOR_INDICES[name][0],
                    "price":      _num(idx.get("last")),
                    "change":     _num(idx.get("variation")),
                    "change_pct": _num(idx.get("percentChange")),
                    "source":     "nse_api",
                }
    for name, (label, ticker) in SECTOR_INDICES.items():
        if name in sectors:
            continue
        try:
            hist = yf.Ticker(ticker).history(period="5d").dropna(subset=["Close"])
            if len(hist) >= 2:
                price = float(hist["Close"].iloc[-1])
                prev = _pos(hist["Close"].iloc[-2])
                if not prev:
                    continue
                sectors[name] = {
                    "label": label, "price": round(price, 2), "change": round(price - prev, 2),
                    "change_pct": round((price - prev) / prev * 100, 2), "source": "yfinance",
                }
        except Exception:
            pass

    result = {"sectors": sectors, "as_of": int(time.time())}
    if sectors:                                   # never cache an empty answer
        cache.set(key, result)
    return result


# ── Mutual Fund NAVs ───────────────────────────────────────────────────────────

_mf_nav_store: dict[str, dict] = {}   # scheme_code → {nav, name, ...}
_mf_last_loaded = 0
_mf_last_attempt = 0
_MF_RETRY = 60                         # seconds between attempts while AMFI is unreachable (was: every request, 20s each)
_AMFI_CATEGORY = re.compile(r"^(open ended|close ended|closed ended|interval)\b", re.I)


def parse_amfi_navall(text: str) -> dict[str, dict]:
    """Pure: AMFI's NAVAll.txt -> {scheme_code: {...}}. Columns are located by header name (AMFI has reordered them before).
    A NAV of "N.A." or anything non-numeric is None, never 0."""
    out: dict[str, dict] = {}
    fund_house = ""
    category = ""
    i_name, i_nav, i_date, i_plan, i_opt = 3, 4, 5, None, None
    for line in text.splitlines():
        parts = [p.strip() for p in line.strip().split(";")]
        if len(parts) >= 5 and parts[0].lower().startswith("scheme code"):
            low = [p.lower() for p in parts]
            i_name = next((i for i, h in enumerate(low) if h in ("scheme name", "nav name")), i_name)
            i_nav  = next((i for i, h in enumerate(low) if h.startswith("net asset value")), i_nav)
            i_date = next((i for i, h in enumerate(low) if h == "date"), len(parts) - 1)
            i_plan = next((i for i, h in enumerate(low) if h == "plan"), None)
            i_opt  = next((i for i, h in enumerate(low) if h == "option"), None)
            continue
        if len(parts) == 1 and parts[0] and not parts[0][0].isdigit():
            if _AMFI_CATEGORY.match(parts[0]):
                category = parts[0]
            else:
                fund_house = parts[0]
            continue
        if len(parts) > max(i_name, i_nav, i_date) and parts[0].isdigit():
            code = parts[0]
            out[code] = {
                "scheme_code": code,
                "scheme_name": parts[i_name],
                "nav":         _pos(parts[i_nav]),
                "date":        parts[i_date],
                "fund_house":  fund_house,
                "category":    category,
                "plan":        parts[i_plan] if i_plan is not None and i_plan < len(parts) else "",
                "option":      parts[i_opt] if i_opt is not None and i_opt < len(parts) else "",
            }
    return out


def _load_amfi_navs():
    global _mf_last_loaded, _mf_last_attempt, _mf_nav_store
    now = time.time()
    if now - _mf_last_loaded < TTL_MF_NAV:
        return
    if now - _mf_last_attempt < _MF_RETRY:
        return
    _mf_last_attempt = now
    try:
        r = requests.get(AMFI_NAV_URL, timeout=20)
        r.raise_for_status()
        parsed = parse_amfi_navall(r.text)
        if parsed:                       # swap in whole: a half-read file never replaces a good one
            _mf_nav_store = parsed
            _mf_last_loaded = time.time()
    except Exception:
        pass


def get_mf_nav(scheme_code: str) -> dict:
    _load_amfi_navs()
    data = _mf_nav_store.get(str(scheme_code))
    if data:
        return data
    return {"error": f"Scheme code {scheme_code} not found in AMFI data"}


def search_mf(query: str, limit: int = 10) -> list[dict]:
    """Every word of the query must appear in the scheme name, fund house, plan or option (any order)."""
    _load_amfi_navs()
    words = [w for w in (query or "").lower().split() if w]
    if not words:
        return []
    limit = max(1, min(int(limit or 10), 100))
    results = []
    for v in list(_mf_nav_store.values()):
        hay = " ".join((v.get("scheme_name", ""), v.get("fund_house", ""), v.get("plan", ""), v.get("option", ""))).lower()
        if all(w in hay for w in words):
            results.append(v)
            if len(results) >= limit:
                break
    return results


# ── Mutual fund NAV history ───────────────────────────────────────────────────
# AMFI publishes the full NAV history only as large per-fund-house, per-date-range downloads (about 10 MB for nine months of one
# fund house). api.mfapi.in is a free public mirror of those same AMFI NAVs, one small JSON per scheme. It is a third-party host;
# before relying on it, 189 daily NAVs of one scheme were compared with AMFI's own history report and all 189 matched. Every
# response here is also compared with AMFI's daily NAVAll file (see "amfi_check") so a drift would be visible.

MFAPI_BASE = os.getenv("MFAPI_BASE", "https://api.mfapi.in/mf")
TTL_MF_HISTORY = 6 * 3600
_SCHEME_CODE = re.compile(r"^\d{3,8}$")


def _iso_date(s) -> str | None:
    """'13-10-2026' (mfapi) or '13-Oct-2026' (AMFI) -> '2026-10-13'."""
    for fmt in ("%d-%m-%Y", "%d-%b-%Y"):
        try:
            return datetime.strptime(str(s).strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


def mf_history_from_mfapi(code: str, raw: dict, years: float = 6) -> dict:
    """Pure: mfapi.in payload -> {"history": [[iso_date, nav], ...] ascending, meta...}. Bad rows are dropped, not zeroed."""
    meta = (raw or {}).get("meta") or {}
    rows = {}
    for r in (raw or {}).get("data") or []:
        if not isinstance(r, dict):
            continue
        d, n = _iso_date(r.get("date")), _pos(r.get("nav"))
        if d and n is not None:
            rows[d] = n
    if not rows:
        return {"error": f"No NAV history found for scheme {code}", "scheme_code": code}
    series = sorted(rows.items())
    first_available = series[0][0]
    last_date = series[-1][0]
    if years:
        cutoff = (datetime.fromisoformat(last_date) - timedelta(days=int(years * 366))).date().isoformat()
        series = [x for x in series if x[0] >= cutoff]
    return {
        "scheme_code": code,
        "scheme_name": meta.get("scheme_name") or "",
        "fund_house": meta.get("fund_house") or "",
        "scheme_category": meta.get("scheme_category") or "",
        "scheme_type": meta.get("scheme_type") or "",
        "isin_growth": meta.get("isin_growth") or None,
        "isin_div_reinvestment": meta.get("isin_div_reinvestment") or None,
        "history": [[d, n] for d, n in series],
        "count": len(series),
        "first_date": series[0][0],
        "last_date": last_date,
        "earliest_available": first_available,
        "source": "AMFI NAVs via api.mfapi.in (a public mirror of AMFI's published NAVs)",
    }


def get_mf_history(scheme_code: str, years: float = 6) -> dict:
    code = str(scheme_code or "").strip()
    if not _SCHEME_CODE.match(code):
        return {"error": "Invalid scheme code", "scheme_code": code}
    try:
        years = max(0.1, min(float(years), 30))
    except (TypeError, ValueError):
        years = 6
    key = f"mf:history:{code}:{years}"
    cached = cache.get(key, TTL_MF_HISTORY)
    if cached:
        return cached
    try:
        r = requests.get(f"{MFAPI_BASE}/{code}", timeout=15)
        r.raise_for_status()
        raw = r.json()
    except Exception:
        return {"error": "NAV history source could not be reached", "scheme_code": code}
    out = mf_history_from_mfapi(code, raw, years)
    if "error" in out:
        return out
    # cross-check the latest NAV against AMFI's daily file
    check = {"checked": False, "matches": None}
    _load_amfi_navs()
    ref = _mf_nav_store.get(code)
    if ref and ref.get("nav") is not None and _iso_date(ref.get("date")) == out["last_date"]:
        last_nav = out["history"][-1][1]
        check = {"checked": True, "matches": abs(last_nav - ref["nav"]) <= 0.0006, "amfi_nav": ref["nav"], "date": out["last_date"]}
    out["amfi_check"] = check
    out["as_of"] = int(time.time())
    cache.set(key, out)
    return out


# ── Gold & Silver ──────────────────────────────────────────────────────────────

def get_commodities() -> dict:
    """
    Gold/silver are a *global-price-converted-to-INR estimate*, not MCX's
    actual quoted price — labels corrected to say so after investigating
    MCX's real site properly (not assumed): mcxindia.com/market-data/
    spot-market-price has the right table headers in static HTML, but the
    price cells themselves are "Data not available" — populated by
    JavaScript/AJAX after load, same pattern confirmed on AMFI's and RBI's
    sites (see get_fx_rates()'s docstring). A real MCX scrape would need a
    headless browser, which this project has consistently avoided.
    The number shown here will run a few % below MCX's real traded price —
    MCX's price bakes in import duty (~6-15%), GST, and a local market
    premium/discount that a global-futures-to-INR conversion doesn't capture.

    The INR conversion needs a live USD/INR rate. If that rate cannot be fetched, gold and silver are NOT converted with a
    guessed rate: they are listed under "unavailable" (with the USD price, which needs no conversion) and left out of
    "commodities".
    """
    key = "commodities"
    cached = cache.get(key, TTL_GOLD)
    if cached:
        return cached

    data = {}
    unavailable = {}
    commodity_tickers = {
        "GOLD (10g, global equiv.)":   "GC=F",    # Gold futures USD/oz → convert
        "SILVER (1kg, global equiv.)": "SI=F",
        "CRUDE OIL (bbl)":  "CL=F",
        "NATURAL GAS":      "NG=F",
    }
    # USD/INR for the conversion: the real rate or nothing
    usd_inr = _pos(get_fx_rates().get("USD_INR"))
    fx_note = "global futures price converted to INR, not MCX's actual quote"

    for label, ticker in commodity_tickers.items():
        try:
            t    = yf.Ticker(ticker)
            hist = t.history(period="5d").dropna(subset=["Close"])
            if hist.empty:
                continue
            price_usd  = float(hist["Close"].iloc[-1])
            prev_usd   = _pos(hist["Close"].iloc[-2]) if len(hist) >= 2 else None
            chg_pct    = round((price_usd - prev_usd) / prev_usd * 100, 2) if prev_usd else None
            try:
                price_date = str(hist.index[-1].date())
            except Exception:
                price_date = None

            if "GOLD" in label or "SILVER" in label:
                per, unit, usd_unit = (10, "₹/10g", "USD/oz") if "GOLD" in label else (1000, "₹/kg", "USD/oz")
                if usd_inr is None:
                    unavailable[label] = {
                        "reason": "The USD/INR rate could not be fetched, so the rupee price is not shown rather than guessed",
                        "price_usd": round(price_usd, 2), "usd_unit": usd_unit, "change_pct": chg_pct, "price_date": price_date,
                    }
                    continue
                price_inr = round(price_usd * usd_inr / 31.1035 * per, 0)       # USD per troy oz -> INR per 10 g / per kg
                data[label] = {"price": price_inr, "unit": unit, "change_pct": chg_pct, "note": fx_note,
                               "price_usd": round(price_usd, 2), "usd_unit": usd_unit, "usd_inr": usd_inr, "price_date": price_date}
            elif "CRUDE" in label:
                data[label] = {"price": round(price_usd, 2), "unit": "USD/bbl", "change_pct": chg_pct, "price_date": price_date}
            else:
                data[label] = {"price": round(price_usd, 2), "unit": "USD/MMBtu", "change_pct": chg_pct, "price_date": price_date}
        except Exception:
            pass

    result = {"commodities": data, "unavailable": unavailable, "as_of": int(time.time())}
    if len(data) == len(commodity_tickers) and not unavailable:   # a partial answer is returned but not remembered, so the next request tries again
        cache.set(key, result)
    return result


# ── Crypto ────────────────────────────────────────────────────────────────────

_COIN_ID = re.compile(r"^[a-z0-9][a-z0-9\-]{0,39}$")
_DEFAULT_COINS = ["bitcoin", "ethereum", "ripple", "dogecoin", "matic-network"]


def get_crypto(coins: list[str] | None = None) -> dict:
    ids = [c.strip().lower() for c in (coins or _DEFAULT_COINS) if c and c.strip()]
    ids = [c for c in dict.fromkeys(ids) if _COIN_ID.match(c)][:20]
    if not ids:
        return {"error": "No valid coin ids"}
    # keyed by the coins actually asked for (it used to be keyed by a different default list, so two requests could swap answers)
    key = "crypto:" + ",".join(sorted(ids))
    cached = cache.get(key, TTL_CRYPTO)
    if cached:
        return cached
    if cache.get(key + ":err", 30):
        return {"error": "Crypto price source could not be reached"}

    try:
        url = f"{COINGECKO_BASE}/simple/price"
        r   = requests.get(url, params={
            "ids":            ",".join(ids),
            "vs_currencies":  "inr,usd",
            "include_24hr_change": "true",
            "include_market_cap":  "true",
            "include_last_updated_at": "true",
        }, timeout=10)
        r.raise_for_status()
        raw    = r.json()
        result = {}
        names  = {"bitcoin": "Bitcoin", "ethereum": "Ethereum", "ripple": "XRP",
                  "dogecoin": "Dogecoin", "matic-network": "Polygon"}
        for cid, vals in (raw or {}).items():
            if not isinstance(vals, dict):
                continue
            result[cid] = {
                "name":          names.get(cid, cid.replace("-", " ").title()),
                "price_inr":     _num(vals.get("inr")),
                "price_usd":     _num(vals.get("usd")),
                "change_24h":    _num(vals.get("inr_24h_change")),     # percent, in INR terms
                "market_cap_inr": _num(vals.get("inr_market_cap")),
                "last_updated":  vals.get("last_updated_at") if isinstance(vals.get("last_updated_at"), int) else None,
            }
        out = {"crypto": result, "as_of": int(time.time()), "source": "CoinGecko"}
        if result:
            cache.set(key, out)
        return out
    except Exception:
        cache.set(key + ":err", True)
        return {"error": "Crypto price source could not be reached"}


# ── Forex / FX ────────────────────────────────────────────────────────────────

def get_fx_rates() -> dict:
    """
    yfinance forex tickers, not RBI's official reference rate — investigated
    properly (not assumed): RBI's ReferenceRateArchive.aspx is an ASP.NET
    WebForms page whose data only loads via __doPostBack (no plain URL
    returns it — confirmed via direct fetch, zero rate-shaped numbers
    anywhere in the static HTML). RBI's DBIE data portal is an Angular SPA
    shell, same story. Both need a headless browser to scrape, which this
    project has consistently avoided elsewhere (see AMFI's NAV page,
    investigated and found infeasible the same way during rag-engine's
    build). yfinance's live forex tickers are the pragmatic working
    alternative, same call as keeping AMFI's NAVAll.txt flat file instead
    of scraping their JS-rendered site.

    Returns {"USD_INR": rate, ...} for the pairs that could be fetched; {} when none could. A rate that is not fetched is absent:
    callers must not substitute a number.
    """
    key = "fx:rates"
    cached = cache.get(key, TTL_FX)
    if cached:
        return cached

    pairs = {"USD_INR": "USDINR=X", "EUR_INR": "EURINR=X", "GBP_INR": "GBPINR=X",
             "JPY_INR": "JPYINR=X", "AED_INR": "AEDINR=X"}
    rates = {}
    for name, ticker in pairs.items():
        try:
            t    = yf.Ticker(ticker)
            hist = t.history(period="2d").dropna(subset=["Close"])
            if not hist.empty:
                rate = _pos(hist["Close"].iloc[-1])
                if rate is not None:
                    rates[name] = round(rate, 4)
        except Exception:
            pass

    if rates:
        cache.set(key, rates)
    return rates


# ── Historical OHLCV ──────────────────────────────────────────────────────────

def get_historical(symbol: str, period: str = "1y", interval: str = "1d",
                   exchange: str = "NSE") -> dict:
    suffix = NSE_SUFFIX if exchange.upper() == "NSE" else BSE_SUFFIX
    ticker_sym = f"{symbol.upper()}{suffix}"
    try:
        t    = yf.Ticker(ticker_sym)
        hist = t.history(period=period, interval=interval)
        if hist.empty:
            return {"error": "No historical data"}
        return {
            "symbol":   symbol.upper(),
            "period":   period,
            "interval": interval,
            "ohlcv": [
                {
                    "date":   str(idx.date()),
                    "open":   round(float(row["Open"]),   2),
                    "high":   round(float(row["High"]),   2),
                    "low":    round(float(row["Low"]),    2),
                    "close":  round(float(row["Close"]),  2),
                    "volume": int(row["Volume"]),
                }
                for idx, row in hist.iterrows()
            ],
        }
    except Exception as e:
        return {"error": str(e)}


# ── Chart data in the shape the Trading Brain page reads ─────────────────────
# The page used to fetch Yahoo Finance through a public relay (allorigins.win), which saw every symbol looked up. This serves the same
# arrays from this machine instead. `symbol` is a Yahoo symbol exactly as the page uses it (RELIANCE.NS, ^NSEI, GC=F).
import re as _re

_CHART_SYMBOL    = _re.compile(r"^[A-Za-z0-9.^=&\-]{1,24}$")
_CHART_INTERVALS = {"1m", "2m", "5m", "15m", "30m", "60m", "1h", "1d", "5d", "1wk", "1mo"}
_CHART_RANGES    = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"}
TTL_CHART        = 60


def get_chart(symbol: str, interval: str = "1d", range_: str = "3mo") -> dict:
    if not _CHART_SYMBOL.match(symbol or ""):
        return {"error": "Invalid symbol"}
    if interval not in _CHART_INTERVALS or range_ not in _CHART_RANGES:
        return {"error": "Invalid interval or range"}
    key = f"chart:{symbol}:{interval}:{range_}".upper()
    cached = cache.get(key, TTL_CHART)
    if cached:
        return cached
    try:
        t = yf.Ticker(symbol)
        hist = t.history(period=range_, interval=interval, auto_adjust=False)
        if hist is None or hist.empty:
            return {"error": f"No data for {symbol}"}
        hist = hist.dropna(subset=["Close"])
        col = lambda name: [round(float(v), 2) for v in hist[name].tolist()]   # noqa: E731
        closes = col("Close")
        current = closes[-1]
        try:
            last = float(t.fast_info.last_price)
            if last > 0:
                current = round(last, 2)
        except Exception:                                                     # noqa: BLE001  fast_info is optional
            pass
        daily = interval in ("1d", "5d", "1wk", "1mo")
        try:
            dates = [ts.strftime("%Y-%m-%d") if daily else ts.isoformat() for ts in hist.index]
        except Exception:                                                     # noqa: BLE001
            dates = []
        out = {"symbol": symbol, "interval": interval, "closes": closes, "opens": col("Open"), "highs": col("High"), "lows": col("Low"),
               "volumes": [int(v) for v in hist["Volume"].fillna(0).tolist()], "currentPrice": current,
               "dates": dates if len(dates) == len(closes) else []}
        cache.set(key, out)
        return out
    except Exception as e:                                                    # noqa: BLE001
        return {"error": str(e)}


# ── Market status ─────────────────────────────────────────────────────────────

def get_market_status() -> dict:
    key = "market:status"
    cached = cache.get(key, 30)
    if cached:
        return cached
    data = _nse.get("/api/marketStatus") or {}
    status = {"open": False, "message": "Market data unavailable"}
    if "marketState" in data:
        for m in data["marketState"]:
            if m.get("market") == "Capital Market":
                status = {
                    "open":    m.get("marketStatus", "").lower() == "open",
                    "message": m.get("tradeDate", ""),
                    "status":  m.get("marketStatus", ""),
                }
                break
    cache.set(key, status)
    return status
