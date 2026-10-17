#!/usr/bin/env python3
"""
Portfolio.AI — Real-Time Fundamentals Backend  v2.0
=====================================================
FastAPI server that powers portfolio-analyser-v3.html with live data.

DATA SOURCES (parallel, per request):
  1. NSE India official API   — price, O/H/L, 52w, delivery %, circuit limits
  2. yfinance quoteSummary    — PE, PB, ROE, EV/EBITDA, margins, EPS, mktCap, beta
  3. Screener.in scraper      — D/E, current ratio, ROCE, ROE cross-check (fallback)

ENDPOINTS:
  GET /health                        — server status + cache stats
  GET /quote/{symbol}                — full live quote + fundamentals
  GET /bulk?symbols=A,B,C            — batch up to 50 symbols in parallel
  GET /history/{symbol}              — OHLCV history (configurable period + interval)

CACHING:
  Prices      → 60s TTL  (live market hours)
  Fundamentals→ 6h TTL   (PE/ROE don't change minute-to-minute)
  History     → 5min TTL

INSTALL & RUN:
  pip install fastapi uvicorn yfinance pandas httpx cachetools
  python server.py
  → http://localhost:8765
"""

import asyncio
import threading
import time
import re
import logging
import os
import math
import json
from datetime import datetime, timezone

import httpx
import yfinance as yf
import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from cachetools import TTLCache

# ── Config ────────────────────────────────────────────────────────────────────
PRICE_TTL      = 60          # seconds
FUND_TTL       = 6 * 3600    # 6 hours
HISTORY_TTL    = 300         # 5 min
MAX_CONCURRENT = 20          # raised from 10 — handles 77+ symbols concurrently
PORT           = 8766

NSE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-IN,en-GB;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
}
NSE_API_HEADERS = {
    **NSE_HEADERS,
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.nseindia.com/get-quotes/equity",
    "X-Requested-With": "XMLHttpRequest",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
}

# ── App + caches ──────────────────────────────────────────────────────────────
app = FastAPI(title="Portfolio.AI Live API", version="2.1.0")
_cors_origins = [origin.strip() for origin in os.getenv(
    "PORTFOLIO_ANALYSER_CORS", "https://finos1.vercel.app"
).split(",") if origin.strip() and origin.strip() != "*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?$",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "X-Requested-With"],
    expose_headers=["Access-Control-Allow-Private-Network", "Retry-After"],
)

# Chrome's Private Network Access policy requires this header when a public
# (or HTTPS) page tries to fetch from localhost.  Returning it here means the
# browser's preflight succeeds even when the app is loaded from Vercel/HTTPS.
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response as StarletteResponse

class PrivateNetworkMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        if request.headers.get("Access-Control-Request-Private-Network") == "true" \
                or request.method == "OPTIONS":
            response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response

app.add_middleware(PrivateNetworkMiddleware)

price_cache = TTLCache(maxsize=500, ttl=PRICE_TTL)
fund_cache  = TTLCache(maxsize=500, ttl=FUND_TTL)
hist_cache  = TTLCache(maxsize=200, ttl=HISTORY_TTL)

# ── Upstream protection ───────────────────────────────────────────────────────
# A 60 s refresh of a ~80 holding portfolio used to cost ~500 upstream requests a minute (NSE x3, Screener x2, Yahoo x3+ per
# symbol, fundamentals re-fetched although cached for 6 h, unknown symbols retried forever). Yahoo/NSE answered 429/403 and the
# browser console filled with 502/429. These pieces keep the request count proportional to what actually changed:
NEG_TTL        = 600          # a symbol every source rejected is not asked about again for 10 minutes
STALE_TTL      = 24 * 3600    # the last good price/fundamentals are served (flagged stale) while a provider is backing off
BACKOFF_SECS   = {"nse": 180, "yahoo": 120, "screener": 900}   # how long a provider is left alone after 429/403
MAX_YF_CONCURRENT  = 4        # Yahoo is the provider that rate-limits; keep its parallelism small
MAX_NSE_CONCURRENT = 6
NSE_SESSION_TTL    = 300      # one cookie handshake per 5 minutes instead of two extra requests per symbol

neg_cache   = TTLCache(maxsize=2000, ttl=NEG_TTL)
scr_cache   = TTLCache(maxsize=1000, ttl=FUND_TTL)     # Screener results, {} included, so a miss is not retried every minute
stale_price = TTLCache(maxsize=2000, ttl=STALE_TTL)
stale_fund  = TTLCache(maxsize=2000, ttl=STALE_TTL)

_backoff_until: dict = {"nse": 0.0, "yahoo": 0.0, "screener": 0.0}
upstream_calls: dict = {"nse": 0, "yahoo": 0, "screener": 0, "rate_limited": 0}
_inflight: dict = {}                                    # symbol -> task: concurrent callers share one fetch
_yf_sem  = threading.BoundedSemaphore(MAX_YF_CONCURRENT)
_nse_state: dict = {"client": None, "ready_at": 0.0, "lock": None, "sem": None}

def backing_off(provider: str) -> bool:
    return time.time() < _backoff_until.get(provider, 0.0)

def backoff_remaining() -> int:
    return max(0, int(max(_backoff_until.values()) - time.time() + 0.999))

def trip_backoff(provider: str, why: str = "") -> None:
    now = time.time()
    if now >= _backoff_until[provider]:
        log.warning(f"{provider}: rate limited ({why}) — pausing it for {BACKOFF_SECS[provider]}s, serving cached data")
    _backoff_until[provider] = now + BACKOFF_SECS[provider]
    upstream_calls["rate_limited"] += 1

def is_rate_limit(exc: Exception) -> bool:
    name = type(exc).__name__.lower()
    text = str(exc).lower()
    return "ratelimit" in name or "too many requests" in text or "429" in text

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("portfolio.ai")

# ── Ticker helpers ────────────────────────────────────────────────────────────
_YF_OVERRIDES = {
    "M&M":        "M%26M.NS",
    "L&T":        "LT.NS",
    "BAJAJ-AUTO": "BAJAJ-AUTO.NS",
    "HDFCAMC":    "HDFCAMC.NS",
    "LTIM":       "LTIM.NS",
}

# Broker exports mark some listings with a series suffix (-EQ, -BE, and -E on ETFs such as "GOLDBEES-E"). The exchange symbol
# has none of them: "GOLDBEES-E" is a guaranteed miss on NSE and Yahoo, and used to be re-requested on every refresh.
_SERIES_SUFFIX = re.compile(r"-(?:EQ|BE|E)$")

def _strip_series(symbol: str) -> str:
    return _SERIES_SUFFIX.sub("", symbol.upper().strip().replace("-EQ", "").replace("-BE", ""))

def to_yf_ticker(symbol: str) -> str:
    s = _strip_series(symbol)
    if s in _YF_OVERRIDES:
        return _YF_OVERRIDES[s]
    # Index tickers (^NSEI, ^BSESN, etc.) must not get the .NS suffix
    if s.startswith("^"):
        return s
    return f"{s}.NS"

def clean_sym(symbol: str) -> str:
    s = _strip_series(symbol)
    # Preserve index prefix (^) — don't normalise away leading caret
    return s

# ── NSE live price ────────────────────────────────────────────────────────────
async def _nse_session() -> "httpx.AsyncClient | None":
    """One shared, cookie-bearing NSE client, re-established at most every NSE_SESSION_TTL seconds.
    NSE wants a browser-like session; doing that handshake (two extra requests) for every symbol is what got it blocked."""
    st = _nse_state
    if st["lock"] is None:
        st["lock"] = asyncio.Lock()
        st["sem"] = asyncio.Semaphore(MAX_NSE_CONCURRENT)
    async with st["lock"]:
        if backing_off("nse"):
            return None
        if st["client"] is not None and time.time() - st["ready_at"] < NSE_SESSION_TTL:
            return st["client"]
        old = st["client"]
        st["client"] = None
        if old is not None:
            try: await old.aclose()
            except Exception: pass
        client = httpx.AsyncClient(headers=NSE_HEADERS, follow_redirects=True)
        try:
            upstream_calls["nse"] += 1
            home = await client.get("https://www.nseindia.com/", headers=NSE_HEADERS, timeout=6.0)
            if home.status_code in (403, 429):
                await client.aclose()
                trip_backoff("nse", f"homepage HTTP {home.status_code}")
                return None
            await client.get("https://www.nseindia.com/get-quotes/equity?symbol=RELIANCE",
                             headers={**NSE_HEADERS, "Referer": "https://www.nseindia.com/"}, timeout=5.0)
        except Exception as e:
            await client.aclose()
            log.debug(f"NSE session failed: {e}")
            return None
        st["client"], st["ready_at"] = client, time.time()
        return client


async def fetch_nse_price(symbol: str, client=None) -> dict:
    """
    Real-time price from NSE's official equity quote API: ONE request per symbol over the shared session.
    Falls back silently (empty dict): yfinance covers the price while NSE is blocked or backing off.
    `client` is accepted for backward compatibility and ignored.
    """
    sym = clean_sym(symbol)
    try:
        session = await _nse_session()
        if session is None:
            return {}
        async with _nse_state["sem"]:
            upstream_calls["nse"] += 1
            r = await session.get(
                f"https://www.nseindia.com/api/quote-equity?symbol={sym}",
                headers=NSE_API_HEADERS,
                timeout=8.0,
            )
        if r.status_code in (401, 403, 429):
            if r.status_code == 401:
                _nse_state["ready_at"] = 0.0          # cookies expired: re-handshake next time, no backoff
            else:
                trip_backoff("nse", f"{sym} HTTP {r.status_code}")
            return {}
        if r.status_code != 200:
            log.debug(f"NSE API {sym}: HTTP {r.status_code}")
            return {}

        d    = r.json()
        pi   = d.get("priceInfo", {})
        si   = d.get("securityInfo", {})
        meta = d.get("metadata", {})
        whl  = pi.get("weekHighLow", {})
        idhl = pi.get("intraDayHighLow", {})

        price = pi.get("lastPrice") or pi.get("close")
        if not price:
            log.debug(f"NSE {sym}: API returned no price")
            return {}

        return {
            "price":       price,
            "open":        pi.get("open"),
            "high":        idhl.get("max") or pi.get("dayHigh"),
            "low":         idhl.get("min")  or pi.get("dayLow"),
            "prevClose":   pi.get("previousClose"),
            "change":      pi.get("change"),
            "changePct":   pi.get("pChange"),
            "volume":      si.get("tradedVolume"),
            "weekHigh52":  whl.get("max"),
            "weekLow52":   whl.get("min"),
            "companyName": meta.get("companyName"),
            "symbol":      meta.get("symbol", sym),
            "series":      meta.get("series"),
            "isin":        meta.get("isin"),
            "faceValue":   si.get("faceValue"),
            "deliveryPct": si.get("deliveryToTradedQuantity"),
            "totalBuyQty": d.get("marketDepth", {}).get("totalBuyQuantity"),
            "totalSellQty":d.get("marketDepth", {}).get("totalSellQuantity"),
            "source":      "NSE",
            "_ts":         time.time(),
        }
    except Exception as e:
        log.debug(f"NSE price failed for {sym}: {e}")
        return {}

# ── Yahoo Finance fundamentals ────────────────────────────────────────────────
def fetch_yf_fundamentals(symbol: str) -> dict:
    """
    Pulls price + fundamentals via yfinance.
    Strategy: fast_info first (reliable price), then .info for fundamentals,
    then .BO BSE fallback if .NS has no price.
    Per-symbol 15s timeout via threading to prevent hangs.
    """
    import threading

    sym = clean_sym(symbol)
    yft = to_yf_ticker(sym)

    def _pos(v):
        try:
            f = float(v)
            return f if f > 0 else None
        except (TypeError, ValueError):
            return None

    def _fetch_ticker(ticker_str: str) -> dict:
        upstream_calls["yahoo"] += 1
        ticker = yf.Ticker(ticker_str)

        # fast_info: reliable, fast (~50ms), gets price even when .info fails
        price_v = prev_v = open_v = high_v = low_v = None
        vol_v = wh52 = wl52 = dma50 = dma200 = mktcap = None
        try:
            fi = ticker.fast_info
            price_v = _pos(getattr(fi, "last_price",               None))
            prev_v  = _pos(getattr(fi, "previous_close",            None))
            open_v  = _pos(getattr(fi, "open",                      None))
            high_v  = _pos(getattr(fi, "day_high",                  None))
            low_v   = _pos(getattr(fi, "day_low",                   None))
            vol_v   = _pos(getattr(fi, "three_month_average_volume", None))
            wh52    = _pos(getattr(fi, "year_high",                  None))
            wl52    = _pos(getattr(fi, "year_low",                   None))
            dma50   = _pos(getattr(fi, "fifty_day_average",          None))
            dma200  = _pos(getattr(fi, "two_hundred_day_average",    None))
            mktcap  = _pos(getattr(fi, "market_cap",                 None))
        except Exception as e:
            if is_rate_limit(e):
                trip_backoff("yahoo", f"fast_info {ticker_str}")

        # .info: fundamentals (PE, ROE, margins) — can fail for some tickers
        info = {}
        if not backing_off("yahoo"):                   # .info is the heavy call; skip it once Yahoo has said "slow down"
            try:
                info = ticker.info or {}
            except Exception as e:
                if is_rate_limit(e):
                    trip_backoff("yahoo", f".info {ticker_str}")
                log.debug(f"YF .info failed for {ticker_str}: {e}")

        def g(key):
            v = info.get(key)
            return v if v not in (None, "N/A", "None", "", 0, "0") else None

        def gp(key):
            v = info.get(key)
            try:
                f = float(v)
                return f if f > 0 else None
            except (TypeError, ValueError):
                return None

        # Merge fast_info price with .info price (fast_info wins)
        price_v = price_v or gp("currentPrice") or gp("regularMarketPrice") or gp("previousClose")
        prev_v  = prev_v  or gp("regularMarketPreviousClose") or gp("previousClose")
        open_v  = open_v  or gp("regularMarketOpen")
        high_v  = high_v  or gp("dayHigh")
        low_v   = low_v   or gp("dayLow")
        vol_v   = vol_v   or g("regularMarketVolume")
        wh52    = wh52    or gp("fiftyTwoWeekHigh")
        wl52    = wl52    or gp("fiftyTwoWeekLow")
        dma50   = dma50   or gp("fiftyDayAverage")
        dma200  = dma200  or gp("twoHundredDayAverage")

        mkt_cap_cr = None
        try:
            mc = mktcap or (float(info.get("marketCap", 0) or 0))
            if mc > 0: mkt_cap_cr = round(mc / 1e7, 0)
        except Exception:
            pass

        change_v = g("regularMarketChange")
        chgpct_v = g("regularMarketChangePercent")
        if change_v is None and price_v and prev_v:
            change_v = round(price_v - prev_v, 2)
            chgpct_v = round((price_v - prev_v) / prev_v * 100, 2)

        return {
            "price": price_v, "open": open_v, "high": high_v, "low": low_v,
            "prevClose": prev_v, "change": change_v, "changePct": chgpct_v,
            "volume": vol_v, "weekHigh52": wh52, "weekLow52": wl52,
            "50dma": dma50, "200dma": dma200,
            "pe": g("trailingPE"), "forwardPE": g("forwardPE"),
            "pb": g("priceToBook"), "ps": g("priceToSalesTrailing12Months"),
            "evEbitda": g("enterpriseToEbitda"), "evRevenue": g("enterpriseToRevenue"),
            "roe": g("returnOnEquity"), "roa": g("returnOnAssets"),
            "profitMgn": g("profitMargins"), "opMgn": g("operatingMargins"),
            "grossMgn": g("grossMargins"), "ebitdaMgn": g("ebitdaMargins"),
            "eps": g("trailingEps"), "forwardEps": g("forwardEps"),
            "bookValue": g("bookValue"), "de": g("debtToEquity"),
            "cr": g("currentRatio"), "qr": g("quickRatio"),
            "divYield": g("dividendYield"), "payoutRatio": g("payoutRatio"),
            "revGr": g("revenueGrowth"), "earningsGr": g("earningsGrowth"),
            "earningsQGr": g("earningsQuarterlyGrowth"),
            "freeCashflow": g("freeCashflow"), "opCashflow": g("operatingCashflow"),
            "mktCapCr": mkt_cap_cr, "enterprise": g("enterpriseValue"),
            "revenue": g("totalRevenue"), "ebitda": g("ebitda"),
            "totalCash": g("totalCash"), "totalDebt": g("totalDebt"),
            "beta": g("beta"), "sector": g("sector"), "industry": g("industry"),
            "shortName": g("shortName"), "longName": g("longName"),
            "recommendation": g("recommendationKey"),
            "numAnalysts":   g("numberOfAnalystOpinions"),
            "source": "Yahoo Finance", "_ts": time.time(),
        }

    # Run .NS with 20s timeout (increased — YF can be slow)
    result = {}
    if backing_off("yahoo"):
        return result                                   # callers fall back to cached/stale data
    def _run_ns():
        try:
            with _yf_sem:
                result.update(_fetch_ticker(yft))
        except Exception as e:
            if is_rate_limit(e): trip_backoff("yahoo", f"{sym}")
            log.debug(f"{sym} .NS failed: {e}")
    t = threading.Thread(target=_run_ns, daemon=True)
    t.start()
    t.join(timeout=20)

    # If no price from .NS, try .BO (BSE) with 10s timeout
    if not result.get("price") and not backing_off("yahoo"):
        bse = sym + ".BO"
        if bse != yft:
            bo_result = {}
            def _run_bo():
                try:
                    with _yf_sem:
                        bo_result.update(_fetch_ticker(bse))
                except Exception as e:
                    if is_rate_limit(e): trip_backoff("yahoo", f"{sym}.BO")
                    log.debug(f"{sym} .BO failed: {e}")
            t2 = threading.Thread(target=_run_bo, daemon=True)
            t2.start()
            t2.join(timeout=10)
            if bo_result.get("price"):
                log.info(f"{sym}: .NS no price, .BO got {bo_result['price']}")
                for k, v in bo_result.items():
                    if v is not None and not result.get(k):
                        result[k] = v

    # Last-resort: use .history() to get the most recent close price
    # Reliable even when .info and .fast_info are rate-limited or return None
    if not result.get("price") and not backing_off("yahoo"):
        try:
            upstream_calls["yahoo"] += 1
            with _yf_sem:
                hist_df = yf.Ticker(yft).history(period="5d", interval="1d")
            if not hist_df.empty:
                last_close = float(hist_df["Close"].iloc[-1])
                if last_close > 0:
                    result["price"] = round(last_close, 2)
                    result.setdefault("prevClose",
                        round(float(hist_df["Close"].iloc[-2]), 2) if len(hist_df) >= 2 else None)
                    result.setdefault("source", "Yahoo Finance (history)")
                    result.setdefault("_ts", time.time())
                    log.info(f"{sym}: history fallback price={last_close:.2f}")
        except Exception as e:
            if is_rate_limit(e): trip_backoff("yahoo", f"{sym} history")
            log.debug(f"{sym} history fallback failed: {e}")

    if result.get("price"):
        log.info(f"{sym}: price={result.get('price')} pe={result.get('pe')} roe={result.get('roe')}")
    else:
        log.warning(f"YF: no price for {sym} ({yft}) — all sources failed")
    return result


def fetch_yf_price(symbol: str) -> dict:
    """Price-only Yahoo lookup (fast_info, no .info / fallbacks). Used for the 60 s refresh when NSE is unavailable and the
    fundamentals are already cached — the heavy fetch_yf_fundamentals() is for the 6 h fundamentals refresh only."""
    sym = clean_sym(symbol)
    if backing_off("yahoo"):
        return {}
    try:
        upstream_calls["yahoo"] += 1
        with _yf_sem:
            fi = yf.Ticker(to_yf_ticker(sym)).fast_info
            def pv(name):
                try:
                    v = float(getattr(fi, name, None))
                    return v if v > 0 else None
                except (TypeError, ValueError):
                    return None
            price, prev, op = pv("last_price"), pv("previous_close"), pv("open")
            high, low = pv("day_high"), pv("day_low")
        if not price:
            return {}
        out = {"price": price, "open": op, "high": high, "low": low, "prevClose": prev,
               "source": "Yahoo Finance", "_ts": time.time()}
        if prev:
            out["change"] = round(price - prev, 2)
            out["changePct"] = round((price - prev) / prev * 100, 2)
        return out
    except Exception as e:
        if is_rate_limit(e):
            trip_backoff("yahoo", f"{sym} fast_info")
        log.debug(f"YF price failed for {sym}: {e}")
        return {}


# ── Screener.in scraper ───────────────────────────────────────────────────────
async def fetch_screener_data(symbol: str, client: httpx.AsyncClient) -> dict:
    """Cached wrapper: Screener ratios change quarterly, so one result (even an empty one) is kept for 6 h, and the site is left
    alone for a while after it answers 429/403."""
    sym = clean_sym(symbol)
    if sym in scr_cache:
        return scr_cache[sym]
    if backing_off("screener"):
        return {}
    res = await _fetch_screener_uncached(sym, client)
    if res is not None:                       # None = blocked/failed: do not remember it as "no data"
        scr_cache[sym] = res
        return res
    return {}


async def _fetch_screener_uncached(symbol: str, client: httpx.AsyncClient) -> "dict | None":
    """
    Scrapes screener.in for additional ratio data (D/E, CR, ROCE).
    Used to fill gaps in Yahoo Finance data — especially for smaller NSE stocks.
    No API key required.
    """
    sym = clean_sym(symbol)
    for path in [f"company/{sym}/consolidated/", f"company/{sym}/"]:
        try:
            upstream_calls["screener"] += 1
            r = await client.get(
                f"https://www.screener.in/{path}",
                timeout=8.0,
                follow_redirects=True,
            )
            if r.status_code in (403, 429):
                trip_backoff("screener", f"{sym} HTTP {r.status_code}")
                return None
            if r.status_code != 200:
                continue

            html = r.text
            res  = {}

            # Key ratios regex patterns
            patterns = {
                "pe_scr":   r'Stock P/E\s*</span>[^<]*<span[^>]*>\s*([\d.,]+)',
                "pb_scr":   r'Price to book value\s*</span>[^<]*<span[^>]*>\s*([\d.,]+)',
                "roe_scr":  r'Return on equity\s*</span>[^<]*<span[^>]*>\s*([\d.,]+)',
                "roce_scr": r'ROCE\s*</span>[^<]*<span[^>]*>\s*([\d.,]+)',
                "de_scr":   r'Debt to equity\s*</span>[^<]*<span[^>]*>\s*([\d.,]+)',
                "cr_scr":   r'Current ratio\s*</span>[^<]*<span[^>]*>\s*([\d.,]+)',
                "div_scr":  r'Dividend Yield\s*</span>[^<]*<span[^>]*>\s*([\d.,]+)',
                "ev_scr":   r'EV / EBITDA\s*</span>[^<]*<span[^>]*>\s*([\d.,]+)',
            }
            for key, pat in patterns.items():
                m = re.search(pat, html, re.DOTALL | re.IGNORECASE)
                if m:
                    try:
                        res[key] = float(m.group(1).replace(",", ""))
                    except ValueError:
                        pass

            if res:
                res["source_scr"] = "screener.in"
                res["_ts_scr"]    = time.time()

            return res
        except Exception as e:
            log.debug(f"Screener.in {sym} ({path}): {e}")
            return None                       # transient failure: not remembered as "no data"

    return {}

# ── OHLCV history ─────────────────────────────────────────────────────────────
_PERIOD_DAYS = {
    "1d": 1, "5d": 5, "1mo": 30, "3mo": 90, "6mo": 182,
    "1y": 365, "2y": 730, "5y": 1825, "10y": 3650, "ytd": 365, "max": 7300,
}

def _period_to_unix(period: str) -> tuple[int, int]:
    days = _PERIOD_DAYS.get(period, 365)
    now = int(time.time())
    return now - days * 86400, now

async def fetch_ohlcv_history_direct(symbol: str, period: str, interval: str) -> list:
    """
    Fetches OHLCV from Yahoo Finance chart API via direct httpx — no yfinance,
    no crumb/cookie auth required, much more reliable than .history().
    """
    sym = clean_sym(symbol)
    yft = to_yf_ticker(sym)
    period1, period2 = _period_to_unix(period)
    if backing_off("yahoo"):
        return []

    for base in [
        f"https://query1.finance.yahoo.com/v8/finance/chart/{yft}",
        f"https://query2.finance.yahoo.com/v8/finance/chart/{yft}",
    ]:
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                r = await client.get(base, params={
                    "period1": period1, "period2": period2,
                    "interval": interval, "events": "history",
                    "includePrePost": "false",
                }, headers={
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    "Accept": "application/json",
                })
            if r.status_code == 429:
                trip_backoff("yahoo", f"history {sym}")
                return []                       # query2 is the same service: do not double the request
            if r.status_code != 200:
                continue
            d = r.json()
            result = d.get("chart", {}).get("result", [None])[0]
            if not result:
                continue
            timestamps = result.get("timestamp", [])
            q = result.get("indicators", {}).get("quote", [{}])[0]
            opens  = q.get("open",   [])
            highs  = q.get("high",   [])
            lows   = q.get("low",    [])
            closes = q.get("close",  [])
            vols   = q.get("volume", [])
            rows = []
            for i, ts in enumerate(timestamps):
                c = closes[i] if i < len(closes) else None
                if c is None or (isinstance(c, float) and (c != c)):  # NaN check
                    continue
                from datetime import timezone
                dt = datetime.fromtimestamp(ts, tz=timezone.utc)
                rows.append({
                    "date":   dt.strftime("%Y-%m-%d"),
                    "open":   round(float(opens[i]),  2) if i < len(opens)  and opens[i]  else round(float(c), 2),
                    "high":   round(float(highs[i]),  2) if i < len(highs)  and highs[i]  else round(float(c), 2),
                    "low":    round(float(lows[i]),   2) if i < len(lows)   and lows[i]   else round(float(c), 2),
                    "close":  round(float(c), 2),
                    "volume": int(vols[i] or 0) if i < len(vols) else 0,
                })
            if rows:
                log.info(f"History (direct): {sym} → {len(rows)} {interval} bars")
                return rows
        except Exception as e:
            log.debug(f"History direct failed for {sym} ({base}): {e}")
    return []

def fetch_ohlcv_history(symbol: str, period: str, interval: str) -> list:
    """yfinance fallback — used only when direct HTTP fetch fails."""
    sym = clean_sym(symbol)
    yft = to_yf_ticker(sym)
    if backing_off("yahoo"):
        return []
    try:
        upstream_calls["yahoo"] += 1
        with _yf_sem:
            df = yf.Ticker(yft).history(period=period, interval=interval, auto_adjust=True)
        if df.empty:
            return []
        rows = []
        for ts, row in df.iterrows():
            d = ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(ts)[:10]
            rows.append({
                "date":   d,
                "open":   round(float(row["Open"]),  2),
                "high":   round(float(row["High"]),  2),
                "low":    round(float(row["Low"]),   2),
                "close":  round(float(row["Close"]), 2),
                "volume": int(row.get("Volume", 0) or 0),
            })
        return rows
    except Exception as e:
        log.warning(f"History yf fallback failed for {sym}: {e}")
        return []

# ── Merge all sources into one clean response ─────────────────────────────────
def merge_quote(nse: dict, yf_d: dict, scr: dict) -> dict:
    """
    Priority: NSE wins for price fields. YF wins for fundamentals.
    Screener fills gaps in fundamentals.
    """
    # Helper to prefer first non-None value
    def first(*vals):
        for v in vals:
            if v is not None and v != "" and str(v) not in ("None", "N/A"):
                return v
        return None

    # D/E: Yahoo stores as percentage (42.3 = 0.423×), screener stores as ratio
    yf_de  = yf_d.get("de")
    de_val = (yf_de / 100) if yf_de is not None else (scr.get("de_scr"))

    out = {
        # ── Price ──
        "price":       first(nse.get("price"),      yf_d.get("price")),
        "open":        first(nse.get("open"),        yf_d.get("open")),
        "high":        first(nse.get("high"),        yf_d.get("high")),
        "low":         first(nse.get("low"),         yf_d.get("low")),
        "prevClose":   first(nse.get("prevClose"),   yf_d.get("prevClose")),
        "change":      first(nse.get("change"),      yf_d.get("change")),
        "changePct":   first(nse.get("changePct"),   yf_d.get("changePct")),
        "volume":      first(nse.get("volume"),      yf_d.get("volume")),
        "weekHigh52":  first(nse.get("weekHigh52"),  yf_d.get("weekHigh52")),
        "weekLow52":   first(nse.get("weekLow52"),   yf_d.get("weekLow52")),
        "deliveryPct": nse.get("deliveryPct"),
        "totalBuyQty": nse.get("totalBuyQty"),
        "totalSellQty":nse.get("totalSellQty"),
        # ── Meta ──
        "symbol":      first(nse.get("symbol"),     yf_d.get("shortName", "")),
        "companyName": first(nse.get("companyName"), yf_d.get("longName"), yf_d.get("shortName")),
        "isin":        nse.get("isin"),
        "faceValue":   nse.get("faceValue"),
        "sector":      yf_d.get("sector"),
        "industry":    yf_d.get("industry"),
        "website":     yf_d.get("website"),
        "employees":   yf_d.get("employees"),
        "recommendation": yf_d.get("recommendation"),
        "numAnalysts":    yf_d.get("numAnalysts"),
        # ── Valuation ──
        "pe":          first(yf_d.get("pe"),         scr.get("pe_scr")),
        "forwardPE":   yf_d.get("forwardPE"),
        "pb":          first(yf_d.get("pb"),         scr.get("pb_scr")),
        "ps":          yf_d.get("ps"),
        "evEbitda":    first(yf_d.get("evEbitda"),   scr.get("ev_scr")),
        "evRevenue":   yf_d.get("evRevenue"),
        # ── Profitability ──
        "roe":         first(yf_d.get("roe"),        (scr["roe_scr"] / 100 if scr.get("roe_scr") else None)),
        "roce":        (scr["roce_scr"] / 100 if scr.get("roce_scr") else None),
        "roa":         yf_d.get("roa"),
        "profitMgn":   yf_d.get("profitMgn"),
        "opMgn":       yf_d.get("opMgn"),
        "grossMgn":    yf_d.get("grossMgn"),
        "ebitdaMgn":   yf_d.get("ebitdaMgn"),
        # ── Per-share ──
        "eps":         yf_d.get("eps"),
        "forwardEps":  yf_d.get("forwardEps"),
        "bookValue":   yf_d.get("bookValue"),
        # ── Balance sheet ──
        "de":          de_val,
        "cr":          first(yf_d.get("cr"),         scr.get("cr_scr")),
        "qr":          yf_d.get("qr"),
        # ── Dividends ──
        "divYield":    first(yf_d.get("divYield"),   (scr["div_scr"] / 100 if scr.get("div_scr") else None)),
        "payoutRatio": yf_d.get("payoutRatio"),
        # ── Growth ──
        "revGr":       yf_d.get("revGr"),
        "earningsGr":  yf_d.get("earningsGr"),
        "earningsQGr": yf_d.get("earningsQGr"),
        # ── Size ──
        "mktCapCr":    yf_d.get("mktCapCr"),
        "revenue":     yf_d.get("revenue"),
        "ebitda":      yf_d.get("ebitda"),
        "enterprise":  yf_d.get("enterprise"),
        "totalCash":   yf_d.get("totalCash"),
        "totalDebt":   yf_d.get("totalDebt"),
        "freeCashflow":yf_d.get("freeCashflow"),
        "opCashflow":  yf_d.get("opCashflow"),
        # ── Technical ──
        "beta":        yf_d.get("beta"),
        "50dma":       yf_d.get("50dma"),
        "200dma":      yf_d.get("200dma"),
        # ── Provenance ──
        "_sources": {
            "price":        nse.get("source") or (yf_d.get("source") if yf_d.get("price") else "none"),
            "fundamentals": yf_d.get("source", "none"),
            "extras":       scr.get("source_scr", "none"),
        },
        "_freshness": {
            "price_age_sec": round(time.time() - nse["_ts"], 1) if nse.get("_ts") else None,
            "fund_age_sec":  round(time.time() - yf_d["_ts"], 1) if yf_d.get("_ts") else None,
        },
        "_ts": time.time(),
    }

    # Remove None values to keep response lean
    return {k: v for k, v in out.items() if v is not None}

# ── Core orchestrator ─────────────────────────────────────────────────────────
def _price_snapshot(yf_data: dict) -> dict:
    """The price fields of a Yahoo result, in the shape price_cache holds."""
    return {
        "price":     yf_data["price"],
        "open":      yf_data.get("open"),
        "high":      yf_data.get("high"),
        "low":       yf_data.get("low"),
        "prevClose": yf_data.get("prevClose"),
        "change":    yf_data.get("change"),
        "changePct": yf_data.get("changePct"),
        "volume":    yf_data.get("volume"),
        "weekHigh52":yf_data.get("weekHigh52"),
        "weekLow52": yf_data.get("weekLow52"),
        "source":    "Yahoo Finance",
        "_ts":       time.time(),
    }


async def _empty() -> dict:
    return {}


async def get_full_quote(symbol: str, force_refresh: bool = False) -> dict:
    """One shared fetch per symbol at a time: concurrent callers (several browser tabs, /bulk plus /quote) await the same task."""
    sym = clean_sym(symbol)
    task = _inflight.get(sym)
    if task is None:
        task = asyncio.ensure_future(_load_quote(sym, force_refresh))
        _inflight[sym] = task
        task.add_done_callback(lambda _t, _s=sym: _inflight.pop(_s, None))
    return await asyncio.shield(task)


async def _load_quote(sym: str, force_refresh: bool) -> dict:
    cached_price = price_cache.get(sym)
    cached_fund  = fund_cache.get(sym)

    # Full cache hit — both price (60s) and fundamentals (6h) are fresh
    if not force_refresh and cached_price and cached_fund:
        result = merge_quote(cached_price, cached_fund, scr_cache.get(sym, {}))
        result.setdefault("_freshness", {})["cached"] = True
        return result

    # A symbol every source rejected recently is answered from memory, not asked about again.
    if not force_refresh and sym in neg_cache:
        return {"error": "no data found for this symbol", "negative": True}

    need_fund  = force_refresh or not cached_fund
    yf_fresh   = False
    nse_data: dict = {}
    yf_data: dict = {}

    if need_fund:
        # Fundamentals (6 h): Yahoo full lookup + Screener, with the NSE price alongside. The only path that touches all three.
        loop = asyncio.get_running_loop()
        async with httpx.AsyncClient(headers=NSE_HEADERS, follow_redirects=True) as client:
            nse_task      = fetch_nse_price(sym)
            screener_task = fetch_screener_data(sym, client)
            yf_task       = (loop.run_in_executor(None, fetch_yf_fundamentals, sym) if not backing_off("yahoo")
                             else _empty())     # Yahoo is paused: do not even queue a worker thread for it
            nse_data, screener_data, yf_data = await asyncio.gather(
                nse_task, screener_task, yf_task, return_exceptions=True)
        nse_data      = nse_data      if isinstance(nse_data, dict)      else {}
        screener_data = screener_data if isinstance(screener_data, dict) else {}
        yf_data       = yf_data       if isinstance(yf_data, dict)       else {}
        yf_fresh = bool(yf_data)
        if yf_data:
            fund_cache[sym] = yf_data
            stale_fund[sym] = yf_data
        elif sym in stale_fund:
            yf_data = stale_fund[sym]          # Yahoo is backing off: keep the last good fundamentals (their price is not current)
    else:
        # Price-only refresh (60 s): fundamentals and Screener ratios come from cache. NSE first (1 request), then a light Yahoo
        # price, and only if both fail the last good price, flagged stale.
        yf_data = cached_fund
        screener_data = scr_cache.get(sym, {})
        nse_data = await fetch_nse_price(sym)
        if not nse_data:
            loop = asyncio.get_running_loop()
            light = await loop.run_in_executor(None, fetch_yf_price, sym)
            if light.get("price"):
                price_cache[sym] = light
                stale_price[sym] = light
                return merge_quote(light, yf_data, screener_data)

    # ── Populate price_cache (60s TTL): NSE wins, otherwise the price Yahoo returned with the fundamentals ──
    if nse_data:
        price_cache[sym] = nse_data
        stale_price[sym] = nse_data
    elif yf_data.get("price") and need_fund and yf_fresh:
        price_cache[sym] = _price_snapshot(yf_data)
        stale_price[sym] = price_cache[sym]

    price_src = nse_data if nse_data else price_cache.get(sym, {})

    if not price_src.get("price"):
        if sym in stale_price:
            out = merge_quote(stale_price[sym], yf_data, screener_data)
            out.setdefault("_freshness", {})["stale"] = True
            return out
        if yf_data and (yf_data.get("pe") or yf_data.get("mktCapCr")):
            return merge_quote({}, yf_data, screener_data)
        if backing_off("yahoo"):
            # NSE blocking bots says nothing about the symbol, but Yahoo being paused means it was never really asked:
            # do not mark the symbol unknown
            return {"error": "market data providers are rate-limited, try again shortly",
                    "rateLimited": True, "retryAfter": backoff_remaining()}
        neg_cache[sym] = True
        return {"error": "no data found for this symbol", "negative": True}

    return merge_quote(price_src, yf_data, screener_data)

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
def root():
    """
    Root landing page — shows API status and available endpoints.
    Visiting localhost:8766 redirects here instead of 404.
    """
    html = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Portfolio.AI API</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #0f1117; color: #e2e8f0; min-height: 100vh;
         display: flex; align-items: center; justify-content: center; }
  .card { background: #1a1d2e; border: 1px solid #2d3748; border-radius: 16px;
          padding: 40px 48px; max-width: 640px; width: 100%; }
  .badge { display: inline-block; background: #10b981; color: #fff;
           font-size: 11px; font-weight: 700; padding: 3px 10px;
           border-radius: 20px; text-transform: uppercase; letter-spacing: .5px;
           margin-left: 10px; vertical-align: middle; }
  h1 { font-size: 26px; font-weight: 700; color: #fff; margin-bottom: 6px; }
  .sub { color: #718096; font-size: 14px; margin-bottom: 32px; }
  .endpoints { list-style: none; border: 1px solid #2d3748; border-radius: 10px; overflow: hidden; }
  .endpoints li { display: flex; align-items: baseline; gap: 12px;
                  padding: 12px 16px; border-bottom: 1px solid #2d3748; }
  .endpoints li:last-child { border-bottom: none; }
  .method { background: #2d6a4f; color: #74c69d; font-size: 11px; font-weight: 700;
            padding: 2px 8px; border-radius: 4px; font-family: monospace; min-width: 36px;
            text-align: center; }
  .path { font-family: monospace; font-size: 13px; color: #a0aec0; }
  .path a { color: #63b3ed; text-decoration: none; }
  .path a:hover { text-decoration: underline; }
  .desc { color: #718096; font-size: 12px; margin-left: auto; }
  .actions { margin-top: 24px; display: flex; gap: 12px; flex-wrap: wrap; }
  .btn { display: inline-block; padding: 10px 20px; border-radius: 8px;
         font-size: 13px; font-weight: 600; text-decoration: none; transition: opacity .15s; }
  .btn:hover { opacity: .85; }
  .btn-primary { background: #4f46e5; color: #fff; }
  .btn-secondary { background: #2d3748; color: #a0aec0; }
  .note { margin-top: 20px; font-size: 12px; color: #4a5568; }
</style>
</head>
<body>
<div class="card">
  <h1>Portfolio.AI Live API <span class="badge">● Running</span></h1>
  <p class="sub">Real-time NSE market data + fundamentals backend &nbsp;·&nbsp; v2.1</p>
  <ul class="endpoints">
    <li>
      <span class="method">GET</span>
      <span class="path"><a href="/health">/health</a></span>
      <span class="desc">Server status &amp; cache stats</span>
    </li>
    <li>
      <span class="method">GET</span>
      <span class="path"><a href="/quote/RELIANCE">/quote/{symbol}</a></span>
      <span class="desc">Live price + fundamentals</span>
    </li>
    <li>
      <span class="method">GET</span>
      <span class="path"><a href="/bulk?symbols=RELIANCE,TCS,INFY">/bulk?symbols=A,B,C</a></span>
      <span class="desc">Batch up to 200 symbols</span>
    </li>
    <li>
      <span class="method">GET</span>
      <span class="path"><a href="/history/RELIANCE?period=1y&interval=1d">/history/{symbol}</a></span>
      <span class="desc">OHLCV price history</span>
    </li>
    <li>
      <span class="method">GET</span>
      <span class="path"><a href="/docs">/docs</a></span>
      <span class="desc">Interactive API explorer</span>
    </li>
  </ul>
  <div class="actions">
    <a href="/docs" class="btn btn-primary">Open API Docs</a>
    <a href="/health" class="btn btn-secondary">Health Check</a>
    <a href="/quote/RELIANCE" class="btn btn-secondary">Try: RELIANCE</a>
  </div>
  <p class="note">
    Data sources: NSE India (live price) · Yahoo Finance (fundamentals) · Screener.in (ratios)
  </p>
</div>
</body>
</html>"""
    return HTMLResponse(content=html)

@app.get("/health")
def health():
    return {
        "status":        "ok",
        "price_cache":   len(price_cache),
        "fund_cache":    len(fund_cache),
        "hist_cache":    len(hist_cache),
        "server_time":   datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "price_ttl_sec": PRICE_TTL,
        "fund_ttl_hr":   FUND_TTL // 3600,
        "unknown_symbols": len(neg_cache),
        "upstream_calls":  dict(upstream_calls),
        "backing_off":     {k: backing_off(k) for k in _backoff_until},
        "retry_after_sec": backoff_remaining(),
    }

@app.get("/quote/{symbol}")
async def quote(symbol: str, refresh: bool = False):
    """
    Full real-time quote for one NSE symbol.
    Includes: live price (NSE) + all fundamentals (Yahoo Finance + Screener.in).

    Examples:
      /quote/RELIANCE
      /quote/HDFCBANK?refresh=true    (bypass cache)
      /quote/M%26M                    (URL-encode & for M&M)
    """
    try:
        data = await get_full_quote(symbol, force_refresh=refresh)
        if data.get("rateLimited"):
            raise HTTPException(503, detail="Market data providers are rate-limited; retry shortly.",
                                headers={"Retry-After": str(max(1, int(data.get("retryAfter") or backoff_remaining() or 30)))})
        if not data or (not data.get("price") and not data.get("pe") and not data.get("mktCapCr")):
            raise HTTPException(404, detail=f"No live data found for symbol: {symbol}. Check if it's a valid NSE ticker.")
        return data
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Quote error for {symbol}: {e}")
        raise HTTPException(500, detail=str(e))

@app.get("/bulk")
async def bulk_quote(
    symbols: str = Query(..., description="Comma-separated NSE symbols (max 200)"),
    refresh: bool = False,
):
    """
    Fetch up to 200 symbols concurrently.
    Returns a dict keyed by symbol. Per-symbol errors are returned inline.

    Example: /bulk?symbols=RELIANCE,TCS,INFY,HDFCBANK,ICICIBANK,SBIN
    """
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()][:200]  # raised from 50 → 200
    if not sym_list:
        raise HTTPException(400, detail="No valid symbols provided")

    sem = asyncio.Semaphore(MAX_CONCURRENT)

    async def fetch_one(sym: str):
        async with sem:
            try:
                return sym, await get_full_quote(sym, force_refresh=refresh)
            except Exception as e:
                log.warning(f"Bulk: {sym} failed: {e}")
                return sym, {"error": str(e)}

    # Duplicates in the request collapse to one fetch (and the answer is keyed by the symbol as asked).
    uniq = list(dict.fromkeys(sym_list))
    results = await asyncio.gather(*[fetch_one(s) for s in uniq])
    headers = {}
    wait = backoff_remaining()
    if wait:
        headers["Retry-After"] = str(wait)      # the page paces its next refresh from this instead of hammering a paused provider
    return JSONResponse({sym: data for sym, data in results}, headers=headers)

@app.get("/history/{symbol}")
async def history(
    symbol: str,
    period:   str = Query("1y", description="1d 5d 1mo 3mo 6mo 1y 2y 5y 10y ytd max"),
    interval: str = Query("1d", description="1m 2m 5m 15m 30m 60m 90m 1h 1d 5d 1wk 1mo 3mo"),
):
    """
    OHLCV price history for charting.

    Examples:
      /history/RELIANCE?period=1y&interval=1d
      /history/TCS?period=5y&interval=1wk
      /history/INFY?period=3mo&interval=1h
    """
    cache_key = f"{clean_sym(symbol)}|{period}|{interval}"
    if cache_key in neg_cache:
        raise HTTPException(404, detail=f"No history found for {symbol} (period={period}, interval={interval})")
    if cache_key in hist_cache:
        return {"symbol": symbol, "period": period, "interval": interval,
                "rows": hist_cache[cache_key], "cached": True, "count": len(hist_cache[cache_key])}

    # Try direct HTTP first (no yfinance rate limit); fall back to yfinance
    rows = await fetch_ohlcv_history_direct(symbol, period, interval)
    if not rows and not backing_off("yahoo"):
        loop = asyncio.get_running_loop()
        rows = await loop.run_in_executor(None, fetch_ohlcv_history, symbol, period, interval)

    if not rows:
        if backing_off("yahoo"):
            raise HTTPException(503, detail="Market data provider is rate-limited; retry shortly.",
                                headers={"Retry-After": str(backoff_remaining() or 30)})
        neg_cache[cache_key] = True
        raise HTTPException(404, detail=f"No history found for {symbol} (period={period}, interval={interval})")

    hist_cache[cache_key] = rows
    return {"symbol": symbol, "period": period, "interval": interval,
            "rows": rows, "cached": False, "count": len(rows)}

# ── Anthropic Claude proxy ────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

@app.post("/claude")
async def claude_proxy(request: Request):
    """
    Proxy endpoint for Anthropic Claude API.
    Keeps the API key server-side — safe for local use.

    The HTML sends its Claude API request body here instead of directly to
    api.anthropic.com. This server forwards it with the real API key.

    Set your key:  export ANTHROPIC_API_KEY=sk-ant-...
    Then run:      python server.py
    """
    if not ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=500,
            detail=(
                "ANTHROPIC_API_KEY is not set. "
                "Run: export ANTHROPIC_API_KEY=sk-ant-... then restart the server."
            ),
        )
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "Content-Type":      "application/json",
                    "x-api-key":         ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                },
                json=body,
            )
        return r.json()
    except Exception as e:
        log.error(f"Claude proxy error: {e}")
        raise HTTPException(status_code=502, detail=f"Claude API error: {e}")

# ── AI Portfolio Analysis ─────────────────────────────────────────────────────

OLLAMA_CHAT_URL = "http://localhost:11434/api/chat"

# TWO-TIER Arya model strategy:
#   ANALYSIS (fast=false) → llama3.1:latest (8B) — sharper reasoning, better insights
#   CHAT     (fast=true)  → llama3.2:3b (3B)    — low latency follow-up responses
# 8B is ~2× llama3.2:3b latency but far more insightful for page-level analysis.
# 3B stays for chat so typing a question gets a near-instant answer.
OLLAMA_ARYA_MODEL      = "llama3.1:latest"   # 8B — analysis quality
OLLAMA_ARYA_FAST_MODEL = "llama3.2:3b"       # 3B — fast chat replies

# Larger model kept for heavy /ai-analysis endpoint (better reasoning)
OLLAMA_MODEL_PA   = "qwen3:14b"

_PORT_AI_SYSTEM = """You are Arya, an educational portfolio-analysis assistant for Indian retail investors.
You are not a SEBI-registered investment adviser and must not present yourself as one.
Explain portfolio arithmetic and uncertainty in plain Hinglish. Do not recommend buying, selling,
hedging, or changing allocations, and do not promise tax savings or returns. Make clear that
scenario analysis is illustrative, and direct tax or suitability questions to a qualified adviser."""


def _ollama_messages(system: str, prompt: str) -> list[dict]:
    msgs = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})
    return msgs


def _ollama_generate(system: str, prompt: str, max_tokens: int = 600,
                     model: str | None = None) -> str:
    """Blocking Ollama chat call. Used for /ai-analysis (runs in executor)."""
    m = model or OLLAMA_ARYA_MODEL
    resp = httpx.post(
        OLLAMA_CHAT_URL,
        json={
            "model":    m,
            "think":    False,
            "stream":   False,
            "options":  {"temperature": 0.25, "num_predict": max_tokens, "num_ctx": 2560},
            "messages": _ollama_messages(system, prompt),
        },
        timeout=120.0,
    )
    resp.raise_for_status()
    return resp.json().get("message", {}).get("content", "").strip()


def _ollama_generate_messages(messages: list[dict], max_tokens: int = 600,
                              model: str | None = None) -> str:
    """Blocking Ollama chat call with full messages array (multi-turn conversation)."""
    m = model or OLLAMA_ARYA_MODEL
    resp = httpx.post(
        OLLAMA_CHAT_URL,
        json={
            "model":    m,
            "think":    False,
            "stream":   False,
            "options":  {"temperature": 0.25, "num_predict": max_tokens, "num_ctx": 2560},
            "messages": messages,
        },
        timeout=120.0,
    )
    resp.raise_for_status()
    return resp.json().get("message", {}).get("content", "").strip()


# ── /arya — non-streaming fallback ───────────────────────────────────────────
@app.post("/arya")
async def arya_endpoint(request: Request):
    """
    Non-streaming Arya endpoint (fallback).
    Body: { "prompt": "...", "system": "...", "max_tokens": 500 }
        OR { "messages": [{role, content}, ...], "max_tokens": 500 }
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")
    prompt     = body.get("prompt", "")
    system     = body.get("system", _PORT_AI_SYSTEM)
    max_tokens = int(body.get("max_tokens", 500))
    msgs_in    = body.get("messages", None)
    loop       = asyncio.get_running_loop()
    try:
        if msgs_in:
            if not any(m.get("role") == "system" for m in msgs_in):
                msgs_in = [{"role": "system", "content": system}] + msgs_in
            text = await loop.run_in_executor(None, _ollama_generate_messages, msgs_in, max_tokens)
        else:
            if not prompt:
                raise HTTPException(400, "prompt or messages is required")
            text = await loop.run_in_executor(None, _ollama_generate, system, prompt, max_tokens)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, detail=f"Ollama error: {e}")
    return {"response": text}


# ── /arya/stream — SSE streaming endpoint (primary, low perceived latency) ───
import json as _json
from fastapi.responses import StreamingResponse

@app.post("/arya/stream")
async def arya_stream(request: Request):
    """
    SSE streaming Arya endpoint.  Tokens are forwarded to the browser as they
    arrive from Ollama, so the first word appears within ~1 second.

    Body: { "prompt": "...", "system": "...", "max_tokens": 500 }
    Each SSE event: data: {"t": "token"}
    Final event:    data: [DONE]
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    prompt     = body.get("prompt", "")
    system     = body.get("system", _PORT_AI_SYSTEM)
    max_tokens = int(body.get("max_tokens", 500))
    msgs_in    = body.get("messages", None)
    # fast=true → use smaller 3B model with reduced context for low-latency chat responses
    fast_mode  = bool(body.get("fast", False))

    if msgs_in:
        if not any(m.get("role") == "system" for m in msgs_in):
            msgs_in = [{"role": "system", "content": system}] + msgs_in
        stream_messages = msgs_in
    elif prompt:
        stream_messages = _ollama_messages(system, prompt)
    else:
        raise HTTPException(400, "prompt or messages is required")

    # Choose model and context window based on fast flag
    # fast=False → 8B analysis model with 3072 ctx for richer insights
    # fast=True  → 3B chat model with 2048 ctx for low-latency follow-ups
    arya_model   = OLLAMA_ARYA_FAST_MODEL if fast_mode else OLLAMA_ARYA_MODEL
    arya_num_ctx = 1536 if fast_mode else 2560   # 2560 fits full prompt + 700-token output; 37% faster KV fill vs 4096
    arya_temp    = 0.30 if fast_mode else 0.25   # 0.25 = crisp analysis; 0.30 = precise chat (lower = less hallucination)

    async def event_stream():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST", OLLAMA_CHAT_URL,
                    json={
                        "model":    arya_model,
                        "think":    False,
                        "stream":   True,
                        "options":  {"temperature": arya_temp, "num_predict": max_tokens, "num_ctx": arya_num_ctx},
                        "messages": stream_messages,
                    },
                ) as resp:
                    async for raw_line in resp.aiter_lines():
                        if not raw_line.strip():
                            continue
                        try:
                            chunk = _json.loads(raw_line)
                        except Exception:
                            continue
                        token = chunk.get("message", {}).get("content", "")
                        if token:
                            yield f"data: {_json.dumps({'t': token})}\n\n"
                        if chunk.get("done"):
                            break
            yield "data: [DONE]\n\n"
        except Exception as e:
            log.warning(f"Arya stream error: {e}")
            yield f"data: {_json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )


def _compute_sector_hhi(holdings: list[dict]) -> tuple[float, str]:
    """Returns HHI (0-1) and the dominant sector name."""
    sector_totals: dict[str, float] = {}
    total_val = 0.0
    for h in holdings:
        sector = str(h.get("sector") or h.get("industry") or "Unknown")
        val    = float(h.get("value") or h.get("current_value") or h.get("ltp", 0) or 0)
        sector_totals[sector] = sector_totals.get(sector, 0) + val
        total_val += val

    if total_val == 0:
        return 0.0, "Unknown"

    hhi = sum((v / total_val) ** 2 for v in sector_totals.values())
    dominant = max(sector_totals, key=sector_totals.get) if sector_totals else "Unknown"
    return round(hhi, 4), dominant


def _find_tax_loss_candidates(holdings: list[dict]) -> list[dict]:
    """Find holdings with negative unrealised P&L for review; this is not tax advice."""
    candidates = []
    for h in holdings:
        pnl = float(h.get("unrealised_pnl") or h.get("pnl") or h.get("gain") or 0)
        if pnl < -500:  # only flag meaningful losses (>₹500)
            candidates.append({
                "symbol": h.get("symbol") or h.get("name") or "?",
                "pnl":    round(pnl),
            })
    return sorted(candidates, key=lambda x: x["pnl"])[:5]


def _compute_what_if(holdings: list[dict], drop_pct: float = 15.0) -> dict:
    """Estimate portfolio loss if Nifty drops by drop_pct percent."""
    total_val = sum(float(h.get("value") or h.get("current_value") or 0) for h in holdings)

    # Weight by beta (default beta = 1.0 if unknown)
    weighted_loss = 0.0
    for h in holdings:
        beta = float(h.get("beta") or 1.0)
        val  = float(h.get("value") or h.get("current_value") or 0)
        weighted_loss += val * beta * (drop_pct / 100)

    return {
        "scenario":       f"Nifty falls {drop_pct:.0f}%",
        "estimated_loss": round(weighted_loss),
        "portfolio_value": round(total_val),
        "loss_pct":       round(weighted_loss / total_val * 100, 1) if total_val else 0,
    }


def _portfolio_ai_prompt(holdings: list[dict], what_if: dict,
                          tax_candidates: list[dict], hhi: float, dominant_sector: str) -> str:
    total_val    = sum(float(h.get("value") or h.get("current_value") or 0) for h in holdings)
    n_holdings   = len(holdings)
    avg_pnl_pct  = sum(float(h.get("pnl_pct") or h.get("gain_pct") or 0) for h in holdings) / max(1, n_holdings)

    # Top 5 by value
    sorted_h = sorted(holdings, key=lambda x: float(x.get("value") or x.get("current_value") or 0), reverse=True)
    top5_str = "\n".join(
        f"  {h.get('symbol','?'):12} ₹{float(h.get('value') or h.get('current_value') or 0):>10,.0f}  "
        f"beta={h.get('beta','?')}  sector={h.get('sector','?')}"
        for h in sorted_h[:5]
    )

    tax_str = ""
    if tax_candidates:
        tax_str = "Unrealised loss rows to review (do not estimate tax impact):\n" + "\n".join(
            f"  {c['symbol']}: unrealised loss ₹{abs(c['pnl']):,}"
            for c in tax_candidates
        )

    hhi_label = "high concentration" if hhi > 0.35 else "moderate concentration" if hhi > 0.20 else "well diversified"

    return f"""
PORTFOLIO DATA:
Total value:      ₹{total_val:,.0f}
Holdings count:   {n_holdings}
Avg P&L:          {avg_pnl_pct:.1f}%
Sector HHI:       {hhi:.3f} ({hhi_label})
Dominant sector:  {dominant_sector}
Top 5 holdings by value:
{top5_str}

{tax_str}

What-if scenario:
  {what_if['scenario']} → estimated loss ₹{what_if['estimated_loss']:,} ({what_if['loss_pct']}% of portfolio)

Provide a structured AI portfolio analysis in this format:

1. CONCENTRATION OBSERVATION: [describe the measured weights, without a suitability verdict]
2. DATA LIMITS: [state missing or stale inputs]
3. LOSS REVIEW: [identify unrealised losses only; tax treatment depends on current rules and the investor's facts]
4. SCENARIO: [explain the arithmetic and state that it is not a forecast]
5. NEXT QUESTION: [suggest a neutral question to discuss with a qualified adviser]

Each section: at most two short sentences. Use supplied figures only. Never direct a buy, sell,
rebalance, or hedge action. Do not infer current prices, tax eligibility, or suitability.
""".strip()


@app.post("/ai-analysis")
async def ai_portfolio_analysis(request: Request):
    """
    POST /ai-analysis
    Body: {
      holdings: [{symbol, value, sector, beta, pnl_pct, unrealised_pnl}, ...],
      what_if_drop_pct: 15
    }
    Returns: structured AI analysis with streaming support via /ai-analysis/stream.
    """
    try:
        declared_length = request.headers.get("content-length")
        if declared_length and int(declared_length) > 65536:
            raise HTTPException(413, "Request body is too large")
        raw_body = bytearray()
        async for chunk in request.stream():
            raw_body.extend(chunk)
            if len(raw_body) > 65536:
                raise HTTPException(413, "Request body is too large")
        body = json.loads(raw_body)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    if not isinstance(body, dict):
        raise HTTPException(400, "JSON body must be an object")
    raw_holdings = body.get("holdings")
    if not isinstance(raw_holdings, list) or not raw_holdings:
        raise HTTPException(400, "holdings must be a non-empty array")
    if len(raw_holdings) > 30:
        raise HTTPException(400, "At most 30 holdings are supported")

    def _number(record: dict, key: str, default: float, low: float, high: float) -> float:
        value = record.get(key, default)
        if isinstance(value, bool):
            raise HTTPException(400, f"Invalid {key} value")
        try:
            number = float(value)
        except (TypeError, ValueError):
            raise HTTPException(400, f"Invalid {key} value")
        if not math.isfinite(number) or number < low or number > high:
            raise HTTPException(400, f"Invalid {key} value")
        return number

    holdings = []
    for source in raw_holdings:
        if not isinstance(source, dict):
            raise HTTPException(400, "Each holding must be an object")
        symbol = str(source.get("symbol") or "").strip().upper()
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9.&_-]{0,39}", symbol):
            raise HTTPException(400, "Each holding needs a valid symbol")
        value = _number(source, "value", source.get("current_value"), 0.01, 1e15)
        holding = {
            "symbol": symbol,
            "value": value,
            "beta": _number(source, "beta", 1.0, 0.0, 10.0),
            "pnl_pct": _number(source, "pnl_pct", 0.0, -10000.0, 10000.0),
            "unrealised_pnl": _number(source, "unrealised_pnl", 0.0, -1e15, 1e15),
        }
        sector = source.get("sector")
        if sector is not None:
            if not isinstance(sector, str) or len(sector) > 80:
                raise HTTPException(400, "Invalid sector value")
            # Limit model prompt input to plain sector labels; do not pass arbitrary user text through.
            holding["sector"] = re.sub(r"[^A-Za-z0-9 &./()_-]", " ", sector).strip()
        holdings.append(holding)

    total_value = sum(item["value"] for item in holdings)
    if not math.isfinite(total_value) or total_value > 1e16:
        raise HTTPException(400, "Total portfolio value is outside the supported range")
    drop_pct = _number(body, "what_if_drop_pct", 15.0, 0.0, 100.0)

    loop = asyncio.get_running_loop()

    # Enrich with sector/beta from server cache where missing
    async def _enrich_holding(h: dict) -> dict:
        sym = str(h.get("symbol") or "").strip()
        if sym and (not h.get("sector") or not h.get("beta")):
            try:
                cached = fund_cache.get(clean_sym(sym))
                if cached:
                    h.setdefault("sector", cached.get("sector"))
                    h.setdefault("beta",   cached.get("beta"))
                else:
                    # Quick yfinance beta+sector lookup
                    yf_data = await loop.run_in_executor(None, fetch_yf_fundamentals, sym)
                    h.setdefault("sector", yf_data.get("sector"))
                    h.setdefault("beta",   yf_data.get("beta"))
            except Exception:
                pass
        return h

    holdings = await asyncio.gather(*[_enrich_holding(h) for h in holdings[:30]])

    hhi, dominant_sector = _compute_sector_hhi(list(holdings))
    tax_candidates       = _find_tax_loss_candidates(list(holdings))
    what_if              = _compute_what_if(list(holdings), drop_pct)
    prompt               = _portfolio_ai_prompt(list(holdings), what_if,
                                                tax_candidates, hhi, dominant_sector)

    # Call Ollama via chat endpoint using the larger model for deeper analysis
    def _ollama_call():
        try:
            return _ollama_generate(_PORT_AI_SYSTEM, prompt, max_tokens=600, model=OLLAMA_MODEL_PA)
        except Exception as e:
            log.warning("Portfolio analysis model call failed: %s", type(e).__name__)
            return "AI text analysis is temporarily unavailable. Numeric portfolio metrics are still shown above."

    analysis_text = await loop.run_in_executor(None, _ollama_call)

    return {
        "status":          "success",
        "analysis":        analysis_text,
        "metrics": {
            "total_holdings":   len(holdings),
            "sector_hhi":       hhi,
            "dominant_sector":  dominant_sector,
            "concentration":    "high" if hhi > 0.35 else "moderate" if hhi > 0.20 else "low",
            "tax_candidates":   tax_candidates,
            "what_if_scenario": what_if,
        },
    }


# ── Run ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    log.info("=" * 60)
    log.info("  Portfolio.AI Live API  v2.0")
    log.info(f"  http://localhost:{PORT}")
    log.info(f"  Docs: http://localhost:{PORT}/docs")
    log.info("=" * 60)
    uvicorn.run(
        "server:app",
        host="127.0.0.1",
        port=PORT,
        reload=False,
        log_level="warning",  # suppress uvicorn noise; our logger handles it
        workers=1,            # single worker is fine; asyncio handles all concurrency
    )
