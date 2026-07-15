"""
Arya AI — FastAPI Server  (port 7475)
Standalone for every endpoint except /api/portfolio/summary, which is the one
place this service reads from Supabase (same project the rest of FIN-OS uses)
to look up a user's real holdings — everything else here is public market
data with no user namespace, no auth needed.
Depends only on: Ollama (local), SQLite (local), public free APIs, Supabase
(portfolio endpoint only).

Run:  ./start.sh   OR   uvicorn server:app --host 0.0.0.0 --port 7475 --reload
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))   # allow sibling imports

import time
import json
import asyncio
import threading
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, Header, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, Response
from pydantic import BaseModel

from config import PORT, HOST, CORS_ORIGINS, OLLAMA_BASE, OLLAMA_MODEL, TTL_QUOTE
from db.store import init_db, delete_stale, get_recent_news
from data.market import (
    get_quote, get_multiple_quotes, get_market_overview,
    get_mf_nav, search_mf, get_commodities, get_crypto,
    get_fx_rates, get_historical, get_market_status,
)
from data.news import fetch_news, web_search, read_url, get_announcements
from data.portfolio import get_portfolio_summary
from intelligence.technical import analyze, multi_timeframe_summary
from intelligence.sentiment import aggregate_sentiment
from reports.generator import quote_report, market_overview_report, portfolio_excel
from auth import verify_user_matches, AuthError
from tts import synthesize as tts_synthesize
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


# ── Live price WebSocket ──────────────────────────────────────────────────────
# Connect: ws://localhost:7475/ws/prices?symbols=RELIANCE,TCS&exchange=NSE
# Re-subscribe anytime by sending {"symbols": ["INFY","WIPRO"]} as a text frame —
# no need to reconnect. Pushes every TTL_QUOTE seconds (matches get_quote's own
# cache freshness — pushing faster wouldn't return fresher data, just re-serve
# the same cached quote).

@app.websocket("/ws/prices")
async def ws_prices(websocket: WebSocket,
                    symbols: str = Query(""),
                    exchange: str = Query("NSE")):
    await websocket.accept()
    watched = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    exch = exchange.upper()

    async def _recv_resubscribe():
        nonlocal watched, exch
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                new_symbols = msg.get("symbols")
                if isinstance(new_symbols, list):
                    watched = [str(s).strip().upper() for s in new_symbols if str(s).strip()]
                if isinstance(msg.get("exchange"), str):
                    exch = msg["exchange"].upper()
            except (json.JSONDecodeError, AttributeError):
                pass  # ignore malformed frames rather than dropping the connection

    recv_task = asyncio.create_task(_recv_resubscribe())
    try:
        while True:
            if watched:
                quotes = get_multiple_quotes(watched, exch)
                await websocket.send_json({"type": "tick", "ts": int(time.time()), "quotes": quotes})
            await asyncio.sleep(TTL_QUOTE)
    except WebSocketDisconnect:
        pass
    finally:
        recv_task.cancel()


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
# format=html (default) or format=pdf. PDF needs WeasyPrint + Pango — see
# reports/generator.py's module docstring for the brew install + DYLD_LIBRARY_PATH
# requirement this depends on (start.sh sets it; running uvicorn directly won't).

_REPORT_MEDIA = {"html": "text/html", "pdf": "application/pdf"}


@app.get("/api/report/quote/{symbol}")
def report_quote(symbol: str, exchange: str = Query("NSE"), format: str = Query("html")):
    """Generate and return a stock report (HTML or PDF)."""
    fmt = format.lower()
    if fmt not in _REPORT_MEDIA:
        raise HTTPException(status_code=400, detail=f"format must be one of {list(_REPORT_MEDIA)}")
    q  = get_quote(symbol.upper(), exchange.upper())
    ta = analyze(symbol.upper(), exchange.upper())
    if "error" in q:
        raise HTTPException(status_code=404, detail=q["error"])
    path = quote_report(q, ta, fmt=fmt)
    return FileResponse(path, media_type=_REPORT_MEDIA[fmt],
                        headers={"Content-Disposition": f"inline; filename={symbol}_report.{fmt}"})


@app.get("/api/report/market")
def report_market(format: str = Query("html")):
    """Generate market overview report (HTML or PDF)."""
    fmt = format.lower()
    if fmt not in _REPORT_MEDIA:
        raise HTTPException(status_code=400, detail=f"format must be one of {list(_REPORT_MEDIA)}")
    ov    = get_market_overview()
    comm  = get_commodities()
    cry   = get_crypto()
    news  = fetch_news()
    path  = market_overview_report(ov, comm, cry, news, fmt=fmt)
    return FileResponse(path, media_type=_REPORT_MEDIA[fmt],
                        headers={"Content-Disposition": f"inline; filename=market_overview.{fmt}"})


# ── Text-to-Speech ──────────────────────────────────────────────────────────────
# Edge Neural voices, not browser speechSynthesis — the same engine
# voiceagent/agent.py already uses, genuinely natural-sounding (Microsoft's
# Azure neural TTS) rather than a robotic OS voice. In-memory bytes, no temp
# file — unlike the report endpoints above, there's nothing here worth
# persisting to disk.
class TTSRequest(BaseModel):
    text: str
    lang: str = "english"


@app.post("/api/tts")
async def text_to_speech(req: TTSRequest):
    text = req.text.strip()[:2000]   # edge-tts has no hard limit, but cap to keep latency sane
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    try:
        audio = await tts_synthesize(text, req.lang)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"TTS failed: {e}")
    return Response(content=audio, media_type="audio/mpeg")


# ── Portfolio (the only endpoint here that touches Supabase / needs auth) ──────

def _bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization[7:].strip()


@app.get("/api/portfolio/summary")
def portfolio_summary(user_id: str = Query(...), authorization: Optional[str] = Header(None)):
    """
    Aggregated portfolio summary for one user — holdings pulled from Supabase,
    each position's price refreshed live via get_quote() (so this is real
    valuation, not a stale current_price column). Requires a Supabase session
    token belonging to user_id — every other endpoint in this file is public
    market data with no namespace, this is the one that needed real auth.
    """
    try:
        verify_user_matches(_bearer_token(authorization), user_id)
    except AuthError as e:
        raise HTTPException(status_code=403, detail=f"unauthorized: {e}")

    result = get_portfolio_summary(user_id)
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@app.get("/api/portfolio/export")
def portfolio_export(user_id: str = Query(...), authorization: Optional[str] = Header(None)):
    """
    Same data as /api/portfolio/summary, as a downloadable .xlsx — holdings +
    unrealized P&L. NOT a capital-gains tax computation (no purchase-date
    column exists on holdings anywhere in this codebase to classify STCG vs
    LTCG from — see reports/generator.py's portfolio_excel() docstring).
    """
    try:
        verify_user_matches(_bearer_token(authorization), user_id)
    except AuthError as e:
        raise HTTPException(status_code=403, detail=f"unauthorized: {e}")

    result = get_portfolio_summary(user_id)
    if "error" in result:
        raise HTTPException(status_code=502, detail=result["error"])

    path = portfolio_excel(result)
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": f"attachment; filename=portfolio_{user_id[:8]}.xlsx"})


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
    "generate_report":  lambda a: _generate_report_tool(a),
}


def _generate_report_tool(args: dict) -> dict:
    """
    Returns a report URL for the frontend to open in a new tab (per the
    original spec: "opens in new tab or downloads") rather than streaming file
    bytes through this JSON gateway — the actual generation+serving already
    works via the REST endpoints below, this just points at them.
    Scoped to "quote" and "market" only — both are public data, no auth. A
    "portfolio" report type is deliberately NOT exposed here: that data is
    per-user and the real endpoint requires a verified Supabase token this
    generic, unauthenticated tool gateway has no way to carry. Use
    GET /api/portfolio/export directly (with the user's own auth) for that.
    """
    report_type = args.get("type", "")
    fmt = args.get("format", "html")
    if fmt not in ("html", "pdf"):
        return {"error": f"format must be html or pdf, got {fmt!r}"}

    base = f"http://localhost:{PORT}"
    if report_type == "quote":
        symbol = args.get("symbol")
        if not symbol:
            return {"error": "type=quote requires a symbol"}
        url = f"{base}/api/report/quote/{symbol.upper()}?format={fmt}"
    elif report_type == "market":
        url = f"{base}/api/report/market?format={fmt}"
    else:
        return {"error": f"type must be 'quote' or 'market', got {report_type!r}"}

    return {"report_url": url, "opens_in": "new_tab", "format": fmt}

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
