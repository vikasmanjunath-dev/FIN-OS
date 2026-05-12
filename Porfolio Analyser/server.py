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
import time
import re
import logging
import os
from datetime import datetime

import httpx
import yfinance as yf
import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from cachetools import TTLCache

# ── Config ────────────────────────────────────────────────────────────────────
PRICE_TTL      = 60          # seconds
FUND_TTL       = 6 * 3600    # 6 hours
HISTORY_TTL    = 300         # 5 min
MAX_CONCURRENT = 20          # raised from 10 — handles 77+ symbols concurrently
PORT           = 8766

NSE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/",
    "X-Requested-With": "XMLHttpRequest",
    "DNT": "1",
}

# ── App + caches ──────────────────────────────────────────────────────────────
app = FastAPI(title="Portfolio.AI Live API", version="2.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

price_cache = TTLCache(maxsize=500, ttl=PRICE_TTL)
fund_cache  = TTLCache(maxsize=500, ttl=FUND_TTL)
hist_cache  = TTLCache(maxsize=200, ttl=HISTORY_TTL)

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

def to_yf_ticker(symbol: str) -> str:
    s = symbol.upper().strip().replace("-EQ", "").replace("-BE", "")
    return _YF_OVERRIDES.get(s, f"{s}.NS")

def clean_sym(symbol: str) -> str:
    return symbol.upper().strip().replace("-EQ", "").replace("-BE", "")

# ── NSE live price ────────────────────────────────────────────────────────────
async def fetch_nse_price(symbol: str, client: httpx.AsyncClient) -> dict:
    """
    Fetches real-time price from NSE's official equity quote API.
    NSE requires a session cookie obtained from the homepage first.
    """
    sym = clean_sym(symbol)
    try:
        # Cookie dance — NSE rejects requests without a prior homepage hit
        await client.get(
            "https://www.nseindia.com/",
            headers=NSE_HEADERS,
            timeout=5.0,
        )
        r = await client.get(
            f"https://www.nseindia.com/api/quote-equity?symbol={sym}",
            headers=NSE_HEADERS,
            timeout=6.0,
        )
        if r.status_code != 200:
            log.debug(f"NSE {sym}: HTTP {r.status_code}")
            return {}

        d    = r.json()
        pi   = d.get("priceInfo", {})
        si   = d.get("securityInfo", {})
        meta = d.get("metadata", {})
        whl  = pi.get("weekHighLow", {})
        idhl = pi.get("intraDayHighLow", {})

        return {
            "price":       pi.get("lastPrice"),
            "open":        pi.get("open"),
            "high":        idhl.get("max"),
            "low":         idhl.get("min"),
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
        log.warning(f"NSE price failed for {sym}: {e}")
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
        except Exception:
            pass

        # .info: fundamentals (PE, ROE, margins) — can fail for some tickers
        info = {}
        try:
            info = ticker.info or {}
        except Exception as e:
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
            "source": "Yahoo Finance", "_ts": time.time(),
        }

    # Run .NS with 15s timeout
    result = {}
    def _run_ns():
        try: result.update(_fetch_ticker(yft))
        except Exception as e: log.debug(f"{sym} .NS failed: {e}")
    t = threading.Thread(target=_run_ns, daemon=True)
    t.start()
    t.join(timeout=15)

    # If no price from .NS, try .BO (BSE) with 8s timeout
    if not result.get("price"):
        bse = sym + ".BO"
        if bse != yft:
            bo_result = {}
            def _run_bo():
                try: bo_result.update(_fetch_ticker(bse))
                except Exception as e: log.debug(f"{sym} .BO failed: {e}")
            t2 = threading.Thread(target=_run_bo, daemon=True)
            t2.start()
            t2.join(timeout=8)
            if bo_result.get("price"):
                log.info(f"{sym}: .NS no price, .BO got {bo_result['price']}")
                # .BO price fills the gap; keep .NS fundamentals if available
                for k, v in bo_result.items():
                    if v is not None and not result.get(k):
                        result[k] = v

    if result:
        log.info(f"{sym}: price={result.get('price')} pe={result.get('pe')} roe={result.get('roe')}")
    else:
        log.warning(f"YF: no data at all for {sym} ({yft})")
    return result


# ── Screener.in scraper ───────────────────────────────────────────────────────
async def fetch_screener_data(symbol: str, client: httpx.AsyncClient) -> dict:
    """
    Scrapes screener.in for additional ratio data (D/E, CR, ROCE).
    Used to fill gaps in Yahoo Finance data — especially for smaller NSE stocks.
    No API key required.
    """
    sym = clean_sym(symbol)
    for path in [f"company/{sym}/consolidated/", f"company/{sym}/"]:
        try:
            r = await client.get(
                f"https://www.screener.in/{path}",
                timeout=8.0,
                follow_redirects=True,
            )
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

    return {}

# ── OHLCV history ─────────────────────────────────────────────────────────────
def fetch_ohlcv_history(symbol: str, period: str, interval: str) -> list:
    sym = clean_sym(symbol)
    yft = to_yf_ticker(sym)
    try:
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
        log.warning(f"History failed for {sym}: {e}")
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
        "numAnalysts": yf_d.get("numAnalysts"),
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
            "price":        nse.get("source", "none"),
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
async def get_full_quote(symbol: str, force_refresh: bool = False) -> dict:
    sym = clean_sym(symbol)

    cached_price = price_cache.get(sym)
    cached_fund  = fund_cache.get(sym)

    # Cache hit
    if not force_refresh and cached_price and cached_fund:
        result = merge_quote(cached_price, cached_fund, {})
        result.setdefault("_freshness", {})["cached"] = True
        return result

    # Run all 3 sources concurrently
    loop = asyncio.get_running_loop()
    async with httpx.AsyncClient(headers=NSE_HEADERS, follow_redirects=True) as client:
        nse_task      = fetch_nse_price(sym, client)
        screener_task = fetch_screener_data(sym, client)
        yf_task       = loop.run_in_executor(None, fetch_yf_fundamentals, sym)

        nse_data, screener_data, yf_data = await asyncio.gather(
            nse_task, screener_task, yf_task, return_exceptions=True
        )

    # Handle exceptions from gather
    nse_data      = nse_data      if isinstance(nse_data, dict)      else {}
    screener_data = screener_data if isinstance(screener_data, dict) else {}
    yf_data       = yf_data       if isinstance(yf_data, dict)       else {}

    if nse_data:
        price_cache[sym] = nse_data
    if yf_data:
        fund_cache[sym] = yf_data

    return merge_quote(nse_data, yf_data, screener_data)

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status":        "ok",
        "price_cache":   len(price_cache),
        "fund_cache":    len(fund_cache),
        "hist_cache":    len(hist_cache),
        "server_time":   datetime.utcnow().isoformat() + "Z",
        "price_ttl_sec": PRICE_TTL,
        "fund_ttl_hr":   FUND_TTL // 3600,
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

    results = await asyncio.gather(*[fetch_one(s) for s in sym_list])
    return {sym: data for sym, data in results}

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
    if cache_key in hist_cache:
        return {"symbol": symbol, "period": period, "interval": interval,
                "rows": hist_cache[cache_key], "cached": True, "count": len(hist_cache[cache_key])}

    loop = asyncio.get_running_loop()
    rows = await loop.run_in_executor(None, fetch_ohlcv_history, symbol, period, interval)

    if not rows:
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
        host="0.0.0.0",
        port=PORT,
        reload=False,
        log_level="warning",  # suppress uvicorn noise; our logger handles it
        workers=1,            # single worker is fine; asyncio handles all concurrency
    )