"""
Arya AI — FastAPI Server  (port 7475)
100% standalone. No dependency on voice AI, alerts, or other FIN-OS modules.
Depends only on: Ollama (local), SQLite (local), public free APIs.

Run:  ./start.sh   OR   uvicorn server:app --host 0.0.0.0 --port 7475 --reload
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))   # allow sibling imports

import time
import json
import asyncio
import threading
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel

from config import PORT, HOST, CORS_ORIGINS, OLLAMA_BASE, OLLAMA_MODEL
from db.store import init_db, delete_stale, get_recent_news
from data.market import (
    get_quote, get_multiple_quotes, get_market_overview,
    get_mf_nav, search_mf, get_commodities, get_crypto,
    get_fx_rates, get_historical, get_market_status,
)
from data.news import fetch_news, web_search, read_url, get_announcements
from intelligence.technical import analyze, multi_timeframe_summary
from intelligence.sentiment import aggregate_sentiment
from reports.generator import quote_report, market_overview_report
import data.cache as cache

# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Arya AI",
    description="FIN-OS Arya AI backend — real-time Indian market data, web search, TA",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS + ["*"],   # dev: open; restrict in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    init_db()
    # Warm cache in background
    threading.Thread(target=_warm_cache, daemon=True).start()
    # Schedule stale-row cleanup every hour
    asyncio.get_event_loop().call_later(3600, _cleanup_stale)


def _warm_cache():
    try:
        get_market_overview()
        fetch_news()
        get_commodities()
    except Exception:
        pass


def _cleanup_stale():
    try:
        delete_stale("news_cache",    86400)
        delete_stale("search_cache",  3600)
        delete_stale("technical_cache", 3600)
        cache.purge(3600)
    except Exception:
        pass


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok", "service": "Arya AI", "version": "1.0.0",
            "cache_size": cache.size()}


@app.get("/health")
def health():
    return {"status": "ok", "ts": int(time.time())}


# ── Market status ─────────────────────────────────────────────────────────────

@app.get("/api/market/status")
def market_status():
    return get_market_status()


@app.get("/api/market/overview")
def market_overview():
    return get_market_overview()


# ── Quotes ────────────────────────────────────────────────────────────────────

@app.get("/api/quote/{symbol}")
def quote(symbol: str, exchange: str = Query("NSE")):
    """Live quote for any NSE/BSE symbol. e.g. /api/quote/RELIANCE?exchange=NSE"""
    return get_quote(symbol.upper(), exchange.upper())


@app.get("/api/quotes")
def bulk_quotes(symbols: str = Query(..., description="Comma-separated symbols"),
                exchange: str = Query("NSE")):
    """Bulk quotes. e.g. /api/quotes?symbols=RELIANCE,INFY,TCS"""
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    return {"quotes": get_multiple_quotes(syms, exchange)}


# ── Historical OHLCV ──────────────────────────────────────────────────────────

@app.get("/api/history/{symbol}")
def history(symbol: str,
            period: str   = Query("1y", description="1d 5d 1mo 3mo 6mo 1y 2y 5y"),
            interval: str = Query("1d", description="1m 5m 15m 1h 1d 1wk 1mo"),
            exchange: str = Query("NSE")):
    return get_historical(symbol.upper(), period, interval, exchange.upper())


# ── Technical Analysis ────────────────────────────────────────────────────────

@app.get("/api/analyze/{symbol}")
def technical_analysis(symbol: str, exchange: str = Query("NSE")):
    """Full TA: RSI, MACD, Bollinger, EMA, SMA200, ADX, Volume."""
    return analyze(symbol.upper(), exchange.upper())


@app.get("/api/analyze/{symbol}/multi")
def multi_tf_analysis(symbol: str, exchange: str = Query("NSE")):
    """Short / medium / long-term TA summary."""
    return multi_timeframe_summary(symbol.upper(), exchange.upper())


# ── Mutual Funds ──────────────────────────────────────────────────────────────

@app.get("/api/mf/nav/{scheme_code}")
def mf_nav(scheme_code: str):
    return get_mf_nav(scheme_code)


@app.get("/api/mf/search")
def mf_search(q: str = Query(..., description="Fund name or house"), limit: int = Query(10)):
    return {"results": search_mf(q, limit)}


# ── Commodities & FX ─────────────────────────────────────────────────────────

@app.get("/api/commodities")
def commodities():
    return get_commodities()


@app.get("/api/fx")
def fx_rates():
    return get_fx_rates()


# ── Crypto ────────────────────────────────────────────────────────────────────

@app.get("/api/crypto")
def crypto(coins: str = Query("bitcoin,ethereum,ripple,dogecoin,matic-network")):
    coin_list = [c.strip() for c in coins.split(",") if c.strip()]
    return get_crypto(coin_list)


# ── News ─────────────────────────────────────────────────────────────────────

@app.get("/api/news")
def news(limit: int = Query(20), force: bool = Query(False)):
    articles = fetch_news(force=force)
    sentiment = aggregate_sentiment(articles)
    return {
        "articles": articles[:limit],
        "sentiment": sentiment,
        "count": len(articles),
    }


@app.get("/api/news/announcements")
def announcements(symbol: Optional[str] = Query(None), limit: int = Query(10)):
    return {"announcements": get_announcements(symbol, limit)}


# ── Web Search ────────────────────────────────────────────────────────────────

@app.get("/api/search")
def search(q: str = Query(..., description="Search query"),
           max_results: int = Query(5)):
    """DuckDuckGo web search — no API key needed."""
    results = web_search(q, max_results)
    return {"query": q, "results": results}


@app.get("/api/read")
def read_page(url: str = Query(...), max_chars: int = Query(3000)):
    """Extract clean text from any URL. Used by the agent's read_url tool."""
    return {"url": url, "content": read_url(url, max_chars)}


# ── Reports ───────────────────────────────────────────────────────────────────

@app.get("/api/report/quote/{symbol}")
def report_quote(symbol: str, exchange: str = Query("NSE")):
    """Generate and return an HTML stock report."""
    q  = get_quote(symbol.upper(), exchange.upper())
    ta = analyze(symbol.upper(), exchange.upper())
    if "error" in q:
        raise HTTPException(status_code=404, detail=q["error"])
    path = quote_report(q, ta)
    return FileResponse(path, media_type="text/html",
                        headers={"Content-Disposition": f"inline; filename={symbol}_report.html"})


@app.get("/api/report/market")
def report_market():
    """Generate market overview report."""
    ov    = get_market_overview()
    comm  = get_commodities()
    cry   = get_crypto()
    news  = fetch_news()
    path  = market_overview_report(ov, comm, cry, news)
    return FileResponse(path, media_type="text/html",
                        headers={"Content-Disposition": "inline; filename=market_overview.html"})


# ── Agent Tool Gateway ────────────────────────────────────────────────────────
# Single endpoint: arya-sidebar-panel.js calls POST /api/tool with {name, args}
# This decouples the JS agent from knowing each individual endpoint.

class ToolCall(BaseModel):
    name: str
    args: dict = {}

_TOOL_MAP = {
    "get_quote":        lambda a: get_quote(a.get("symbol","NIFTY"), a.get("exchange","NSE")),
    "get_quotes":       lambda a: {"quotes": get_multiple_quotes(
                                       a.get("symbols",[]), a.get("exchange","NSE"))},
    "get_market":       lambda a: get_market_overview(),
    "get_commodities":  lambda a: get_commodities(),
    "get_crypto":       lambda a: get_crypto(a.get("coins")),
    "get_fx":           lambda a: get_fx_rates(),
    "get_mf_nav":       lambda a: get_mf_nav(a.get("scheme_code","")),
    "search_mf":        lambda a: {"results": search_mf(a.get("query",""), a.get("limit",10))},
    "get_history":      lambda a: get_historical(
                                       a.get("symbol",""), a.get("period","1y"),
                                       a.get("interval","1d"), a.get("exchange","NSE")),
    "analyze_stock":    lambda a: analyze(a.get("symbol",""), a.get("exchange","NSE")),
    "multi_tf":         lambda a: multi_timeframe_summary(a.get("symbol",""), a.get("exchange","NSE")),
    "get_news":         lambda a: {"articles": fetch_news()[:a.get("limit",15)],
                                   "sentiment": aggregate_sentiment(fetch_news())},
    "search_web":       lambda a: {"results": web_search(a.get("query",""), a.get("max",5))},
    "read_url":         lambda a: {"content": read_url(a.get("url",""), a.get("max_chars",3000))},
    "get_announcements":lambda a: {"announcements": get_announcements(
                                       a.get("symbol"), a.get("limit",10))},
    "market_status":    lambda a: get_market_status(),
}

@app.post("/api/tool")
def tool_gateway(call: ToolCall):
    """
    Universal tool gateway for arya-sidebar-panel.js agent.
    POST /api/tool  body: {"name": "get_quote", "args": {"symbol": "RELIANCE"}}
    """
    fn = _TOOL_MAP.get(call.name)
    if not fn:
        raise HTTPException(status_code=404, detail=f"Unknown tool: {call.name}")
    try:
        result = fn(call.args)
        return {"tool": call.name, "result": result, "ts": int(time.time())}
    except Exception as e:
        return {"tool": call.name, "error": str(e), "ts": int(time.time())}


# ── Cache management ──────────────────────────────────────────────────────────

@app.post("/api/cache/clear")
def clear_cache():
    cache.purge(0)
    return {"cleared": True}


@app.get("/api/cache/stats")
def cache_stats():
    return {"memory_entries": cache.size()}


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host=HOST, port=PORT, reload=True, log_level="info")
